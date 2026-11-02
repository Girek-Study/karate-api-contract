Feature: POST /citas — crear una cita

  Background:
    * def sesion = call read('classpath:contrato/autenticacion.feature') credenciales.gestor
    * url urlBase
    * def autorizacion = 'Bearer ' + sesion.token
    * configure headers = { Authorization: '#(autorizacion)' }
    # El `path` NO va aquí: Karate lo vacía después de cada `method`, así que
    # un path en el Background solo vale para la primera petición del
    # escenario. CP-20 pide dos veces, y la segunda salía contra la raíz.
    # Cada petición lleva el suyo.
    #
    # Y cada escenario que crea usa un horario propio: compartirlo deja al
    # segundo con un 409 que no esperaba, y el fallo aparece en el caso
    # equivocado.

  @CP-16
  Scenario: Una cita válida se crea, responde 201 y dice dónde quedó
    Given path 'citas'
    And request { pacienteId: 'PAC-0042', especialidad: 'MED-GEN', inicio: '#(unInstanteLibre(10))' }
    When method post
    Then status 201
    And match response == esquemas.cita
    And match response.estado == 'CONFIRMADA'
    # La cabecera `location` es parte del contrato y casi nunca se comprueba.
    And match responseHeaders['location'][0] == '/citas/' + response.id

  @CP-17
  Scenario: Sin token no se crea nada
    # El contrato exige sesión en este endpoint. Un 201 aquí significa que
    # cualquiera, sin credenciales, puede escribir en la agenda. Y como el
    # código de éxito es el mismo que el del caso bueno, nada en la respuesta
    # dice que algo va mal: hay que preguntarlo explícitamente.
    * configure headers = null
    Given path 'citas'
    And request { pacienteId: 'PAC-0043', especialidad: 'OFTAL', inicio: '#(unInstanteLibre(20))' }
    When method post
    Then status 401
    And match response == esquemas.error
    And match response.error.codigo == 'NO_AUTENTICADO'

  @CP-18
  Scenario: Una cita con los tres campos mal devuelve los tres motivos
    Given path 'citas'
    And request { pacienteId: 'X', especialidad: 'NO-EXISTE', inicio: 'ayer por la tarde' }
    When method post
    Then status 400
    And match response == esquemas.errorConCampos
    And match each response.error.campos == esquemas.campoInvalido
    # Los tres, no el primero. Una validación que corta en el primer error
    # obliga al cliente a ir arreglando campos de uno en uno.
    And match response.error.campos[*].campo contains only ['pacienteId', 'especialidad', 'inicio']

  @CP-19
  Scenario: Una cita sin el campo obligatorio inicio no se crea
    Given path 'citas'
    And request { pacienteId: 'PAC-0044', especialidad: 'TRAUMA' }
    When method post
    Then status 400
    And match response.error.campos[*].campo contains 'inicio'

  @CP-20
  Scenario: Dos citas de la misma especialidad a la misma hora chocan
    * def hora = unInstanteLibre(30)
    Given path 'citas'
    And request { pacienteId: 'PAC-0045', especialidad: 'TRAUMA', inicio: '#(hora)' }
    When method post
    Then status 201

    Given path 'citas'
    And request { pacienteId: 'PAC-0046', especialidad: 'TRAUMA', inicio: '#(hora)' }
    When method post
    Then status 409
    And match response == esquemas.error
    And match response.error.codigo == 'HORARIO_OCUPADO'
