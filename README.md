# Attack My DeFi

Describís tu posición en Aave V3 y un atacante busca el escenario más leve que la liquida.
Cada health factor que ves lo devuelve el contrato de Aave sobre un fork de Ethereum
mainnet. El modelo que elige los escenarios corre entero en tu máquina.

```
Depositás 200.000 USDC, pedís prestados 62 WETH        health factor 1,0414

  USDC a $0,500  →  HF 0,5207   LIQUIDABLE
  USDC a $0,750  →  HF 0,7811   LIQUIDABLE
  USDC a $0,875  →  HF 0,9112   LIQUIDABLE
  USDC a $0,938  →  HF 0,9763   LIQUIDABLE
  USDC a $0,963  →  HF 1,0024   sobrevive
  USDC a $0,951  →  HF 0,9899   LIQUIDABLE
  USDC a $0,957  →  HF 0,9966   LIQUIDABLE

  Umbral: USDC a $0,957 — un depeg del 4,3%
```

En marzo de 2023 USDC tocó $0,87. El depeg real fue el triple de lo necesario para
liquidar esa posición.

## El problema que resuelve

Un modelo de lenguaje puede escribir "tu health factor quedaría en 0,95" con total
seguridad y estar completamente equivocado. En finanzas eso no es un error simpático: es
una conclusión falsa presentada como cálculo.

Acá el modelo nunca produce un número. Elige qué escenario probar; el simulador aplica ese
escenario sobre un fork real y le pregunta a Aave qué pasó. La única fuente de health
factors es el contrato.

| Qué | Quién | Por qué |
|---|---|---|
| Los números | El contrato de Aave | Un modelo puede alucinar; el contrato no |
| La mecánica de búsqueda | El código | Determinística y aburrida |
| Qué escenario probar | El modelo local | Requiere criterio, y es lo interesante |

## Cómo funciona

El simulador levanta un fork de Ethereum mainnet con Anvil, pineado a un bloque fijo,
y arma la posición de verdad: consigue el colateral, lo deposita en Aave y toma el
préstamo. Son transacciones que Aave procesa.

Para simular un escenario, reemplaza la fuente de precio que Aave consulta por un mock
controlable —usando la propia función de administración del protocolo, `setAssetSources`,
impersonando al ACLAdmin— y le pregunta al Pool cómo quedó la posición. **El health factor
lo recalcula Aave con su propia lógica**, con nuestro precio de entrada.

Cada escenario corre desde un snapshot y revierte al terminar, así ninguno contamina al
siguiente.

### Vectores de ataque

Los tres comparten motor y se derivan de la posición, porque la dirección del daño depende
de ella:

- **Movimiento adverso de precio** — apunta al activo volátil. Si el colateral es WETH, el
  riesgo es que caiga; si el colateral es una stablecoin, el riesgo es que se encarezca la
  deuda.
- **Depeg de stablecoin** — a la baja destruye a quien la tiene de colateral; al alza
  lastima a quien debe en ella, que es lo contrario de lo que sugiere la palabra "depeg".
- **Manipulación de oráculo** — el mercado no se movió, sólo miente el feed. Reporta algo
  que un crash no puede: cuánto se lleva el atacante liquidando a precio falso colateral
  que el mercado sigue pagando caro, calculado con el `liquidationBonus` que Aave publica.

## Inferencia local

Toda la inferencia corre con [QVAC](https://qvac.tether.io) sobre **Qwen3 4B**. No hay API
keys, no hay datos saliendo de la máquina, y después de la primera descarga funciona sin
internet salvo por el RPC del fork.

Hacer que un modelo de 4B use herramientas de forma confiable fue el trabajo real del
proyecto:

**Las tools no llegaban al prompt.** El SDK requiere `modelConfig: { tools: true }` al
cargar el modelo. Sin esa opción el modelo responde "no tengo acceso a herramientas", sin
emitir ningún error. Se probaron los cinco dialectos de tool calling y tres modelos
distintos antes de encontrarlo.

**Razonaba 278 segundos antes de actuar.** Qwen3 delibera por defecto y quemaba miles de
tokens antes de una sola llamada. Con `reasoning_budget: 0` cada paso pasó a ~1,5s. Acá no
hace falta deliberar: hace falta elegir un número.

**Con la pregunta abierta, barría.** Preguntándole "¿qué probamos ahora?" avanzaba de 5 en
5 y se quedaba con un valor grueso, errando por 4,8 puntos. Dándole el rango ya acotado
—"la respuesta está entre -25% y -30%, probá el punto medio"— biseca y converge a 0,19
puntos en 8 simulaciones. No cambiamos de modelo: le hicimos una pregunta que un 4B sí
puede contestar bien.

**Se lo trata como fuente no confiable**, igual que el input de un usuario: la propuesta se
valida y normaliza en el borde (manda `+25` cuando quiere decir `-25`), los escenarios
repetidos se descartan, y hay tope de pasos y de negativas.

## Correr el proyecto

Requiere Node 22, pnpm y [Foundry](https://getfoundry.sh).

```bash
pnpm install
cp .env.example .env.local     # y poné tu RPC de Ethereum mainnet
```

Levantá el fork en una terminal aparte, pineado a un bloque fijo:

```bash
anvil --fork-url $ETHEREUM_RPC_URL --fork-block-number <BLOQUE> --port 8545
```

Y la app:

```bash
pnpm dev
```

La primera corrida descarga el modelo (~2,5 GB). Después queda en caché.

### Verificación

```bash
pnpm tsx --env-file=.env.local scripts/m1-check.ts       # motor vs fórmula analítica
pnpm tsx --env-file=.env.local scripts/m2-check.ts       # el atacante converge
pnpm tsx --env-file=.env.local scripts/vectors-check.ts  # los tres vectores
```

`m1-check` es el que sostiene todo lo demás: compara el umbral que encuentra el motor
—preguntándole a Aave— contra la fórmula analítica aplicada al estado real de la posición.
Coinciden con 0,0002 puntos de desvío. El valor esperado se deriva del estado leído en vez
de estar hardcodeado, porque depende del precio del bloque pineado.

## Trampas que vale la pena conocer

**`getUserAccountData` mezcla tres escalas.** Los montos en USD vienen con 8 decimales, el
health factor con 18, y los thresholds en basis points. Es la fuente de error más probable
al integrar Aave.

**viem no lanza cuando una transacción revierte.** `waitForTransactionReceipt` devuelve el
receipt con `status: 'reverted'` y el código sigue como si nada. Acá toda escritura pasa
por un helper que verifica el status: sin eso, el `borrow` fallaba en silencio y la posición
quedaba sin deuda, reportando un health factor infinito — "tu estrategia es invulnerable".

**El `borrow` de Aave muere con OutOfGas** si se confía en la estimación automática de gas,
y `simulateContract` no lo detecta.

## Stack

Next.js · TypeScript · viem · Zod · Foundry/Anvil · Aave V3 · QVAC + Qwen3 4B

## Licencia

MIT
