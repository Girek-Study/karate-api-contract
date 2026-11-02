Feature: GET /especialidades — el catálogo público

  @CP-06
  Scenario: El catálogo se consulta sin token y cada especialidad cumple su esquema
    Given url urlBase
    And path 'especialidades'
    When method get
    Then status 200
    # `match each` aplica el esquema a todos los elementos. Con `match
    # response.datos[0]` se comprobaría el primero y se darían por buenos los
    # demás, que es donde se esconde el que vino de otro sitio.
    And match each response.datos == esquemas.especialidad
    And match response.total == '#number'

  @CP-07
  Scenario: El total del catálogo coincide con lo que devuelve
    Given url urlBase
    And path 'especialidades'
    When method get
    Then status 200
    # El catálogo no se pagina, así que aquí total y tamaño tienen que ser el
    # mismo número. En /citas no, y esa diferencia es justo lo que CP-10 mira.
    And match response.total == response.datos.length
