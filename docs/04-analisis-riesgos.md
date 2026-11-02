# 4. Análisis de riesgos

El riesgo de una suite de contrato no es que falle. Es que **pase sin estar comprobando
nada**, y que ese estado sea indistinguible del bueno: el mismo verde, el mismo código de
salida 0, el mismo informe.

Este documento enumera los seis riesgos de esta suite en concreto, qué se hizo con cada uno,
y los dos que siguen abiertos.

---

## R-01 · La suite puede correr cero escenarios y parecer que pasa

**Severidad: alta. Mitigado, y pasó de verdad.**

Una suite de Karate que no encuentra sus `.feature` no avisa. Maven imprime
`Tests run: 0, Failures: 0`, devuelve 0 y el CI se pone verde. Visualmente es idéntico a una
corrida perfecta, y el número que lo delata está en una línea que nadie lee cuando el job
sale bien.

Aquí pasó por dos motivos a la vez: faltaba el bloque `<testResources>` en el `pom.xml`, y la
versión del motor de JUnit no coincidía con la que arrastra Karate. Está contado en
[H-02](05-hallazgos.md#h-02) y [H-03](05-hallazgos.md#h-03).

**Qué lo tapa ahora:** el trabajo `detecta` del CI no solo exige que la suite falle, exige
que falle **exactamente cuatro veces**. Una suite de cero escenarios da cero fallos, y cero
no es cuatro, así que el CI se pone rojo. Es el único control que distingue «pasó» de «no
comprobó nada».

## R-02 · Un fallo de la prueba puede parecer un defecto de la API

**Severidad: alta. Mitigado.**

Es el riesgo gemelo del anterior, en la otra dirección. Un escenario mal escrito produce un
rojo que alguien atribuye a la API, y el informe de calidad acaba denunciando un defecto que
no existe. La segunda vez que pasa eso, nadie vuelve a creerse la suite.

Pasó dos veces montando esto, y las dos con la misma cara: un 401 y un 404 que parecían de la
API y eran de la prueba ([H-04](05-hallazgos.md#h-04)).

**Qué lo tapa ahora:** el trabajo `no-miente` del CI levanta la API **conforme al contrato** y
exige que la suite pase entera. Si una aserción inventa un defecto, ahí sale.

Los dos trabajos juntos son la mitigación de los dos riesgos:

| Trabajo del CI | API | Exige | Riesgo que cubre |
| --- | --- | --- | :-: |
| `detecta` | con los 4 incumplimientos | que falle, y 4 fallos exactos | R-01 |
| `no-miente` | conforme | que pase entera | R-02 |

Casi todas las suites del mundo tienen el segundo. **El primero es el que falta.** Una suite
que nunca ha visto un rojo que le corresponda no ha demostrado que sirva para algo.

## R-03 · El contrato y los esquemas de la suite pueden separarse

**Severidad: media. Abierto, declarado.**

Karate **no lee OpenAPI**. Los esquemas de
[`karate-config.js`](../src/test/resources/karate-config.js) están derivados **a mano** de
[`demo/openapi.yaml`](../demo/openapi.yaml). Son dos textos que hay que mantener de acuerdo,
y nada lo obliga.

El escenario concreto: alguien cambia `pacienteId` en el YAML, no toca el config, y la suite
**sigue verde comprobando el contrato de ayer**. Es el riesgo más silencioso de este
repositorio, porque no produce ni un rojo ni un aviso.

Qué lo reduce, sin cerrarlo:

- Los esquemas viven **en un solo sitio**. Un esquema repetido en dos `.feature` se corrige en
  uno y se olvida en el otro, y entonces la suite afirma dos cosas distintas sobre el mismo
  recurso.
- El riesgo está **escrito en la cabecera del propio archivo**, no solo aquí, para que lo vea
  quien lo edite.
- Hay un solo esquema de `Cita` para la colección y el detalle, igual que en el contrato. Si
  hiciera falta uno por endpoint, la respuesta ya no sería la misma y **eso es el hallazgo**.

Lo que lo cerraría de verdad es generar los esquemas desde el YAML en el arranque de la
suite. No está hecho, y decir que está hecho sería el tipo de cosa que esta carpeta existe
para no hacer.

## R-04 · El estado en memoria hace que la suite pase una vez

**Severidad: media. Mitigado, y pasó de verdad.**

La API de ejemplo guarda las citas en memoria y su contenedor **sobrevive entre corridas**:
`docker compose run` reutiliza el servicio que ya está levantado. Con horarios fijos en los
escenarios, la primera corrida creaba las citas y la segunda se encontraba un 409 donde
esperaba un 201.

**La suite pasaba la primera vez y fallaba la segunda.** Eso es peor que fallar siempre,
porque quien la escribe la ve verde y la publica.

**Qué lo tapa ahora:** cada escenario que crea usa un instante propio, distinto en cada
corrida:

```js
var arranque = java.lang.System.currentTimeMillis();

function unInstanteLibre(minutos) {
  return java.time.Instant.ofEpochMilli(arranque)
    .plus(java.time.Duration.ofDays(365))
    .plus(java.time.Duration.ofMinutes(minutos))
    .truncatedTo(java.time.temporal.ChronoUnit.SECONDS)
    .toString();
}
```

Se arregló aquí y **no reiniciando el servidor**, a propósito: una suite que exige un estado
inicial exacto acaba exigiéndolo también en el entorno de alguien que no puede reiniciar
nada, y ese alguien es siempre el que más necesita correrla.

## R-05 · La suite es secuencial y no escala

**Severidad: baja. Aceptado.**

Un método `@Karate.Test` por recurso, sin `Runner.parallel`. Es una decisión, no un olvido: la
API guarda estado en memoria y los escenarios crean y anulan, así que dos features en
paralelo se pisan. CP-10 es el caso evidente —pregunta el total dos veces y compara las
respuestas— y una creación concurrente lo haría fallar sin que la API tenga nada roto.

**Una suite que falla a veces se acaba volviendo a correr hasta que pase, y a partir de ahí ya
no informa de nada.** Esa es la razón, y no el tiempo.

Paralelizar exigiría que cada escenario trabajase sobre datos propios y que ninguna aserción
mirase la colección entera. Se puede, pero es otra suite, y lo que ahorraría aquí son
segundos.

## R-06 · El contrato puede estar mal

**Severidad: baja aquí, alta en un proyecto real. Abierto por naturaleza.**

Si el contrato promete algo equivocado, la suite comprueba lo equivocado con todo el rigor
del mundo. El verde no significa «la API está bien», significa «la API es la que el YAML
dice».

No tiene mitigación técnica. Tiene una práctica: **cuando la respuesta y el contrato
discrepan, el que está mal no es automáticamente el código**. La revisión del YAML con
Spectral ayuda con la forma —que no falte una descripción, que un ejemplo cumpla su esquema—
pero ningún linter detecta que una promesa sea una mala idea.

---

## Resumen

| Id | Riesgo | Severidad | Estado |
| --- | --- | :-: | --- |
| [R-01](#r-01--la-suite-puede-correr-cero-escenarios-y-parecer-que-pasa) | Correr cero escenarios y parecer que pasa | **Alta** | Mitigado con el trabajo `detecta` |
| [R-02](#r-02--un-fallo-de-la-prueba-puede-parecer-un-defecto-de-la-api) | Un fallo de la prueba atribuido a la API | **Alta** | Mitigado con el trabajo `no-miente` |
| [R-03](#r-03--el-contrato-y-los-esquemas-de-la-suite-pueden-separarse) | El YAML y los esquemas se separan | Media | **Abierto**, declarado |
| [R-04](#r-04--el-estado-en-memoria-hace-que-la-suite-pase-una-vez) | Estado en memoria entre corridas | Media | Mitigado con un instante por corrida |
| [R-05](#r-05--la-suite-es-secuencial-y-no-escala) | Secuencial, no escala | Baja | Aceptado con motivo |
| [R-06](#r-06--el-contrato-puede-estar-mal) | El contrato puede estar mal | Baja | Abierto por naturaleza |

Dos abiertos de seis. Están aquí porque un análisis de riesgos donde todo sale mitigado no es
un análisis de riesgos: es una lista de cosas que ya estaban hechas.

---

Siguiente: [5. Hallazgos](05-hallazgos.md) — cuatro los puse yo a propósito. Cinco no.
