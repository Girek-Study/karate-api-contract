package study.girek.contrato;

import com.intuit.karate.junit5.Karate;

/**
 * Corredor de la suite de contrato.
 *
 * <p>Un método por recurso en vez de uno que recoja todo el directorio. Cuesta
 * cuatro líneas más y a cambio el informe de JUnit dice qué recurso falló antes
 * de abrir ningún detalle, que es lo primero que se mira cuando el CI se pone
 * rojo.
 *
 * <p><b>Secuencial a propósito.</b> La API de ejemplo guarda las citas en
 * memoria y los escenarios crean y anulan: dos features en paralelo se pisan el
 * estado. {@code CP-10} es el caso evidente —pregunta el total dos veces y
 * compara las respuestas—, y una creación concurrente lo haría fallar sin que
 * la API tenga nada roto. Una suite que falla a veces se acaba volviendo a
 * correr hasta que pase, y a partir de ahí ya no informa de nada.
 *
 * <p>Paralelizar exigiría que cada escenario trabajase sobre datos propios y
 * que ninguna aserción mirase la colección entera. Se puede, pero es otra
 * suite, y el tiempo que ahorraría aquí son segundos.
 */
class CorredorTest {

  @Karate.Test
  Karate sesiones() {
    return Karate.run("classpath:contrato/sesiones.feature");
  }

  @Karate.Test
  Karate especialidades() {
    return Karate.run("classpath:contrato/especialidades.feature");
  }

  @Karate.Test
  Karate citasColeccion() {
    return Karate.run("classpath:contrato/citas-coleccion.feature");
  }

  @Karate.Test
  Karate citasDetalle() {
    return Karate.run("classpath:contrato/citas-detalle.feature");
  }

  @Karate.Test
  Karate citasCreacion() {
    return Karate.run("classpath:contrato/citas-creacion.feature");
  }

  @Karate.Test
  Karate citasAnulacion() {
    return Karate.run("classpath:contrato/citas-anulacion.feature");
  }
}
