Feature: POST /sesiones — el contrato de la autenticación

  Background:
    * url urlBase
    * path 'sesiones'

  @CP-01
  Scenario: Un gestor abre sesión y recibe un token con su rol y su caducidad
    Given request { usuario: 'agenda.gestion', clave: 'gestion-2026' }
    When method post
    Then status 201
    # El esquema completo, no solo que el token esté. El contrato promete tres
    # campos con tres formas, y `expiraEn` es la que más fácil se degrada a un
    # epoch sin que nadie lo note.
    And match response == esquemas.sesion
    And match response.rol == 'GESTOR'

  @CP-02
  Scenario: Un lector abre sesión y recibe el rol de lectura
    Given request { usuario: 'agenda.lectura', clave: 'lectura-2026' }
    When method post
    Then status 201
    And match response == esquemas.sesion
    And match response.rol == 'LECTOR'

  @CP-03
  Scenario: Una clave incorrecta no abre sesión
    Given request { usuario: 'agenda.gestion', clave: 'la-de-el-ano-pasado' }
    When method post
    Then status 401
    And match response == esquemas.error
    And match response.error.codigo == 'CREDENCIALES_INVALIDAS'
    # Que el cuerpo del error no filtre si el usuario existe: el mismo detalle
    # para clave mala y para usuario inexistente. Lo comprueba CP-04.
    * def detalleClaveMala = response.error.detalle

  @CP-04
  Scenario: Un usuario inexistente da el mismo error que una clave incorrecta
    Given request { usuario: 'no.existe', clave: 'cualquiera' }
    When method post
    Then status 401
    And match response == esquemas.error
    And match response.error.codigo == 'CREDENCIALES_INVALIDAS'

  @CP-05
  Scenario: Un cuerpo sin credenciales no abre sesión
    Given request {}
    When method post
    Then status 401
    And match response == esquemas.error
