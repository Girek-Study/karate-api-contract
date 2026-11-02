# 2. Diseño de casos

25 escenarios, repartidos en seis archivos `.feature`, uno por recurso. Este documento dice
de dónde sale cada uno y **qué técnica usa**, porque en una suite de contrato la técnica es
la mitad del trabajo: la misma promesa comprobada de dos maneras distintas da un caso que
detecta el defecto y un caso que no.

---

## El reparto

| Archivo | Casos | Qué recurso |
| --- | :-: | --- |
| [`sesiones.feature`](../src/test/resources/contrato/sesiones.feature) | CP-01 … CP-05 | `POST /sesiones` |
| [`especialidades.feature`](../src/test/resources/contrato/especialidades.feature) | CP-06, CP-07 | `GET /especialidades` |
| [`citas-coleccion.feature`](../src/test/resources/contrato/citas-coleccion.feature) | CP-08 … CP-11 | `GET /citas` |
| [`citas-detalle.feature`](../src/test/resources/contrato/citas-detalle.feature) | CP-12 … CP-15 | `GET /citas/{id}` |
| [`citas-creacion.feature`](../src/test/resources/contrato/citas-creacion.feature) | CP-16 … CP-20 | `POST /citas` |
| [`citas-anulacion.feature`](../src/test/resources/contrato/citas-anulacion.feature) | CP-21 … CP-25 | `DELETE /citas/{id}` |

Hay un séptimo archivo, [`autenticacion.feature`](../src/test/resources/contrato/autenticacion.feature),
que **no es una prueba**: es la función que usan las demás para conseguir un token. Lleva
`@ignore` para que el corredor no lo cuente como escenario y no aparezca dos veces en el
informe.

## Cuatro técnicas, y cuándo usar cada una

### 1. Esquema completo, no campo a campo

```gherkin
And match response == esquemas.sesion
```

`==` con un esquema en Karate es más estricto de lo que parece: exige que estén **todos** los
campos declarados y que **no haya ninguno más**. Esa segunda mitad es la que importa. Un
campo que aparece de la nada en una respuesta es una fuga de datos potencial, y una aserción
campo a campo nunca la ve.

Comparar con el esquema entero también obliga a que el esquema exista, y un esquema escrito
se puede revisar. Diez `match response.x == '#string'` seguidos no se revisan: se leen por
encima.

### 2. `match each` y no el primer elemento

```gherkin
And match each response.datos == esquemas.cita
```

`match response.datos[0]` comprueba el primero y da por buenos los demás. Y el elemento que
viene de otro sitio —de otra tabla, de un caché viejo, de la migración a medias— **nunca es
el primero**: el primero es el de la siembra, el que siempre ha estado bien.

Se usa en CP-06 y CP-08.

### 3. Dos peticiones comparadas entre sí

Es la técnica que distingue esta suite, y aparece en tres casos:

| Caso | Qué compara | Qué defecto caza |
| --- | --- | --- |
| **CP-10** | `total` sin paginar contra `total` con `limite=1` | `total` devuelve el tamaño de la página |
| **CP-13** | un elemento de la colección contra su propio detalle | el detalle cambia el tipo de un campo |
| **CP-25** | el id de una cita nueva contra el de las anteriores | anular libera un id y la creación siguiente sobreescribe |

Lo que tienen en común: **no hay número mágico en ninguno de los tres**. No se comprueba que
el total sea 3, ni que el id sea `CITA-0004`. Se comprueba una relación entre dos respuestas,
así que el caso sigue valiendo cuando cambien los datos de siembra y no hay que tocarlo
cuando alguien añada una cita al arranque.

Y lo que tienen en común por el otro lado: **ninguno de los tres se puede escribir mirando
un endpoint cada vez**. Son los tres casos que no salen de leer el YAML campo por campo.

#### CP-10

```gherkin
Given path 'citas'
When method get
* def totalSinPaginar = response.total
* def cuantasHay = response.datos.length
* assert cuantasHay > 1          # el caso solo tiene sentido si hay más de una

Given path 'citas'
And param limite = 1
When method get
And match response.datos == '#[1]'
And match response.total == totalSinPaginar
```

El `assert cuantasHay > 1` es una **precondición, no una aserción del contrato**. Sin él, con
una sola cita en la colección el caso pasaría siempre: `total` valdría 1 en las dos
peticiones y el defecto quedaría invisible. Un caso que pasa cuando no puede fallar es un
caso que no informa.

#### CP-13

```gherkin
Given path 'citas'
When method get
* def deLaColeccion = response.datos[0]

Given path 'citas', deLaColeccion.id
When method get
And match response == deLaColeccion
```

