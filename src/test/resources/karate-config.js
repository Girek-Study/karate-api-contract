/**
 * Configuración de la suite.
 *
 * Aquí viven los esquemas, y viven una sola vez. Un esquema repetido en dos
 * .feature se corrige en uno y se olvida en el otro, y entonces la suite
 * afirma dos cosas distintas sobre el mismo recurso.
 *
 * RIESGO DECLARADO: estos esquemas están DERIVADOS A MANO de demo/openapi.yaml.
 * Karate no lee OpenAPI, así que el contrato y las aserciones son dos textos
 * que hay que mantener de acuerdo. Si alguien cambia el YAML y no toca este
 * archivo, la suite seguirá verde comprobando el contrato de ayer. Está escrito
 * en docs/04-analisis-riesgos.md con lo que se hace al respecto.
 */
function fn() {
  var urlBase = karate.properties['api.url'] || 'http://localhost:8090';

  // ISO 8601 con zona, que es lo que `format: date-time` significa en el
  // contrato. Sin esto, un epoch en milisegundos pasaría como fecha: es un
  // número válido en JSON y '#present' no lo mira.
  var ISO_8601 =
    '#regex ^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$';

  // Un instante distinto en cada corrida.
  //
  // La API guarda las citas en memoria y su contenedor sobrevive entre
  // ejecuciones: `docker compose run` reutiliza el servicio que ya está
  // levantado. Con horarios fijos, la primera corrida creaba las citas y la
  // segunda se encontraba un 409 donde esperaba un 201. La suite pasaba una
  // vez. Eso es peor que fallar siempre, porque el que la escribe la ve verde.
  //
  // Se arregla aquí y no reiniciando el servidor: una suite que exige un
  // estado inicial exacto acaba exigiéndolo también en el entorno de alguien
  // que no puede reiniciar nada.
  var arranque = java.lang.System.currentTimeMillis();

  function unInstanteLibre(minutos) {
    return java.time.Instant.ofEpochMilli(arranque)
      .plus(java.time.Duration.ofDays(365))
      .plus(java.time.Duration.ofMinutes(minutos))
      .truncatedTo(java.time.temporal.ChronoUnit.SECONDS)
      .toString();
  }

  var config = {
    urlBase: urlBase,
    unInstanteLibre: unInstanteLibre,

    credenciales: {
      gestor: { usuario: 'agenda.gestion', clave: 'gestion-2026' },
      lector: { usuario: 'agenda.lectura', clave: 'lectura-2026' },
    },

    esquemas: {
      sesion: {
        token: '#uuid',
        rol: '#regex ^(LECTOR|GESTOR)$',
        expiraEn: ISO_8601,
      },

      especialidad: {
        codigo: '#regex ^[A-Z-]{3,10}$',
        nombre: '#string',
        duracionMinutos: '#number',
      },

      // El contrato dice que el detalle y la colección devuelven el MISMO
      // objeto Cita. Por eso hay un solo esquema: si hiciera falta uno por
      // endpoint, la respuesta ya no sería la misma y eso es el hallazgo.
      cita: {
        id: '#regex ^CITA-\\d{4}$',
        estado: '#regex ^(CONFIRMADA|ANULADA)$',
        creadoEn: ISO_8601,
        pacienteId: '#regex ^PAC-\\d{4}$',
        especialidad: '#regex ^[A-Z-]{3,10}$',
        inicio: ISO_8601,
      },

      error: {
        error: {
          codigo: '#regex ^[A-Z_]+$',
          detalle: '#string',
        },
      },

      errorConCampos: {
        error: {
          codigo: '#regex ^[A-Z_]+$',
          detalle: '#string',
          campos: '#[_ > 0] #object',
        },
      },

      campoInvalido: {
        campo: '#string',
        motivo: '#string',
      },
    },
  };

  // Cinco segundos. La API es local y responde en milisegundos: un timeout
  // generoso solo sirve para que un cuelgue tarde un minuto en manifestarse.
  karate.configure('connectTimeout', 5000);
  karate.configure('readTimeout', 5000);

  return config;
}
