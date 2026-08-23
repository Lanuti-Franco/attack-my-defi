import { ScenarioEngine } from '../simulation/scenarioEngine'
import { releaseForkLock } from '../simulation/forkLock'
import { vectorsFor, type AttackVector } from './vectors'
import { ensureModel } from './localModel'
import { severity, searchThreshold } from './liquidator'
import { searchCombination, type KnownVector } from './combined'
import { RISK_PROFILES, recommendFor, type Recommendation } from '../simulation/riskProfiles'
import type { Strategy, AuditEvent, RecommendationView } from '../schemas/strategy'

/**
 * Corre todos los vectores contra la misma posición y cierra con qué hacer.
 *
 * Un ataque suelto responde "¿esto me puede pasar?". La auditoría completa
 * responde la pregunta que de verdad importa: de todo lo que puede matarte,
 * qué es lo más cercano, y cuánta deuda tenés que sacarte de encima para dormir
 * tranquilo.
 */
export async function* runAudit(opts: {
  strategy: Strategy
  modelId?: string
}): AsyncGenerator<AuditEvent> {
  const engine = new ScenarioEngine()

  try {
    yield* audit(engine, opts)
  } finally {
    // Si esto no corre, el próximo intento se choca con un lock que ya no
    // guarda nada. Va en finally porque el generador puede abandonarse a mitad
    // —una pestaña que se cierra corta el stream— y ahí no hay retorno normal.
    releaseForkLock()
  }
}

async function* audit(
  engine: ScenarioEngine,
  opts: { strategy: Strategy; modelId?: string },
): AsyncGenerator<AuditEvent> {
  const base = await engine.setup(opts.strategy)

  yield {
    type: 'position',
    collateralUsd: base.collateralUsd,
    debtUsd: base.debtUsd,
    healthFactor: base.healthFactor,
    liquidationThreshold: base.liquidationThreshold,
  }

  if (base.debtUsd < 1) {
    yield {
      type: 'error',
      message: 'The position has no debt, so it cannot be liquidated. Borrow something first.',
    }
    return
  }

  const modelId = opts.modelId ?? (await ensureModel())
  const vectors = vectorsFor(opts.strategy)
  const thresholds = new Map<string, number | null>()

  yield {
    type: 'auditStart',
    vectors: vectors.map((v) => ({ id: v.id, label: v.label })),
  }

  for (const vector of vectors) {
    yield { type: 'vectorStart', vectorId: vector.id, label: vector.label, premise: vector.premise }

    // Se consume el generador paso a paso para que cada simulación llegue al
    // feed apenas ocurre, en vez de aparecer todas juntas al terminar el vector.
    const search = searchThreshold({ engine, vector, modelId, base, strategy: opts.strategy })
    let step = await search.next()
    while (!step.done) {
      const probe = step.value
      yield {
        type: 'attempt',
        vectorId: vector.id,
        label: vector.format(probe.intensity),
        intensity: probe.intensity,
        healthFactor: probe.healthFactor,
        verdict: probe.liquidated ? 'LIQUIDATABLE' : 'SURVIVED',
        collateralUsd: probe.collateralUsd,
        rationale: probe.rationale,
      }
      step = await search.next()
    }
    const outcome = step.value

    yield {
      type: 'vectorDone',
      vectorId: vector.id,
      label: vector.label,
      threshold: outcome.threshold,
      thresholdLabel: outcome.thresholdLabel,
      attackerProfitUsd: outcome.attackerProfitUsd,
      steps: outcome.probes.length,
      severity: outcome.threshold === null ? null : severity(outcome.threshold, vector),
      survivedMessage: vector.survivedMessage,
    }

    thresholds.set(vector.id, outcome.threshold)
  }

  // El combinado va último a propósito: necesita saber cuánto aguantó cada
  // ataque por separado para poder pedir intensidades que solas no alcancen.
  yield* combinedPhase(engine, vectors, thresholds, modelId)

  // Las recomendaciones se despejan de la fórmula y después se verifican
  // simulando la posición ajustada: el número que se muestra tiene que
  // sobrevivir de verdad, no sólo en el papel.
  const recommendations: RecommendationView[] = []
  for (const profile of RISK_PROFILES) {
    const rec = recommendFor({
      profile,
      collateralUsd: base.collateralUsd,
      debtUsd: base.debtUsd,
      liquidationThreshold: base.liquidationThreshold,
    })

    const verifiedHf = await verifyRecommendation(engine, opts.strategy, profile, rec)
    recommendations.push({
      profileId: profile.id,
      profileLabel: profile.label,
      benchmark: profile.benchmark,
      maxDebtUsd: rec.maxDebtUsd,
      repayUsd: rec.repayUsd,
      alreadySafe: rec.alreadySafe,
      resultingHealthFactor: verifiedHf ?? rec.resultingHealthFactor,
    })
  }

  yield { type: 'recommendations', recommendations }
}

