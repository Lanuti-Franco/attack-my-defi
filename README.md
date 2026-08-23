# Attack My DeFi

Elegís una posición de préstamo en Aave V3 y siete ataques distintos buscan el escenario más
leve que la liquida. Cada health factor que ves lo devuelve el contrato de Aave sobre un fork
de Ethereum mainnet, y el modelo que elige los escenarios corre entero en tu máquina.

```
ENCONTRÉ 2 FORMAS DE ROMPERTE
de 5 ataques probados

  El más barato
  Caída de ETH · ETH -27,5%
  Health factor 0,9693 · LIQUIDABLE

  Para sobrevivir el crash del 19 de mayo de 2021 (ETH -35%)
  bajá la deuda a $124.139

Verificado contra Aave V3 sobre un fork de Ethereum mainnet · bloque 25811399
```

## El problema que resuelve

Un modelo de lenguaje puede escribir "tu health factor quedaría en 0,95" con total seguridad
y estar completamente equivocado. En finanzas eso no es un error simpático: es una conclusión
falsa presentada como cálculo.

Acá el modelo nunca produce un número. Elige qué escenario probar; el simulador aplica ese
escenario sobre un fork real y le pregunta a Aave qué pasó. La única fuente de health factors
es el contrato.

| Qué | Quién | Por qué |
|---|---|---|
| Los números | El contrato de Aave | Un modelo puede alucinar; el contrato no |
| La mecánica de búsqueda | El código | Determinística y aburrida |
| Qué escenario probar | El modelo local | Requiere criterio, y es lo interesante |

## Cómo funciona

El simulador levanta un fork de Ethereum mainnet con Anvil, pineado a un bloque fijo, y arma
la posición de verdad: consigue el colateral, lo deposita en Aave y toma el préstamo. Son
transacciones que Aave procesa.

Para simular un escenario, reemplaza la fuente de precio que Aave consulta por un mock
controlable —usando la propia función de administración del protocolo, `setAssetSources`,
impersonando al ACLAdmin— y le pregunta al Pool cómo quedó la posición. **El health factor lo
recalcula Aave con su propia lógica**, con nuestro precio de entrada.

Cada escenario corre desde un snapshot y revierte al terminar, así ninguno contamina al
siguiente.

Los ataques se corren de a uno, no en paralelo: el fork es un recurso exclusivo y una
auditoría no es una lectura —monta una posición, la rompe y revierte—. Un lock con dueño
impide que dos corridas se pisen, porque cuando eso pasa el síntoma es un revert
incomprensible en un lugar que no tiene nada que ver.

### Los seis ataques individuales

Cuáles aplican depende de la posición: no tiene sentido buscarle un depeg a quien no tiene
stablecoin de colateral.

- **Caída del colateral** — el precio que Aave usa para tu colateral baja, sea porque el
  mercado cayó o porque el feed falló. Cuando el colateral es una stablecoin el vector se da
  vuelta y apunta a que se encarezca la deuda, que es de donde vendría el daño.
- **Depeg de stablecoin** — sólo cuando la stablecoin es el colateral. A la baja destruye a
  quien la tiene depositada; al alza lastima a quien debe en ella, que es lo contrario de lo
  que sugiere la palabra.
- **El paso del tiempo** — no pasa nada en el mercado y la deuda crece igual, por el interés
  variable que Aave acumula. Es el único ataque que no necesita que el mundo se mueva.
- **Un voto de governance** — Aave baja el liquidation threshold de tu colateral. Pasó de
  verdad varias veces, y es el ataque que no depende del precio sino de la regla con la que
  te miden.
- **Una corrida de liquidez** — una ballena se lleva la liquidez del pool y la tasa variable
  se dispara. Corre contra un snapshot propio, así lo que la ballena le hace al mundo no
  contamina a los demás ataques.
- **Una cascada de liquidaciones** — liquidan a otro, su colateral se vende al mercado y el
  precio te arrastra a vos. Acotado a 25.000 WETH, que son unos 60 millones de dólares
  vendidos de golpe: más de lo que Aave liquidó en todo el día de marzo de 2020.

### El séptimo: el ataque combinado

Los seis anteriores se buscan por bisección, y conviene decirlo antes de que lo diga otro:
**ahí el modelo no aporta gran cosa**. Dado el intervalo donde está el umbral, el próximo
valor a probar es el punto medio, y eso es un `while` de tres líneas.

