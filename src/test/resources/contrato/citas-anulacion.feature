Feature: DELETE /citas/{id} — anular una cita

  Background:
    * def gestor = call read('classpath:contrato/autenticacion.feature') credenciales.gestor
    * def lector = call read('classpath:contrato/autenticacion.feature') credenciales.lector
    * url urlBase

  @CP-21
  Scenario: Un gestor anula una cita que él mismo creó
    # El escenario crea su propio dato en vez de borrar uno de la siembra: así
    # no deja la colección distinta para los casos que vengan después.
    Given path 'citas'
    And header Authorization = 'Bearer ' + gestor.token
    And request { pacienteId: 'PAC-0077', especialidad: 'OFTAL', inicio: '#(unInstanteLibre(40))' }
    When method post
    Then status 201
    * def creada = response.id

    Given path 'citas', creada
    And header Authorization = 'Bearer ' + gestor.token
    When method delete
    Then status 204
    # 204 significa sin cuerpo. Un 204 con JSON dentro rompe a los clientes
    # que no intentan parsear nada.
    And match response == ''

    Given path 'citas', creada
    And header Authorization = 'Bearer ' + gestor.token
    When method get
    Then status 404

  @CP-22
  Scenario: Un lector no puede anular, y el error distingue permiso de identidad
    Given path 'citas'
    And header Authorization = 'Bearer ' + gestor.token
    And request { pacienteId: 'PAC-0078', especialidad: 'MED-GEN', inicio: '#(unInstanteLibre(50))' }
    When method post
    Then status 201
    * def creada = response.id

    Given path 'citas', creada
    And header Authorization = 'Bearer ' + lector.token
    When method delete
    # 403 y no 401: el lector está autenticado, lo que le falta es permiso.
    # Devolver 401 aquí manda al cliente a renovar un token que está bien.
    Then status 403
    And match response == esquemas.error
    And match response.error.codigo == 'SIN_PERMISO'

  @CP-23
  Scenario: Anular una cita que no existe devuelve 404
    Given path 'citas', 'CITA-8888'
    And header Authorization = 'Bearer ' + gestor.token
    When method delete
    Then status 404
    And match response == esquemas.error

  @CP-24
  Scenario: Sin token no se anula nada
    Given path 'citas', 'CITA-0001'
    When method delete
    Then status 401
    And match response == esquemas.error

  @CP-25
  Scenario: Anular una cita no libera su identificador para la siguiente
    # Este caso nació de un defecto de verdad, no de los cuatro de adorno. El
    # id se calculaba con `citas.size + 1`, así que al anular bajaba el tamaño
    # y la creación siguiente reutilizaba un id ocupado: el `set` sobreescribía
    # la cita de otro paciente y respondía 201. Con tres citas sembradas,
    # anular la segunda y crear una dejaba la colección en dos.
    #
    # Ningún endpoint lo delataba por separado. Hay que crear dos, anular la
    # primera y mirar qué id recibe la tercera, que es una secuencia que nadie
    # ejecuta mirando un endpoint cada vez.
    Given path 'citas'
    And header Authorization = 'Bearer ' + gestor.token
    And request { pacienteId: 'PAC-0081', especialidad: 'MED-GEN', inicio: '#(unInstanteLibre(60))' }
    When method post
    Then status 201
    * def primera = response.id

    Given path 'citas'
    And header Authorization = 'Bearer ' + gestor.token
    And request { pacienteId: 'PAC-0082', especialidad: 'MED-GEN', inicio: '#(unInstanteLibre(70))' }
    When method post
    Then status 201
    * def segunda = response.id

    Given path 'citas', primera
    And header Authorization = 'Bearer ' + gestor.token
    When method delete
    Then status 204

    Given path 'citas'
    And header Authorization = 'Bearer ' + gestor.token
    And request { pacienteId: 'PAC-0083', especialidad: 'MED-GEN', inicio: '#(unInstanteLibre(80))' }
    When method post
    Then status 201
    * def tercera = response.id
    And match tercera != segunda
    And match tercera != primera

    # Y la comprobación que de verdad importa: la segunda cita sigue siendo de
    # su paciente. Sin esto, un id repetido pasaría desapercibido mientras los
    # tres identificadores fueran distintos entre sí.
    Given path 'citas'
    And header Authorization = 'Bearer ' + gestor.token
    When method get
    Then status 200
    * def laSegunda = karate.filter(response.datos, function(c){ return c.id == segunda })
    And match laSegunda == '#[1]'
    And match laSegunda[0].pacienteId == 'PAC-0082'
