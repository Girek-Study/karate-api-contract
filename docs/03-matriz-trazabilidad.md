# 3. Matriz de trazabilidad

Una promesa del contrato por fila. La columna de la derecha dice qué escenario la comprueba,
y **cuatro filas no tienen ninguno**: están aquí con su motivo, que es la única razón por la
que una matriz sirve para algo.

El oráculo de todas las filas es [`demo/openapi.yaml`](../demo/openapi.yaml). Cuando una fila
dice «el contrato promete», se puede ir a comprobar que lo promete.

---

## `POST /sesiones`

| # | El contrato promete | Caso |
| --- | --- | :-: |
| S-1 | Usuario y clave válidos devuelven **201** con `token`, `rol` y `expiraEn` | CP-01, CP-02 |
| S-2 | `token` tiene formato **uuid** | CP-01, CP-02 |
| S-3 | `rol` solo puede ser `LECTOR` o `GESTOR` | CP-01, CP-02 |
| S-4 | `expiraEn` es una fecha **ISO 8601 con zona** | CP-01, CP-02 |
| S-5 | Credenciales inválidas devuelven **401** con el esquema de error | CP-03, CP-05 |
| S-6 | El error **no distingue** clave mala de usuario inexistente | CP-03 + CP-04 |
| S-7 | El endpoint es **público** (`security: []`) | CP-01 |

`expiraEn` está en cuatro filas y es el campo que más fácil se degrada a un epoch sin que
nadie lo note, porque un número grande en un campo de fecha sigue pareciendo una fecha.

## `GET /especialidades`

| # | El contrato promete | Caso |
| --- | --- | :-: |
| E-1 | Devuelve **200** con `datos` y `total` | CP-06 |
| E-2 | **Cada** especialidad cumple el esquema `Especialidad` | CP-06 |
| E-3 | `duracionMinutos` es un entero entre 5 y 120 | CP-06 |
| E-4 | El catálogo **no se pagina**: `total` es el tamaño de `datos` | CP-07 |
| E-5 | El endpoint es **público** | CP-06 |

## `GET /citas`

| # | El contrato promete | Caso |
| --- | --- | :-: |
| C-1 | Devuelve **200** con `datos` y `total` | CP-08 |
| C-2 | **Cada** cita cumple el esquema `Cita` | CP-08 |
| C-3 | `total` es el total de la **colección**, no el de la página | **CP-10** |
| C-4 | `limite` tiene tope de **50** y la respuesta lo respeta | CP-11 |
| C-5 | `limite` acotado devuelve exactamente ese número de citas | CP-10 |
| C-6 | Sin token devuelve **401** con `NO_AUTENTICADO` | CP-09 |
| C-7 | `limite` fuera de rango produce un **400** | — ⬇ |

**C-7 no tiene caso, a propósito.** El contrato declara `maximum: 50`, pero no promete
rechazar un valor mayor. Exigir un 400 ahí sería inventar una regla que nadie escribió, y la
suite acabaría rota el día que la API cambie legítimamente. Lo que sí se comprueba es C-4:
que la respuesta no pase de 50.

## `GET /citas/{id}`

| # | El contrato promete | Caso |
| --- | --- | :-: |
| D-1 | Devuelve **200** con el esquema `Cita` completo | CP-12 |
| D-2 | Es **el mismo objeto** que trae la colección: mismos campos y mismos tipos | **CP-13** |
| D-3 | `pacienteId` es una cadena con la forma `PAC-0000` | CP-12, CP-13 |
| D-4 | `creadoEn` es ISO 8601 con zona | CP-12, CP-13 |
| D-5 | Un id que no existe devuelve **404** con `CITA_NO_ENCONTRADA` | CP-14 |
| D-6 | Sin token devuelve **401** | CP-15 |
| D-7 | Un id con forma inválida (`abc`) devuelve 400 o 404 | — ⬇ |

**D-7 no tiene caso.** El contrato declara el patrón del parámetro de ruta pero **no declara
qué responde** si no se cumple: ni 400 ni 404 están escritos. Un caso aquí exigiría elegir
uno de los dos por mi cuenta. Lo que corresponde es completar el contrato primero; mientras
no esté, la fila se queda sin cubrir y dicho.

## `POST /citas`

