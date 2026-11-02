@ignore
Feature: Abrir una sesión y devolver el token

  # Este archivo no es una prueba: es la función que usan las demás para
  # conseguir un token. Lleva @ignore para que el corredor no lo recoja como
  # escenario propio y no aparezca contado dos veces en el informe.
  #
  # Se invoca así:
  #   * def sesion = call read('classpath:contrato/autenticacion.feature') credenciales.gestor

  Scenario: Cambiar usuario y clave por un token
    Given url urlBase
    And path 'sesiones'
    And request { usuario: '#(usuario)', clave: '#(clave)' }
    When method post
    Then status 201
    And match response.token == '#uuid'
    * def token = response.token
    * def rol = response.rol
