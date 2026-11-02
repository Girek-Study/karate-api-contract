// ============================================================================
//  API de ejemplo: agenda de citas.
//
//  Node y nada más. Sin dependencias, sin base de datos, sin red hacia fuera.
//  Un repositorio de pruebas que depende del servicio de otro acaba con un CI
//  rojo un martes cualquiera, por un motivo que no es del código.
//
//  ---------------------------------------------------------------------------
//  ESTA API INCUMPLE SU PROPIO CONTRATO A PROPÓSITO.
//
//  Cuatro incumplimientos, descritos en docs/05-hallazgos.md. Se apagan todos
//  a la vez con API_CONFORME=1, y de ahí salen los dos trabajos del CI:
//
//    sin API_CONFORME   -> la suite TIENE que fallar, y por los motivos exactos
//    con API_CONFORME=1 -> la suite TIENE que pasar entera
//
//  Lo primero demuestra que las pruebas detectan algo. Lo segundo, que no
//  inventan fallos. Un repositorio que solo enseña verde no demuestra ninguna
//  de las dos cosas.
// ============================================================================

const http = require('node:http');
const { randomUUID } = require('node:crypto');

//  8090 y no 8080: el 8080 es el puerto más ocupado de cualquier máquina de
//  desarrollo, y cuando ya hay algo escuchando ahí, el servidor de este
//  repositorio no arranca y las pruebas hablan con lo que hubiera. Pasó al
//  montar esto: respondía un Adminer en un contenedor del propio equipo, con
//  200 y HTML, y la primera tanda de comprobaciones fue contra él.
const PUERTO = Number(process.env.PUERTO ?? 8090);

/** Con 1, la API cumple el contrato y la suite entera pasa. */
const CONFORME = process.env.API_CONFORME === '1';

// --- Datos sintéticos -------------------------------------------------------
//  Ningún dato real. Los identificadores de paciente son correlativos propios
//  (PAC-0001), no documentos de identidad, para que no haya forma de que una
//  copia de este archivo acabe pareciendo un volcado de producción.

const ESPECIALIDADES = [
  { codigo: 'MED-GEN', nombre: 'Medicina general', duracionMinutos: 20 },
  { codigo: 'TRAUMA', nombre: 'Traumatología', duracionMinutos: 30 },
  { codigo: 'OFTAL', nombre: 'Oftalmología', duracionMinutos: 25 },
];

const USUARIOS = [
  { usuario: 'agenda.lectura', clave: 'lectura-2026', rol: 'LECTOR' },
  { usuario: 'agenda.gestion', clave: 'gestion-2026', rol: 'GESTOR' },
];

const citas = new Map();
const sesiones = new Map();

//  El contador sube y no baja nunca.
//
//  Antes el id salía de `citas.size + 1`, y al anular una cita el tamaño
//  bajaba: la siguiente creación reutilizaba un id que ya estaba ocupado y el
//  `citas.set` sobreescribía la cita de otro paciente, respondiendo 201. Con
//  tres citas sembradas, anular CITA-0002 y crear una dejaba la colección en
//  dos: la de PAC-0003 desaparecía sin que nada lo dijera. Está contado en
//  docs/05-hallazgos.md, y lo comprueba CP-25.
//
//  No es uno de los cuatro incumplimientos a propósito: era un defecto de
//  verdad, y por eso se arregla en vez de documentarse como rasgo.
let siguienteId = 0;

function nuevoId() {
  siguienteId += 1;
  return `CITA-${String(siguienteId).padStart(4, '0')}`;
}

function sembrar() {
  const base = [
    { pacienteId: 'PAC-0001', especialidad: 'MED-GEN', inicio: '2026-12-01T09:00:00Z' },
    { pacienteId: 'PAC-0002', especialidad: 'TRAUMA', inicio: '2026-12-01T10:00:00Z' },
    { pacienteId: 'PAC-0003', especialidad: 'OFTAL', inicio: '2026-12-02T11:30:00Z' },
  ];
  for (const c of base) {
    const id = nuevoId();
    citas.set(id, { id, estado: 'CONFIRMADA', creadoEn: new Date().toISOString(), ...c });
  }
}
sembrar();

