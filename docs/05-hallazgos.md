# 5. Hallazgos

**Cuatro los puse yo a propósito. Cinco no.**

Los cuatro primeros son los incumplimientos que la API de ejemplo trae de serie y que existen
para demostrar que la suite sirve: se apagan con `API_CONFORME=1`, y el CI exige que la suite
los detecte todos.

Los cinco siguientes aparecieron montando esto. Ninguno se manifestaba como un error: cuatro
de los cinco producían **verde**, y el quinto producía un rojo que no era de quien parecía.
Están corregidos, y cada uno dice con qué.

| Id | Resumen | Severidad | Origen |
| --- | --- | :-: | :-: |
| [C-01](#c-01) | El detalle cambia el tipo de dos campos y responde 200 | **Alta** | a propósito |
| [C-02](#c-02) | `total` devuelve el tamaño de la página, no el de la colección | **Alta** | a propósito |
| [C-03](#c-03) | `POST /citas` crea sin token y responde 201 | **Crítica** | a propósito |
| [H-01](#h-01) | Anular una cita libera su id y la siguiente creación sobreescribe | **Alta** | mío |
| [H-02](#h-02) | La suite corría **cero** escenarios y el build salía en verde | **Alta** | mío |
| [H-03](#h-03) | La versión del motor de JUnit no se elige: se copia | Media | mío |
| [H-04](#h-04) | Ocho rojos atribuidos a la API que eran de la prueba | Media | mío |
| [H-05](#h-05) | La suite pasaba la primera corrida y fallaba la segunda | **Alta** | mío |
| [H-06](#h-06) | Las primeras comprobaciones iban contra otro servicio | Baja | mío |

---

# Parte 1 · Los cuatro de adorno

Son cuatro incumplimientos y tres hallazgos, porque dos de ellos viven en la misma respuesta.

## C-01

**El detalle cambia el tipo de dos campos y responde 200**

| | |
| --- | --- |
| **Dónde** | `GET /citas/{id}` |
| **Contrato** | `pacienteId` es `string` con patrón `^PAC-\d{4}$`; `creadoEn` es `string` con `format: date-time` |
| **Lo detecta** | CP-12 (esquema) y **CP-13** (comparación entre endpoints) |
| **Severidad** | Alta |

La misma cita, pedida por los dos endpoints, en la misma corrida:

```jsonc
// GET /citas          → datos[0]
{"id":"CITA-0001", "creadoEn":"2026-11-02T04:39:25.203Z", "pacienteId":"PAC-0001", ...}

// GET /citas/CITA-0001
{"id":"CITA-0001", "creadoEn":1793594365203,              "pacienteId":1,          ...}
```

Las dos respuestas son **200**. Las dos traen los seis campos. Los dos valores de
`pacienteId` son verdad: el paciente 1 es `PAC-0001`. Un cliente que concatene el
identificador recibirá `/pacientes/1` y un 404, en producción, semanas después, sin que nadie
lo relacione con este cambio.

Lo que lo detecta no es la comprobación obvia. `'#present'` pasa, `!= null` pasa, y
`'#notnull'` pasa. Hace falta preguntar **de qué forma** es el valor:

```js
pacienteId: '#regex ^PAC-\\d{4}$',
creadoEn:   '#regex ^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$',
```

Y hay un segundo camino, que es el que de verdad me interesa: **CP-13 compara el objeto de la
colección con el del detalle**. No necesita saber qué forma tiene ningún campo. Solo necesita
que el contrato prometa que los dos endpoints devuelven lo mismo, que es lo que promete.

```gherkin
* def deLaColeccion = response.datos[0]
Given path 'citas', deLaColeccion.id
When method get
And match response == deLaColeccion
```

Tres líneas, cero esquemas, y caza cualquier divergencia futura entre los dos endpoints,
incluidas las que no se me han ocurrido.

## C-02

**`total` devuelve el tamaño de la página, no el de la colección**

| | |
| --- | --- |
| **Dónde** | `GET /citas` con `limite` |
| **Contrato** | «El total de citas de la colección, no el tamaño de esta página. Quien pagine suma `limite` hasta alcanzar este número» |
| **Lo detecta** | **CP-10** |
| **Severidad** | Alta |

```
GET /citas            → total=3  datos=3
GET /citas?limite=1   → total=1  datos=1     ← debería decir total=3
```

Un entero siempre es un entero válido, así que ningún esquema ve esto. Lo que está mal no es
el tipo, es **qué cuenta el número**. Y la consecuencia es silenciosa en la dirección peor:
el cliente pide la primera página, compara `datos.length` con `total`, le cuadra, y deja de
pedir. **Se queda con una cita de tres creyendo que vio la agenda entera.**

La forma de comprobarlo que no se rompe nunca es preguntar dos veces y comparar las
respuestas, sin ningún número escrito en la prueba:

```gherkin
* def totalSinPaginar = response.total
* assert cuantasHay > 1              # precondición: con una sola cita el caso no puede fallar
...
And param limite = 1
And match response.total == totalSinPaginar
```

Ese `assert` es la mitad del caso. Sin él, con una cita en la colección el escenario pasaría
siempre y el defecto quedaría invisible: `total` valdría 1 en las dos peticiones.

## C-03

**`POST /citas` crea sin token y responde 201**

| | |
| --- | --- |
| **Dónde** | `POST /citas` |
| **Contrato** | El endpoint está bajo el esquema de seguridad `portador`; sin token debe responder 401 y no crear nada |
| **Lo detecta** | **CP-17** |
| **Severidad** | Crítica |

```http
POST /citas            (sin cabecera Authorization)
→ 201
  {"id":"CITA-0004","estado":"CONFIRMADA","pacienteId":"PAC-0043", ...}
```

Cualquiera, sin credenciales, escribe en la agenda. Y **el código de éxito es el mismo que el
del caso bueno**: no hay nada en la respuesta que delate el agujero. Una suite que solo cubre
el camino feliz lo tiene cien por cien verde, y una revisión de código lo ve si alguien se
fija en que un `get publica()` devuelve lo contrario de lo que debería.

La única forma de verlo es mandar la petición mal a propósito y exigir el 401. En Karate, con
una cabecera puesta en el `Background`, eso tiene una trampa propia que está en
[H-04](#h-04): un `header Authorization = null` **no** quita lo que puso
`configure headers`. Hace falta anular la configuración entera:

```gherkin
* configure headers = null
```

De los cuatro, este es el que más me importa que esté. Los otros tres son defectos de
contrato; este es un agujero de autorización que llega a producción con todas las pruebas en
verde.

---

# Parte 2 · Los cinco que no puse yo

## H-01

**Anular una cita libera su identificador, y la siguiente creación sobreescribe la de otro
paciente**

| | |
| --- | --- |
| **Cómo se vio** | Leyendo el generador de identificadores para escribir la matriz de trazabilidad |
| **Severidad** | Alta |
| **Lo detecta ahora** | **CP-25**, que nació de aquí |

El id se calculaba a partir del tamaño de la colección:

```js
const id = `CITA-${String(citas.size + 1).padStart(4, '0')}`;
```

Al anular, el tamaño baja. La creación siguiente reutiliza un id ocupado, y `citas.set`
**sobreescribe**. Reproducido con tres citas sembradas:

```
GET /citas                  → 3 citas: CITA-0001, CITA-0002, CITA-0003
DELETE /citas/CITA-0002     → 204
POST /citas (PAC-9999)      → 201  {"id":"CITA-0003", "pacienteId":"PAC-9999", ...}
GET /citas                  → 2 citas: CITA-0001, CITA-0003
```

**La cita de PAC-0003 desapareció.** Un 204 y un 201, los dos códigos correctos, y una cita
menos de la que debería haber. En una agenda real eso es un paciente que se presenta a una
hora que ya es de otro.

Lo que más me interesa de este hallazgo: **la suite de 24 escenarios no lo detectaba**.
Pasaba entera contra la API conforme. Y no por falta de rigor en las aserciones, sino porque
ningún endpoint lo delata por separado: hay que **crear, anular y volver a crear en ese
orden**, y eso no sale de leer el contrato endpoint por endpoint. Sale de preguntarse qué
pasa después.

Que CP-25 lo detecta no es una afirmación, es una medición. Reintroduje el defecto a
propósito y volví a correr la suite entera:

```
[ERROR] contrato/citas-anulacion.[5:66] Anular una cita no libera su identificador
                                        para la siguiente  <<< FAILURE!
[ERROR] Tests run: 25, Failures: 5, Errors: 0, Skipped: 0
```

**Cinco** fallos en vez de cuatro, y el quinto es el caso nuevo. Esa es también la razón por
la que el CI cuenta los fallos en vez de conformarse con un rojo: un defecto nuevo cambia el
número, y un número distinto del esperado pone el CI rojo aunque la suite «falle» como debe.

**Corregido** con un contador que sube y no baja nunca:

```js
let siguienteId = 0;

function nuevoId() {
  siguienteId += 1;
  return `CITA-${String(siguienteId).padStart(4, '0')}`;
}
```

Y se arregló, en vez de documentarse como quinto incumplimiento de adorno, porque **no era de
adorno**. Los cuatro de la parte 1 están ahí para demostrar algo; este era un defecto de
verdad en código mío, y dejarlo para que luciera habría sido exactamente la clase de trampa
que esta carpeta existe para no hacer.

## H-02

**La suite corría cero escenarios y el build salía en verde**

| | |
| --- | --- |
| **Cómo se vio** | Mirando por qué una corrida tardaba cuatro segundos |
| **Medido** | `Tests run: 0, Failures: 0, Errors: 0, Skipped: 0` · `BUILD SUCCESS` |
| **Severidad** | Alta |

```
[INFO] Tests run: 0, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

Esas dos líneas son indistinguibles de una corrida perfecta si no se lee el cero. El código
de salida es 0. El CI se pone verde. **El informe dice que no hay defectos porque no se buscó
ninguno.**

La causa inmediata: Maven no copiaba los `.feature` al classpath, así que `Karate.run` no
encontraba nada. Maven filtra `src/test/resources` según su configuración por defecto y, con
el `pom.xml` como estaba, los recursos de prueba no llegaban a `target/test-classes`.

**Corregido** declarándolos explícitamente:

```xml
<testResources>
  <testResource>
    <directory>src/test/resources</directory>
  </testResource>
</testResources>
```

Y **corregido también en el CI**, que es lo que de verdad lo tapa. El trabajo `detecta` no se
conforma con que la suite falle: exige **cuatro fallos exactos**.

```bash
if [ "$FALLOS" != "4" ]; then
  echo "::error::Se esperaban 4 escenarios en rojo y hubo $FALLOS."
  exit 1
fi
```

Una suite de cero escenarios da cero fallos. Cero no es cuatro. Es el único control de este
repositorio que distingue «pasó» de «no comprobó nada», y es el que casi ninguna suite tiene.

De aquí sale lo único que de verdad quiero que se lea de esta carpeta:

> Una suite que nunca ha visto un rojo que le corresponda **no ha demostrado nada**. El verde
> de una suite vacía y el verde de una suite completa son el mismo pixel.

## H-03

**La versión del motor de JUnit no se elige: se copia de lo que arrastra Karate**

| | |
| --- | --- |
| **Cómo se vio** | `TestEngine with ID 'junit-jupiter' failed to discover tests` |
| **Severidad** | Media |

Declaré `junit-jupiter-engine` en 5.11.4, que era la última. Karate 1.5.1 arrastra
`junit-jupiter-api:5.10.2`, y con ella `junit-platform-commons:1.10.2`. El resultado es un
`junit-platform-engine:1.11.4` conviviendo con un `junit-platform-commons:1.10.2`, y **JUnit
Platform no tolera dos versiones distintas de sí mismo**.

El síntoma no dice nada de eso:

```
TestEngine with ID 'junit-jupiter' failed to discover tests
Tests run: 0
```

Y `Tests run: 0` es exactamente el síntoma de [H-02](#h-02), que es otro problema. Dos causas
distintas con el mismo número en pantalla.

El diagnóstico salió de `mvn dependency:tree`, no de leer el error. **Corregido** copiando la
versión en vez de elegirla:

```xml
<!-- Esta versión NO se elige, se copia de la que arrastra Karate. -->
<junit.version>5.10.2</junit.version>
```

La lección es de las que no se olvidan: en un proyecto con Karate, **la versión de JUnit la
decide Karate**. Poner la última es una suposición, y el precio es una suite que no corre
pareciendo que corre.

## H-04

**Ocho rojos atribuidos a la API que eran de la prueba**

| | |
| --- | --- |
| **Cómo se vio** | Esperaba 4 fallos y salieron 8 |
| **Severidad** | Media |

Los cuatro de más tenían dos causas, y las dos son trampas de la DSL de Karate que no avisan:

**1. `path` se vacía después de cada `method`.** Un `path` en el `Background` solo vale para
la primera petición del escenario. La segunda salía contra la raíz y recibía un 404 que
parecía de la API.

**2. `header` dura UNA petición.** `configure headers` dura el escenario. Los escenarios que
piden dos veces mandaban la segunda sin token, recibían un 401, y el 401 parecía del endpoint.

```gherkin
# mal — la segunda petición va sin token
* header Authorization = 'Bearer ' + sesion.token

# bien — dura el escenario entero
* configure headers = { Authorization: '#(autorizacion)' }

# y para quitarla en un escenario concreto, hay que anular la configuración:
* configure headers = null        # un `header ... = null` NO la pisa
```

Esto es más grave de lo que parece en una suite que ya está publicada. **Un fallo de la prueba
atribuido a la API es un informe de calidad que denuncia un defecto inexistente.** La segunda
vez que pasa, el equipo de desarrollo deja de leer el informe, y a partir de ahí la suite ya
no sirve aunque esté bien.

**Lo que lo tapa ahora** es el segundo trabajo del CI: `no-miente` levanta la API conforme al
contrato y exige que la suite pase **entera**. Si una aserción inventa un defecto, sale ahí y
no en un correo a desarrollo.

## H-05

**La suite pasaba la primera corrida y fallaba la segunda**

| | |
| --- | --- |
| **Cómo se vio** | Un `409, expected: 201` en `citas-anulacion` que no había salido antes |
| **Severidad** | Alta |

La API guarda las citas en memoria, y el contenedor **sobrevive entre corridas**:
`docker compose run` reutiliza el servicio levantado. Con horarios fijos en los escenarios, la
primera corrida creaba las citas y la segunda se encontraba un 409 donde esperaba un 201.

El orden importa: **pasó primero, falló después**. Si hubiera fallado siempre lo habría visto
en el mismo minuto. Una suite que pasa la primera vez se publica.

**Corregido** con un instante propio por corrida:

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

Y una decisión que va con esto: **se arregló aquí y no reiniciando el servidor**. Reiniciar
habría funcionado en mi máquina y habría movido el problema a la de cualquiera que corra la
suite contra un entorno compartido. Una suite que exige un estado inicial exacto acaba
exigiéndolo en el entorno de alguien que no puede reiniciar nada, y ese alguien es siempre el
que más necesita correrla.

## H-06

**Las primeras comprobaciones iban contra otro servicio**

| | |
| --- | --- |
| **Cómo se vio** | Un `200` con HTML donde esperaba JSON |
| **Severidad** | Baja |

La API arrancaba en el 8080. En la máquina donde se escribió esto, el 8080 lo tenía un
Adminer en un contenedor de otro proyecto, que respondía **200 con la página de login**. La
primera tanda de comprobaciones fue contra él.

Es un hallazgo menor y lo cuento por una razón: **un 200 no significa que estés hablando con
quien crees**. La suite tiene ahora dos cosas por eso:

- El puerto por defecto es **8090**, no el puerto más ocupado de cualquier equipo de
  desarrollo.
- El CI pide `/salud` y **comprueba en qué modo arrancó la API** antes de correr nada:

```bash
curl -s http://localhost:8090/salud | grep -q '"conforme":true'
```

Sin esa línea, el trabajo `no-miente` podría correr contra una API defectuosa y fallar por el
motivo del otro trabajo, dejando un CI rojo que apunta al sitio equivocado.

---

## Lo que se lleva de aquí

Cuatro de los nueve hallazgos de este documento producían **verde**:

| Lo que decía el informe | Lo que pasaba de verdad |
| --- | --- |
| `BUILD SUCCESS` | **Cero escenarios** ejecutados |
| 24 escenarios, 0 fallos | Una cita se borraba sola al anular otra ([H-01](#h-01)) |
| La suite pasa | Pasaba **una vez**; la siguiente corrida fallaba ([H-05](#h-05)) |
| 200 OK | Era un Adminer de otro proyecto ([H-06](#h-06)) |

En pruebas funcionales de interfaz, un defecto en la prueba produce un rojo que alguien
investiga. **En una suite de contrato produce un informe de conformidad**, y un informe de
conformidad se adjunta a un pase a producción.

Por eso el CI de este repositorio tiene dos trabajos y no uno. La pregunta que contesta el
primero no es «¿pasa la suite?», es:

> ¿Esta suite **habría sido capaz** de detectar el problema que dice que no existe?

Antes de escribir estos documentos, para cuatro de los nueve hallazgos, la respuesta medida
era **no**.
