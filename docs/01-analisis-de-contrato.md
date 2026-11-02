# 1. Análisis del contrato

Una prueba de contrato no comprueba que la API funcione. Comprueba que la API **sea la que
dijo que era**. Son dos preguntas distintas y la segunda casi nunca se hace, porque la
primera ya da verde.

Este documento dice qué promete el contrato de la API de ejemplo, cuáles de esas promesas se
pueden romper sin que nadie se entere, y cuáles se quedaron fuera de la suite con su motivo.

---

## El oráculo es un archivo, no mi criterio

El contrato vive en [`demo/openapi.yaml`](../demo/openapi.yaml) y es **lo único** que decide
si una respuesta está bien. No el código de la API, no lo que parezca razonable, no lo que
el campo lleve devolviendo desde siempre.

Esa frase suena obvia y tiene una consecuencia incómoda: cuando la respuesta y el contrato
discrepan, **el que está mal no es automáticamente el código**. Puede estar mal el contrato,
y entonces el defecto es de diseño y se arregla antes, en el YAML. Un equipo que da por
sentado que el código manda no tiene pruebas de contrato: tiene pruebas de regresión con
otro nombre.

Por eso el contrato se revisa como código. [Spectral](../spectral.yaml) lo revisa en el
CI con el conjunto oficial de OpenAPI más cuatro reglas endurecidas a propósito:

| Regla | Por qué es error aquí |
| --- | --- |
| `operation-description` | Un endpoint sin descripción obliga a leer el código para saber qué hace, y entonces el contrato ya no es la fuente de verdad |
| `operation-operationId` | Sin identificador estable no se puede referenciar un endpoint desde la matriz de trazabilidad |
| `operation-tags` | Sin agrupación, un contrato de treinta endpoints es ilegible y nadie lo revisa |
| `oas3-valid-media-example` | Un ejemplo que no cumple su propio esquema es una trampa para quien implemente el cliente |

Lo que el linter no obliga a escribir, **las aserciones lo tienen que adivinar**. La
ambigüedad del contrato se traslada entera a la suite, y ahí ya no se ve.

## Qué hay que probar

Siete endpoints, tres de ellos públicos:

| Endpoint | Sesión | Qué promete |
| --- | :-: | --- |
| `GET /salud` | — | Si el proceso responde y en qué modo arrancó |
| `POST /sesiones` | — | Cambia usuario y clave por un token de portador, con rol y caducidad |
| `GET /especialidades` | — | El catálogo completo, sin paginar |
| `GET /citas` | sí | Una página de citas **y el total de la colección** |
| `POST /citas` | sí | Crea una cita, responde 201 y dice en `location` dónde quedó |
| `GET /citas/{id}` | sí | Una cita: **el mismo objeto `Cita` que trae la colección** |
| `DELETE /citas/{id}` | rol `GESTOR` | Anula una cita y responde 204 sin cuerpo |

Dos roles: `LECTOR` consulta, `GESTOR` consulta y anula. La diferencia importa para el
contrato porque obliga a distinguir **401 de 403**, que es una de esas cosas que casi todas
las APIs hacen mal.

## Las cuatro promesas que se rompen en silencio

De todo lo que promete el contrato, hay cuatro cosas que se pueden romper **sin que cambie
ningún código de estado**. Son las que de verdad justifican escribir una suite de contrato,
porque son exactamente las que una prueba funcional no ve.

### El tipo de un campo

El contrato dice que `pacienteId` es una cadena con la forma `PAC-0000` y que `creadoEn` es
una fecha ISO 8601 con zona. Si el detalle empieza a devolver un número y un epoch en
milisegundos:

```diff
- "pacienteId": "PAC-0001",  "creadoEn": "2026-11-01T23:50:26.758Z"
+ "pacienteId": 1,           "creadoEn": 1793577026751
```

La respuesta sigue siendo un 200. Los dos campos **siguen estando**. Los dos siguen teniendo
un valor con sentido. Una prueba que compruebe `pacienteId != null` pasa; una que compruebe
`'#present'` también. El cliente que concatene el identificador en una URL recibirá
`/pacientes/1` y recibirá un 404 en producción, tres semanas después, y nadie lo relacionará
con este cambio.