// --- Utilidades -------------------------------------------------------------

function responder(res, codigo, cuerpo, cabeceras = {}) {
  const texto = cuerpo === undefined ? '' : JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(texto),
    ...cabeceras,
  });
  res.end(texto);
}

function error(res, codigo, clave, detalle, campos) {
  responder(res, codigo, {
    error: { codigo: clave, detalle, ...(campos ? { campos } : {}) },
  });
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let crudo = '';
    req.on('data', (trozo) => {
      crudo += trozo;
      if (crudo.length > 64000) reject(new Error('cuerpo demasiado grande'));
    });
    req.on('end', () => {
      if (!crudo) return resolve({});
      try {
        resolve(JSON.parse(crudo));
      } catch {
        reject(new Error('json inválido'));
      }
    });
    req.on('error', reject);
  });
}

function sesionDe(req) {
  const cabecera = req.headers.authorization ?? '';
  if (!cabecera.startsWith('Bearer ')) return null;
  return sesiones.get(cabecera.slice(7)) ?? null;
}

/** Valida una cita nueva. Devuelve los campos mal; vacío si está bien. */
function validarCita(cuerpo) {
  const mal = [];
  if (typeof cuerpo.pacienteId !== 'string' || !/^PAC-\d{4}$/.test(cuerpo.pacienteId)) {
    mal.push({ campo: 'pacienteId', motivo: 'debe tener la forma PAC-0000' });
  }
  if (!ESPECIALIDADES.some((e) => e.codigo === cuerpo.especialidad)) {
    mal.push({ campo: 'especialidad', motivo: 'código de especialidad desconocido' });
  }
  if (typeof cuerpo.inicio !== 'string' || Number.isNaN(Date.parse(cuerpo.inicio))) {
    mal.push({ campo: 'inicio', motivo: 'debe ser una fecha ISO 8601 con zona' });
  }
  return mal;
}

// --- Rutas ------------------------------------------------------------------