Tres líneas y es el caso más valioso de la suite. El contrato promete que los dos endpoints
devuelven el mismo objeto; esto lo pregunta literalmente.

#### CP-25

Crea dos citas, anula la primera, crea una tercera y comprueba que su id no es ninguno de los
dos anteriores **y que la segunda cita sigue siendo de su paciente**. Esa segunda mitad no es
redundante: con solo comparar los tres identificadores entre sí, un id repetido pasaría
desapercibido si la cita sobreescrita fuese otra.

Este caso no nació del contrato. Nació de un defecto de verdad, y está contado en
[5. Hallazgos](05-hallazgos.md#h-01).

### 4. El caso negativo que nadie escribe

De los 25, **once** mandan la petición mal a propósito:

| Caso | Qué manda mal | Qué exige |
| --- | --- | --- |
| CP-03 | clave incorrecta | 401 con `CREDENCIALES_INVALIDAS` |
| CP-04 | usuario inexistente | **el mismo error que CP-03** |
| CP-05 | cuerpo vacío | 401 |
| CP-09 | colección sin token | 401 con `NO_AUTENTICADO` |
| CP-14 | detalle de una cita que no existe | 404 con `CITA_NO_ENCONTRADA` |
| CP-15 | detalle sin token | 401 |
| CP-17 | creación sin token | 401 — **y aquí está el incumplimiento 4** |
| CP-18 | los tres campos mal | 400 con **los tres** motivos |
| CP-22 | anulación con rol `LECTOR` | **403 y no 401** |
| CP-23 | anulación de una cita que no existe | 404 con su cuerpo de error |
| CP-24 | anulación sin token | 401 |

Tres de estos merecen explicación, porque no son «el camino triste» sino requisitos de
diseño que casi todas las APIs incumplen:

**CP-04 — el error no debe delatar qué usuarios existen.** Clave mala y usuario inexistente
devuelven el mismo código y el mismo detalle. Si se distinguen, cualquiera puede enumerar
usuarios válidos a base de intentos. No está escrito como regla en el YAML; está implícito en
que el esquema de error tiene un único `codigo`, y es un defecto de seguridad, no una
preferencia de redacción.

**CP-18 — los tres motivos, no el primero.** Una validación que corta en el primer error
obliga al cliente a arreglar campos de uno en uno, con una ida y vuelta por campo. El
contrato declara `campos` como array con `minItems: 1`, y el caso exige que los tres campos
mal aparezcan:

```gherkin
And match response.error.campos[*].campo contains only ['pacienteId', 'especialidad', 'inicio']
```

**CP-22 — 403 y no 401.** El lector está autenticado; lo que le falta es permiso. Devolver
401 manda al cliente a renovar un token que está perfectamente bien, y el bucle de
renovación que sale de ahí es un clásico de los informes de incidencia.

## Lo que se comprueba y casi nunca se comprueba

Tres aserciones que no suelen aparecer en una suite de API y están aquí a propósito:

```gherkin
# CP-16 — la cabecera `location` es parte del contrato
And match responseHeaders['location'][0] == '/citas/' + response.id

# CP-21 — 204 significa SIN CUERPO. Un 204 con JSON dentro
# rompe a los clientes que no intentan parsear nada
And match response == ''

# CP-07 — en el catálogo, total y tamaño son el mismo número.
# En /citas no, y esa diferencia es justo lo que mira CP-10
And match response.total == response.datos.length
```

## Qué se quedó fuera

| Lo que falta | Por qué |
| --- | --- |
| `GET /salud` | Es la sonda del arranque, no parte del contrato funcional. La usa el `healthcheck` del compose y el CI para confirmar en qué modo arrancó la API |
| Un caso de token caducado | La API de ejemplo no caduca tokens. Montar la caducidad para probarla sería escribir la API a medida de la prueba, y entonces la prueba ya no demuestra nada |
| Paginación con desplazamiento | El contrato solo declara `limite`. No hay `offset` que probar |
| Concurrencia en `POST /citas` | El contrato no promete nada sobre dos creaciones simultáneas del mismo horario. Hacerlo exigiría declararlo primero en el YAML |
| Carga y latencia | Otro repositorio: [`k6-performance-suite`](https://github.com/Girek-Study/k6-performance-suite) |

Las dos primeras son las que importan: **lo que falta aparece aquí con su motivo**, y no en
el silencio de una suite que nadie ha contado.

---

Siguiente: [3. Matriz de trazabilidad](03-matriz-trazabilidad.md) — qué promesa del contrato
cubre cada caso, y las que no cubre ninguno.