Por eso el esquema de la suite no pregunta si el campo está, **pregunta de qué forma es**:

```js
pacienteId: '#regex ^PAC-\\d{4}$',
creadoEn: ISO_8601,
```

### La coherencia entre dos endpoints

El contrato dice que `GET /citas/{id}` devuelve el mismo objeto `Cita` que aparece en
`GET /citas`. Esa promesa **no se puede comprobar mirando un endpoint cada vez**: los dos
pueden cumplir su esquema por separado y contradecirse entre ellos.

Es el único caso de esta suite que no se puede escribir leyendo una sola respuesta, y es
[CP-13](02-diseno-de-casos.md#cp-13). Pide la colección, se guarda un elemento, pide el
detalle de ese mismo elemento y compara los dos objetos entre sí.

### El significado de un número

`total` es un entero. Un entero siempre es un entero válido. Lo que el contrato promete no
es el tipo, es **qué cuenta ese número**:

> El total de citas de la colección, no el tamaño de esta página. Quien pagine suma `limite`
> hasta alcanzar este número.

Si `total` pasa a devolver el tamaño de la página, un cliente que pagine se queda con la
primera página creyendo que vio todo. La respuesta es un 200 con un número correcto. Lo
único que está mal es lo que ese número significa, y eso no cabe en un esquema.

Se comprueba preguntando dos veces y **comparando las respuestas entre sí**, sin número
mágico, para que el caso siga valiendo cuando cambien los datos de siembra.

### Que un endpoint exija sesión

El contrato marca `POST /citas` como autenticado. Si por un error de configuración queda
público, la API crea citas sin token y responde **201**, el mismo código que el caso bueno.
Nada en la respuesta delata el agujero: hay que preguntarlo explícitamente, mandando la
petición sin cabecera y exigiendo un 401.

Es el incumplimiento más grave de los cuatro y el que menos se nota: una suite que solo
cubre el camino feliz **lo tiene cien por cien verde**.

## Lo que el contrato no promete, y por eso no se comprueba

Esta parte es la que distingue una suite de contrato de una colección de aserciones
ocurrentes. Cada cosa que se exige sin que el contrato la prometa es una regla inventada que
alguien tendrá que borrar cuando la API cambie legítimamente.

| Lo que se podría exigir | Por qué no se exige |
| --- | --- |
| Un `400` al pedir `limite=999` | El contrato declara `maximum: 50`, pero **no promete rechazar** un valor mayor. Lo que se comprueba es que la respuesta no pase de 50, que es lo que sí está escrito |
| El orden de las citas en la colección | El contrato no declara orden. Exigirlo convertiría un detalle de implementación en requisito |
| Qué `id` recibe la cita siguiente | El contrato declara la **forma** (`^CITA-\d{4}$`), no la secuencia. [CP-25](02-diseno-de-casos.md#cp-25) comprueba que no se reutilice uno ocupado, que es otra cosa |
| Cuánto tarda cada endpoint | No hay requisito de latencia en el contrato. Eso es otro repositorio: [`k6-performance-suite`](https://github.com/Girek-Study/k6-performance-suite) |
| El texto exacto de `detalle` en un error | El contrato promete que existe y que no está vacío. Fijar el texto rompería la suite en cada corrección de redacción |

Y una que sí se comprueba aunque parezca de las anteriores: **que el error de credenciales
no distinga entre clave mala y usuario inexistente**. Eso no está en el YAML como regla, pero
sí está el esquema de error con un único `codigo`, y los dos casos devuelven
`CREDENCIALES_INVALIDAS`. Está en [CP-03 y CP-04](02-diseno-de-casos.md) porque un error que
delata qué usuarios existen es un defecto de seguridad, no una preferencia de redacción.

---

Siguiente: [2. Diseño de casos](02-diseno-de-casos.md) — los 25 casos, qué técnica usa cada
uno y por qué.