/**
 * Rearma la posición con la deuda recomendada y le aplica el escenario del
 * perfil, para confirmar que efectivamente sobrevive. Devuelve el health factor
 * que reportó Aave, o null si no se pudo verificar.
 */
async function verifyRecommendation(
  engine: ScenarioEngine,
  strategy: Strategy,
  profile: (typeof RISK_PROFILES)[number],
  rec: Recommendation,
): Promise<number | null> {
  if (rec.alreadySafe) {
    const result = await engine.run(profile.scenario(strategy))
    return result.state.healthFactor
  }

  // La deuda recomendada está en USD; la posición se arma en unidades del
  // activo, así que se convierte con el precio que ya conocemos de la posición.
  const original = await engine.baseline()
  const debtUnitPrice = original.debtUsd / strategy.debt.amount
  const safeAmount = rec.maxDebtUsd / debtUnitPrice

  try {
    const adjusted: Strategy = {
      collateral: strategy.collateral,
      debt: { asset: strategy.debt.asset, amount: Number(safeAmount.toFixed(6)) },
    }
    await engine.setup(adjusted)
    const result = await engine.run(profile.scenario(adjusted))
    return result.state.healthFactor
  } catch {
    return null
  } finally {
    // Se deja el motor como estaba para que el resto del informe siga midiendo
    // la posición que el usuario describió.
    await engine.setup(strategy)
  }
}

/**
 * El ataque combinado, como fase final de la auditoría.
 *
 * Sólo tiene sentido si algo quedó en pie: si un ataque suelto ya liquidó la
 * posición, mezclar no agrega nada que el usuario no sepa.
 */
async function* combinedPhase(
  engine: ScenarioEngine,
  vectors: AttackVector[],
  thresholds: Map<string, number | null>,
  modelId: string,
): AsyncGenerator<AuditEvent> {
  const known: KnownVector[] = vectors
    .filter((v) => !v.prepare)
    .map((vector) => ({ vector, threshold: thresholds.get(vector.id) ?? null }))

  if (known.length < 2) return

  yield {
    type: 'combinedStart',
    available: known.map((k) => ({ id: k.vector.id, label: k.vector.label })),
  }

  const search = searchCombination({ engine, known, modelId })
  let step = await search.next()
  while (!step.done) {
    const attempt = step.value
    yield {
      type: 'combinedTry',
      ingredients: attempt.ingredients.map((ing) => {
        const vector = known.find((k) => k.vector.id === ing.vectorId)!.vector
        return { vectorId: ing.vectorId, shown: vector.format(ing.intensity) }
      }),
      healthFactor: attempt.healthFactor,
      liquidated: attempt.liquidated,
      rationale: attempt.rationale,
    }
    step = await search.next()
  }

  yield {
    type: 'combinedDone',
    liquidated: step.value.winner !== null,
    failure: step.value.failure,
  }
}