| # | El contrato promete | Caso |
| --- | --- | :-: |
| N-1 | Una cita válida devuelve **201** con el esquema `Cita` | CP-16 |
| N-2 | La cabecera **`location`** apunta a la cita creada | CP-16 |
| N-3 | La cita nace en estado `CONFIRMADA` | CP-16 |
| N-4 | **Exige sesión**: sin token devuelve 401 y no crea nada | **CP-17** |
| N-5 | Un cuerpo inválido devuelve **400** con `campos` | CP-18, CP-19 |
| N-6 | `campos` trae **todos** los campos mal, no el primero | CP-18 |
| N-7 | Cada elemento de `campos` tiene `campo` y `motivo` | CP-18 |
| N-8 | Un campo obligatorio ausente se trata como inválido | CP-19 |
| N-9 | Mismo horario y misma especialidad devuelve **409** | CP-20 |
| N-10 | Un rol `LECTOR` **puede** crear citas | — ⬇ |

**N-10 no tiene caso, y esta es la fila incómoda.** El contrato exige sesión en `POST /citas`
pero **no restringe el rol**, mientras que en `DELETE` sí exige `GESTOR` explícitamente. O el
contrato está incompleto, o la asimetría es deliberada. No lo sé, y no es mío decidirlo:
escribir un caso que exija 201 con rol lector congelaría en la suite una interpretación que
nadie confirmó.

Es exactamente el tipo de hueco que una matriz existe para encontrar. Cubrirlo a ojo habría
sido peor que dejarlo.

## `DELETE /citas/{id}`

| # | El contrato promete | Caso |
| --- | --- | :-: |
| A-1 | Un `GESTOR` anula y recibe **204** | CP-21 |
| A-2 | El 204 llega **sin cuerpo** | CP-21 |
| A-3 | Tras anular, el detalle devuelve **404** | CP-21 |
| A-4 | Un `LECTOR` recibe **403**, no 401 | **CP-22** |
| A-5 | Una cita que no existe devuelve **404** | CP-23 |
| A-6 | Sin token devuelve **401** | CP-24 |
| A-7 | Anular **no libera el identificador** para la siguiente cita | **CP-25** |
| A-8 | Anular dos veces la misma cita devuelve 404 la segunda | — ⬇ |

**A-7 no sale del contrato.** El contrato declara la forma del id (`^CITA-\d{4}$`), no su
secuencia. La fila existe porque un id reutilizado sobreescribe la cita de otro paciente
respondiendo 201, y eso incumple algo que el contrato sí promete: que `GET /citas/{id}`
devuelva **la** cita. Es el [H-01](05-hallazgos.md#h-01) y el caso nació del defecto, no del
YAML.

**A-8 no tiene caso** porque es un subcaso de A-5: tras la primera anulación la cita no
existe, y A-5 ya cubre qué pasa con una cita que no existe. Un caso más no añadiría
información; añadiría una línea al informe.

---

## El recuento

| | Filas | Con caso | Sin caso |
| --- | :-: | :-: | :-: |
| `POST /sesiones` | 7 | 7 | 0 |
| `GET /especialidades` | 5 | 5 | 0 |
| `GET /citas` | 7 | 6 | 1 |
| `GET /citas/{id}` | 7 | 6 | 1 |
| `POST /citas` | 10 | 9 | 1 |
| `DELETE /citas/{id}` | 8 | 7 | 1 |
| **Total** | **44** | **40** | **4** |

40 de 44, y **las cuatro que faltan están nombradas con su motivo**. Dos por lo mismo (el
contrato no promete qué responder), una por elección ajena (N-10, la asimetría de roles) y
una por redundante (A-8).

Ninguna de las cuatro se cubre «por si acaso». Un caso que exige algo que el contrato no
promete no protege nada: **frena el día que la API cambie de forma legítima**, y lo que hace
el equipo entonces es borrar el caso. Después de borrar dos o tres, deja de leer los demás.

## Las filas en negrita

Cinco filas están en negrita en las tablas de arriba: **C-3, D-2, N-4, A-4 y A-7**. Son las
cinco que un camino feliz no ve, y en tres de ellas —C-3, D-2 y N-4— viven los cuatro
incumplimientos que la API de ejemplo trae a propósito. Las otras dos salieron de defectos
que no había puesto nadie: A-7 del [H-01](05-hallazgos.md#h-01), y A-4 de la confusión entre
401 y 403, que es el error de diseño más repetido en APIs con roles.

Si esta matriz solo tuviera las otras 39 filas, la suite estaría **verde entera** contra una
API que devuelve tipos cambiados, cuenta mal la paginación y deja crear citas sin
credenciales.

---

Siguiente: [5. Hallazgos](05-hallazgos.md) — qué encontró la suite, y qué encontré yo
escribiéndola.
