# El trabajo de calidad, antes del código

Un repositorio de pruebas de API enseña **cómo** se manda una petición y se comprueba una
respuesta. No enseña contra qué se comprueba, de dónde sale esa verdad, qué promesa del
contrato no cubre ningún caso, ni cómo se sabe que la suite no está pasando en vano. Esta
carpeta es esa parte.

| Documento | Qué contiene |
| --- | --- |
| [1. Análisis del contrato](01-analisis-de-contrato.md) | Qué promete la API, las cuatro promesas que se rompen sin cambiar ningún código de estado, y lo que el contrato **no** promete |
| [2. Diseño de casos](02-diseno-de-casos.md) | Los 25 casos, las cuatro técnicas, y los tres casos que no se pueden escribir mirando un endpoint cada vez |
| [3. Matriz de trazabilidad](03-matriz-trazabilidad.md) | 44 promesas del contrato, 40 con caso — y las **4 que no tienen ninguno**, con su motivo |
| [4. Análisis de riesgos](04-analisis-riesgos.md) | Seis riesgos, **dos abiertos**. El primero es que la suite pase sin comprobar nada |
| [5. Hallazgos](05-hallazgos.md) | **Nueve.** Cuatro los puse yo a propósito. Cinco no |

---

## La pregunta que casi nadie le hace a su suite

No es «¿pasa?». Es:

> **¿Esta suite habría sido capaz de detectar el problema que dice que no existe?**

Esa pregunta tiene una respuesta medible, y en este repositorio se mide **en cada push**. La
API de ejemplo incumple su propio contrato en cuatro puntos, se apagan con una variable de
entorno, y el CI corre la suite las dos veces:

| Trabajo del CI | API | Exige | Qué demuestra |
| --- | --- | --- | --- |
| `detecta` | con los 4 incumplimientos | que **falle**, con 4 fallos exactos | que la suite sirve para algo |
| `no-miente` | conforme al contrato | que **pase entera** | que no inventa defectos |

Las tres corridas medidas, con la misma suite sin tocar una línea:

| API | Escenarios | Fallos | Build |
| --- | :-: | :-: | :-: |
| con los 4 incumplimientos | 25 | **4** | FAILURE |
| conforme al contrato | 25 | **0** | SUCCESS |
| con el defecto del id reintroducido a propósito | 25 | **5** | FAILURE |

La tercera fila es la que vale: un defecto nuevo **cambia el número**, y por eso el CI cuenta
los fallos en vez de conformarse con que haya rojo.

Casi todas las suites del mundo tienen el segundo trabajo. **El primero es el que falta.**

Y no vale con exigir rojo: hay que **contar los fallos**. Si mañana salen tres, alguien
debilitó una aserción. Si salen cinco, hay un defecto nuevo que nadie ha mirado. Las dos cosas
merecen un CI rojo, y un `exit 1` a secas no distingue ninguna de las dos.

## El resultado incómodo

De los nueve hallazgos del [documento 5](05-hallazgos.md), **cinco no los puse yo**. Y cuatro
de esos cinco producían **verde**:

| Lo que decía el informe | Lo que pasaba de verdad |
| --- | --- |
| `BUILD SUCCESS` | **Cero escenarios** ejecutados. El cero está en la línea de arriba y nadie la lee cuando el job sale bien |
| 24 escenarios, 0 fallos | Una cita de otro paciente **se borraba sola** al anular una distinta |
| La suite pasa | Pasaba **una vez**. La segunda corrida fallaba, y una suite que pasa la primera vez se publica |
| `200 OK` | Era el Adminer de otro proyecto en el puerto 8080 |

El segundo es el que más me interesa. Es un defecto de verdad, en código mío, y **la suite de
24 escenarios no lo detectaba**: pasaba entera contra la API conforme. No por falta de rigor
en las aserciones, sino porque ningún endpoint lo delata por separado. Hay que crear, anular y
volver a crear **en ese orden**, y eso no sale de leer el contrato endpoint por endpoint. Sale
de preguntarse qué pasa después.

Está corregido, tiene su caso ([CP-25](02-diseno-de-casos.md#cp-25)), y **no se quedó como
quinto incumplimiento de adorno** aunque hubiera lucido: era un defecto, no un ejemplo.

## Y una cosa que no cambió

La matriz de trazabilidad tiene **cuatro filas sin caso**, y siguen sin caso después de
escribirla:

- Dos porque **el contrato no promete qué responder** en esa situación. Inventar la respuesta
  en la prueba congelaría una interpretación que nadie confirmó.
- Una —la asimetría de roles entre `POST` y `DELETE`— porque **no es mía la decisión**: o el
  contrato está incompleto, o la asimetría es deliberada, y eso lo contesta quien diseñó la
  API.
- Una por redundante con otra fila.

Cubrirlas «por si acaso» habría dejado la matriz en 44 de 44 y la suite peor: un caso que
exige algo que el contrato no promete no protege nada, **frena el día que la API cambie de
forma legítima**, y lo que hace el equipo entonces es borrarlo. Después de borrar dos o tres,
deja de leer los demás.

---

Volver al [README del repositorio](../README.md).