El combinado es otra cosa. Corre al final, cuando ya se sabe cuánto aguanta cada ataque por
separado, y busca una mezcla que liquide la posición **usando de cada ataque menos de lo que
haría falta para romperla solo**. Ninguna pieza alcanza por su cuenta; la única forma de
ganar es que se sumen.

Ahí no hay fórmula. El espacio son todos los subconjuntos de ataques por todas sus
intensidades, y elegir qué mezcla vale la pena probar depende de entender que el tiempo y la
liquidez empujan los dos sobre la deuda, o que el precio y el umbral de liquidación muerden
los dos sobre el colateral. Es el único lugar del proyecto donde el modelo hace algo que el
código no podría hacer igual de bien, y por eso es el que cierra la auditoría.

Sobre una posición de 100 WETH contra 180.000 USDC —health factor 1,1141— los seis ataques
individuales necesitan, cada uno por su cuenta, ETH cayendo 12,5%, o 4,4 años de intereses, o
que governance baje el umbral 8,8 puntos, o una liquidación de 12.500 WETH. El modelo
encontró esto:

```
ETH -7,5%  +  2,6 años  +  LT −5,3 pts  +  liquidan 7.500 WETH  →  HF 0,9016
```

Cada pieza está en el 60% de lo que haría falta para liquidarla sola. Ninguna te rompe. Las
cuatro juntas, sí.

## Inferencia local

