Feature: GET /citas/{id} — el detalle de una cita

  Background:
    * def sesion = call read('classpath:contrato/autenticacion.feature') credenciales.gestor
    * url urlBase
    # Ver la nota de citas-coleccion.feature: `header` dura una petición,
    # `configure headers` dura el escenario. Aquí todos piden dos veces.
    * def autorizacion = 'Bearer ' + sesion.token
    * configure headers = { Authorization: '#(autorizacion)' }

  @CP-12
  Scenario: El detalle de una cita cumple el esquema de Cita
    Given path 'citas'
    When method get
    Then status 200
    * def unaCita = response.datos[0]

    Given path 'citas', unaCita.id
    When method get
    Then status 200
    And match response == esquemas.cita

  @CP-13
  Scenario: El detalle devuelve el mismo objeto que la colección
    # Este es el caso que de verdad importa, y no se puede escribir mirando un
    # endpoint cada vez. El contrato dice que los dos devuelven el mismo
    # objeto Cita. Si el detalle cambia el tipo de un campo, los dos siguen
    # respondiendo 200 y los dos siguen trayendo el campo: la única forma de
    # verlo es comparar una respuesta con la otra.
    Given path 'citas'
    When method get
    Then status 200
    * def deLaColeccion = response.datos[0]

    Given path 'citas', deLaColeccion.id
    When method get
    Then status 200
    And match response == deLaColeccion

  @CP-14
  Scenario: Una cita que no existe devuelve 404 con su cuerpo de error
    Given path 'citas', 'CITA-9999'
    When method get
    Then status 404
    And match response == esquemas.error
    And match response.error.codigo == 'CITA_NO_ENCONTRADA'

  @CP-15
  Scenario: Sin token, el detalle no se consulta
    * configure headers = null
    Given path 'citas', 'CITA-0001'
    When method get
    Then status 401
    And match response == esquemas.error