const rutas = [
  {
    metodo: 'GET',
    patron: /^\/salud$/,
    publica: true,
    async manejar(_req, res) {
      responder(res, 200, { estado: 'arriba', conforme: CONFORME });
    },
  },

  {
    metodo: 'POST',
    patron: /^\/sesiones$/,
    publica: true,
    async manejar(_req, res, _m, cuerpo) {
      const encontrado = USUARIOS.find(
        (u) => u.usuario === cuerpo.usuario && u.clave === cuerpo.clave,
      );
      if (!encontrado) {
        return error(res, 401, 'CREDENCIALES_INVALIDAS', 'Usuario o clave incorrectos');
      }
      const token = randomUUID();
      sesiones.set(token, { usuario: encontrado.usuario, rol: encontrado.rol });
      responder(res, 201, {
        token,
        rol: encontrado.rol,
        expiraEn: new Date(Date.now() + 3600000).toISOString(),
      });
    },
  },

  {
    metodo: 'GET',
    patron: /^\/especialidades$/,
    publica: true,
    async manejar(_req, res) {
      responder(res, 200, { datos: ESPECIALIDADES, total: ESPECIALIDADES.length });
    },
  },

  {
    metodo: 'GET',
    patron: /^\/citas$/,
    async manejar(_req, res, _m, _cuerpo, url) {
      const limite = Math.min(Number(url.searchParams.get('limite') ?? 20) || 20, 50);
      const todas = [...citas.values()];
      const pagina = todas.slice(0, limite);

      // INCUMPLIMIENTO 3: con paginación, `total` devuelve el tamaño de la
      // página en vez del total de la colección. El contrato dice que es el
      // total, y quien pagine se quedará sin la mitad de los resultados
      // creyendo que ya los tiene todos.
      const total = CONFORME ? todas.length : pagina.length;

      responder(res, 200, { datos: pagina, total });
    },
  },

  {
    metodo: 'GET',
    patron: /^\/citas\/([A-Za-z0-9-]+)$/,
    async manejar(_req, res, m) {
      const cita = citas.get(m[1]);
      if (!cita) return error(res, 404, 'CITA_NO_ENCONTRADA', `No existe la cita ${m[1]}`);

      if (CONFORME) return responder(res, 200, cita);

      // INCUMPLIMIENTO 1: en el detalle, `pacienteId` sale como número y sin
      // el prefijo, mientras la colección lo devuelve como cadena. Los dos
      // responden 200 y los dos traen el campo: una aserción que solo mire si
      // el campo existe no nota nada.
      //
      // INCUMPLIMIENTO 2: `creadoEn` sale como epoch en milisegundos donde el
      // contrato declara date-time. También es un número válido en JSON.
      responder(res, 200, {
        ...cita,
        pacienteId: Number(cita.pacienteId.replace('PAC-', '')),
        creadoEn: Date.parse(cita.creadoEn),
      });
    },
  },

  {
    metodo: 'POST',
    patron: /^\/citas$/,

    // INCUMPLIMIENTO 4: este endpoint quedó declarado público por error, así
    // que crea citas sin token. El contrato exige autenticación. Y como
    // responde 201 igual que el caso bueno, no hay nada en el código de
    // estado que delate el agujero.
    get publica() {
      return !CONFORME;
    },

    async manejar(_req, res, _m, cuerpo) {
      const mal = validarCita(cuerpo);
      if (mal.length) {
        return error(res, 400, 'CITA_INVALIDA', 'La cita no supera la validación', mal);
      }
      const choque = [...citas.values()].some(
        (c) => c.inicio === cuerpo.inicio && c.especialidad === cuerpo.especialidad,
      );
      if (choque) {
        return error(res, 409, 'HORARIO_OCUPADO', 'Ya hay una cita en ese horario');
      }
      const id = nuevoId();
      const cita = {
        id,
        estado: 'CONFIRMADA',
        creadoEn: new Date().toISOString(),
        pacienteId: cuerpo.pacienteId,
        especialidad: cuerpo.especialidad,
        inicio: cuerpo.inicio,
      };
      citas.set(id, cita);
      responder(res, 201, cita, { location: `/citas/${id}` });
    },
  },

  {
    metodo: 'DELETE',
    patron: /^\/citas\/([A-Za-z0-9-]+)$/,
    rol: 'GESTOR',
    async manejar(_req, res, m) {
      if (!citas.delete(m[1])) {
        return error(res, 404, 'CITA_NO_ENCONTRADA', `No existe la cita ${m[1]}`);
      }
      res.writeHead(204, { 'content-length': 0 });
      res.end();
    },
  },
];

// --- Servidor ---------------------------------------------------------------

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PUERTO}`);

  const ruta = rutas.find((r) => r.metodo === req.method && r.patron.test(url.pathname));
  if (!ruta) {
    const existeConOtroMetodo = rutas.some((r) => r.patron.test(url.pathname));
    return existeConOtroMetodo
      ? error(res, 405, 'METODO_NO_PERMITIDO', `${req.method} no aplica a ${url.pathname}`)
      : error(res, 404, 'RUTA_NO_ENCONTRADA', `No existe ${url.pathname}`);
  }

  const sesion = sesionDe(req);
  if (!ruta.publica && !sesion) {
    return error(res, 401, 'NO_AUTENTICADO', 'Hace falta un token de sesión');
  }
  if (ruta.rol && sesion?.rol !== ruta.rol) {
    return error(res, 403, 'SIN_PERMISO', `La operación exige el rol ${ruta.rol}`);
  }

  let cuerpo = {};
  if (req.method === 'POST' || req.method === 'PATCH') {
    try {
      cuerpo = await leerCuerpo(req);
    } catch (e) {
      return error(res, 400, 'CUERPO_INVALIDO', e.message);
    }
  }

  try {
    await ruta.manejar(req, res, ruta.patron.exec(url.pathname), cuerpo, url);
  } catch (e) {
    error(res, 500, 'ERROR_INTERNO', e.message);
  }
});

servidor.listen(PUERTO, () => {
  const modo = CONFORME ? 'CONFORME al contrato' : 'con 4 incumplimientos activos';
  console.log(`API de citas en http://localhost:${PUERTO} — ${modo}`);
});
