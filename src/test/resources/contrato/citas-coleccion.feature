Feature: GET /citas — la colección y su paginación

  Background:
    * def sesion = call read('classpath:contrato/autenticacion.feature') credenciales.gestor
    * url urlBase
    # `configure headers` y no `header`. En Karate, un `header` dura UNA
    # petición: la siguiente sale sin él. Los escenarios de aquí piden dos
    # veces, y con `header` la segunda iba sin token y respondía 401, así que
    # el caso fallaba por un error de la prueba mientras parecía un 401 de la
    # API. Con `configure` la cabecera dura el escenario entero.
    * def autorizacion = 'Bearer ' + sesion.token
    * configure headers = { Authorization: '#(autorizacion)' }

  @CP-08
  Scenario: La colección devuelve citas que cumplen el esquema de Cita
    Given path 'citas'
    When method get
    Then status 200
    And match response == { datos: '#array', total: '#number' }
    # `match each` aplica el esquema a todos los elementos. Con
    # `match response.datos[0]` se comprobaría el primero y se darían por
    # buenos los demás, que es donde se esconde el que vino de otro sitio.
    And match each response.datos == esquemas.cita

  @CP-09
  Scenario: Sin token, la colección no se consulta
    # Para quitar lo que puso `configure headers` hace falta anularlo: un
    # `header Authorization = null` no pisa la configuración del Background.
    * configure headers = null
    Given path 'citas'
    When method get
    Then status 401
    And match response == esquemas.error
    And match response.error.codigo == 'NO_AUTENTICADO'

  @CP-10
  Scenario: El total es el de la colección, no el de la página
    # Sin número mágico: se pregunta dos veces y se comparan las respuestas
    # entre sí. Así el caso sigue valiendo cuando cambien los datos de siembra.
    Given path 'citas'
    When method get
    Then status 200
    * def totalSinPaginar = response.total
    * def cuantasHay = response.datos.length
    # El caso solo tiene sentido si hay más de una cita que pedir.
    * assert cuantasHay > 1

    Given path 'citas'
    And param limite = 1
    When method get
    Then status 200
    And match response.datos == '#[1]'
    # Y aquí está la pregunta: al pedir una sola cita, ¿`total` sigue diciendo
    # cuántas hay en total? El contrato dice que sí, porque es el número con el
    # que un cliente decide si le queda otra página por pedir.
    And match response.total == totalSinPaginar

  @CP-11
  Scenario: El límite tiene tope y la respuesta no lo pasa
    Given path 'citas'
    And param limite = 999
    When method get
    Then status 200
    # El contrato declara maximum: 50. Lo que se comprueba es que la respuesta
    # lo respete, no que el servicio rechace el 999: el contrato no promete un
    # 400 ahí, y exigirlo sería inventar una regla que nadie escribió.
    And assert response.datos.length <= 50