Toda la inferencia corre con [QVAC](https://qvac.tether.io) sobre **Qwen3 4B Instruct**
cuantizado. No hay API keys, no hay datos saliendo de la máquina, y después de la primera
descarga funciona sin internet salvo por el RPC del fork.

Hacer que un modelo de 4B use herramientas de forma confiable fue el trabajo real del
proyecto:

**Las tools no llegaban al prompt.** El SDK requiere `modelConfig: { tools: true }` al cargar
el modelo. Sin esa opción el modelo responde "no tengo acceso a herramientas", sin emitir
ningún error. Se probaron los cinco dialectos de tool calling y tres modelos distintos antes
de encontrarlo.

**Razonaba 278 segundos antes de actuar.** Qwen3 delibera por defecto y quemaba miles de
tokens antes de una sola llamada. Con `reasoning_budget: 0` cada paso pasó a ~1,5s. Acá no
hace falta deliberar: hace falta elegir un número.

**Con la pregunta abierta, barría.** Preguntándole "¿qué probamos ahora?" avanzaba de 5 en 5
y se quedaba con un valor grueso, errando por 4,8 puntos. Dándole el rango ya acotado —"el
umbral está entre -25% y -30%, probá el punto medio"— biseca y converge. No cambiamos de
modelo: le hicimos una pregunta que un 4B sí puede contestar bien.

**Se lo trata como fuente no confiable**, igual que el input de un usuario: la propuesta se
valida y normaliza en el borde (manda `+25` cuando quiere decir `-25`), los escenarios
repetidos se descartan, y hay tope de pasos y de negativas.

## Evidencia

"Confiable" sin números es una opinión, y "el modelo aporta" también. Hay dos scripts que
contestan esas dos preguntas por separado.

### ¿Usa bien las herramientas?

`pnpm evidence` corre el mismo ataque varias veces, cada una con una semilla distinta, y mide
si converge al mismo umbral y cuántas veces el código tuvo que suplir al modelo.

```
  semilla 100 →   ETH -27.5% en  7 sondeos ·  37s
  semilla 101 →   ETH -27.5% en  7 sondeos ·  35s
  semilla 102 →   ETH -27.5% en  7 sondeos ·  35s
  semilla 103 →   ETH -27.5% en  7 sondeos ·  41s
  semilla 104 →   ETH -27.5% en  7 sondeos ·  34s

Umbral: encontrado en 5/5 corridas · promedio -27.50 · dispersión 0.00 puntos
Tool use: 35 pedidos · 35 devolvieron una llamada usable sin retoques (100%)
  contestó en prosa sin llamar a la herramienta: 0
  propuso un valor fuera de rango, hubo que acotarlo: 0
  propuso un escenario ya probado: 0
```

Ese 0,00 de dispersión merece una aclaración, porque leído solo dice algo que no es cierto.
La consistencia no sale de que el modelo sea infalible: sale de que la pregunta que se le
hace casi no admite variación. Cuando el prompt entrega el intervalo ya acotado y pide el
punto medio, la respuesta correcta es prácticamente única y la semilla no tiene de dónde
agarrarse.

El número que muestra el trabajo real es el otro: **con la pregunta abierta el mismo modelo
erraba por 4,8 puntos**. Reducirlo a cero no se logró cambiando de modelo, sino cambiando la
pregunta.

### ¿Sirve de algo el modelo?

Es la pregunta incómoda, y en la bisección la respuesta honesta es "no mucho". Por eso el
ataque combinado se compara contra el baseline más tonto posible: elegir ataques e
intensidades al azar, con el mismo presupuesto de intentos.

```
  modelo   liquidó en 10/10 corridas (100%) · 1.0 intentos en promedio
  azar     liquidó en  7/10 corridas  (70%) · 1.7 intentos en promedio
```

El modelo encuentra la mezcla siempre y al primer intento; tirar los dados falla tres de cada
diez veces. `pnpm combined-check` lo vuelve a correr.

Ese resultado salió de una segunda medición. En la primera, cada componente podía entrar al
85% de su umbral individual —tan cerca de liquidar solo que casi cualquier mezcla servía— y
**el azar empataba**. Un problema que se resuelve tirando los dados no demuestra nada, así
que el tope bajó al 60% y ahí sí discrimina.

### Cómo falla

Saber que anda importa menos que saber cómo se rompe. Tres modos de falla que aparecieron
corriendo esto:

**Un fallo se reportaba como buena noticia.** Un `catch { break }` se tragaba cualquier error
de simulación, así que una corrida que se caía por un problema de red terminaba reportando
"no encontró umbral" — que la interfaz traduce a "tu posición sobrevivió". Es el peor modo de
falla posible para una herramienta de riesgo. Ahora el fallo viaja con su motivo.

**Dos auditorías a la vez se pisaban.** El fork es un recurso exclusivo, y sin lock una
corrida reseteaba el mundo mientras otra estaba a mitad de montar su posición. El síntoma era
un `HealthFactorLowerThanLiquidationThreshold` en un borrow que no tenía nada de malo.

**El mundo "limpio" podía no estarlo.** Si el snapshot de referencia se tomaba sobre un
estado que ya tenía una posición montada, todas las corridas partían de ahí acumulando deuda.
No fallaba: devolvía umbrales plausibles y equivocados, que es el único error que este
proyecto no se puede permitir. Ahora el reset verifica a dónde volvió antes de darlo por
bueno.

## La curva de impacto

El ataque de cascada necesita saber cuánto hunde el precio vender N WETH de golpe. Cotizarlo
contra Uniswap en cada sondeo son cientos de lecturas de storage que el fork pide de a una:
minutos por simulación, y a veces un timeout que voltea la búsqueda entera.

Pero el bloque está congelado, así que esa curva no cambia entre corridas. `pnpm impact-curve`
la mide una vez contra los pools reales y la deja como tabla de 18 puntos —más juntos abajo,
que es donde la curva se dobla—; el ataque interpola. Los números salen del mismo lugar de
siempre: lo único distinto es cuándo se leyeron.

`pnpm curve-check` es lo que sostiene el cambio: compara la tabla contra cotizaciones reales
en puntos que no están en ella, que es justo donde una interpolación se desviaría.

```
  cantidad    tabla    cotizado   desvío
      777    1.00%      1.00%   0.001 pts
     3333    4.16%      4.19%   0.031 pts
     7777    7.96%      7.96%   0.009 pts
    13421   10.73%     10.74%   0.015 pts
    19050   12.87%     12.88%   0.007 pts
    23500   14.36%     14.34%   0.016 pts
```

Por encima del último punto medido devuelve el último valor conocido en vez de extrapolar.
Estirar una curva de liquidez más allá de lo que se midió es exactamente el tipo de número
que este proyecto no produce.

## Correr el proyecto

Requiere Node 22, pnpm y [Foundry](https://getfoundry.sh).

```bash
pnpm install
cp .env.example .env.local     # y poné tu RPC de Ethereum mainnet (hace falta archive)
```

Levantá el fork en una terminal aparte, pineado al bloque que esté en `.env.local`:

```bash
anvil --fork-url $ETHEREUM_RPC_URL --fork-block-number 25811399 --port 8545
```

Dejalo listo para trabajar, una sola vez:

```bash
pnpm warm
```

Eso trae el mundo desde el RPC y cachea los pools de Uniswap. Sin esto la primera corrida
paga esa descarga entera, que contra un plan gratuito son minutos. **Cerrá Anvil con Ctrl+C y
no con `kill -9`**: el caché se guarda en disco recién al salir limpio, y perderlo obliga a
recalentar.

Y la app:

```bash
pnpm dev
```

La primera corrida descarga el modelo (~2,5 GB). Después queda en caché.

### Verificación

```bash
pnpm tsx --env-file=.env.local scripts/m1-check.ts        # el motor contra la fórmula analítica
pnpm tsx --env-file=.env.local scripts/m2-check.ts        # el atacante converge
pnpm tsx --env-file=.env.local scripts/vectors-check.ts   # cada ataque da algo coherente
pnpm tsx --env-file=.env.local scripts/wbtc-check.ts      # una posición con BTC de colateral
pnpm tsx --env-file=.env.local scripts/audit-check.ts     # la auditoría completa, de punta a punta
pnpm evidence                                             # confiabilidad del tool use
pnpm combined-check                                       # el modelo contra elegir al azar
pnpm curve-check                                          # la tabla contra cotizaciones reales
```

`m1-check` es el que sostiene todo lo demás: compara el umbral que encuentra el motor
—preguntándole a Aave— contra la fórmula analítica aplicada al estado real de la posición.
Coinciden con 0,0002 puntos de desvío. El valor esperado se deriva del estado leído en vez de
estar hardcodeado, porque depende del precio del bloque pineado.

`wbtc-check` verifica algo que un test más obvio deja pasar: no sólo que el health factor
coincida con la fórmula, sino que **el shock apunte al activo correcto**. Un ternario que
asumía que sólo había dos activos hacía que un shock sobre WBTC le pegara al precio de la
deuda, y con BTC cayendo 30% el health factor *subía*. La fórmula daba bien; lo que estaba
mal era a qué se la aplicaba.

## Trampas que vale la pena conocer

**`getUserAccountData` mezcla tres escalas.** Los montos en USD vienen con 8 decimales, el
health factor con 18, y los thresholds en basis points. Es la fuente de error más probable al
integrar Aave.

**viem no lanza cuando una transacción revierte.** `waitForTransactionReceipt` devuelve el
receipt con `status: 'reverted'` y el código sigue como si nada. Acá toda escritura pasa por
un helper que verifica el status: sin eso, el `borrow` fallaba en silencio y la posición
quedaba sin deuda, reportando un health factor infinito — "tu estrategia es invulnerable".

**El `borrow` de Aave muere con OutOfGas** si se confía en la estimación automática de gas, y
`simulateContract` no lo detecta.

**Los errores de viem citan el request entero**, y el de `anvil_reset` lleva la URL del RPC
con la API key adentro. Ese texto llega al navegador como mensaje de error y se ve en
pantalla. De cada URL sobrevive sólo el origen.

**Un RPC que devuelve HTML mata a Anvil.** Los endpoints públicos contestan de a ratos con
una página de error de Cloudflare en vez de JSON, y Anvil entra en panic al parsearla. Si se
cae sin explicación, ese suele ser el motivo.

## Limitaciones

Un solo protocolo (Aave V3 en Ethereum mainnet) y tres activos (WETH, WBTC, USDC). La cascada
está acotada a 25.000 WETH porque más que eso no se midió, y la curva no se extrapola. El
ataque combinado deja afuera los que necesitan preparar el mundo antes de correr, porque sólo
puede haber una preparación activa por vez.

Los escenarios los elegimos nosotros: el sistema dice qué le pasa a una posición bajo esos
escenarios, sobre un estado de la cadena congelado en un bloque. Nada acá predice qué va a
hacer el mercado, ni es consejo financiero.

## Stack

Next.js · TypeScript · viem · Zod · Foundry/Anvil · Aave V3 · QVAC + Qwen3 4B

## Licencia

MIT
