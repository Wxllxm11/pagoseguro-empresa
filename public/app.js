const API = '/api';
let token = sessionStorage.getItem('token');
let usuario = JSON.parse(sessionStorage.getItem('usuario') || 'null');
let pagoPreseleccionado = null;

// ---------- Utilidades ----------
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dinero = (n) => Number(n).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fechaHora = (f) => (f ? new Date(f).toLocaleString('es-CO') : '');

function mensaje(el, texto, ok = false) {
  el.textContent = texto;
  el.className = 'mensaje' + (texto ? (ok ? ' ok' : ' error') : '');
}
const mostrarError = (e) => mensaje($('msg-app'), e.message);

async function api(ruta, opciones = {}) {
  const r = await fetch(API + ruta, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined
  });
  let datos = null;
  try { datos = await r.json(); } catch { /* respuesta sin cuerpo */ }
  if (r.status === 401 && token) {
    cerrarSesion('Tu sesión expiró. Inicia sesión de nuevo.');
    throw new Error('Sesión expirada');
  }
  if (!r.ok) throw new Error((datos && datos.error) || 'Error ' + r.status);
  return datos;
}

// ---------- Sesión ----------
function mostrarApp() {
  $('vista-login').hidden = true;
  $('vista-app').hidden = false;
  $('usuario-info').textContent = `${usuario.nombre} (${usuario.rol})`;
  $('menu-auditoria').hidden = usuario.rol !== 'admin';
  irA('clientes');
}

function cerrarSesion(texto = '') {
  token = null;
  usuario = null;
  sessionStorage.clear();
  $('vista-app').hidden = true;
  $('vista-login').hidden = false;
  mensaje($('msg-login'), texto);
}

function cambiarTab(entrar) {
  $('form-login').hidden = !entrar;
  $('form-registro').hidden = entrar;
  $('tab-entrar').classList.toggle('activa', entrar);
  $('tab-registro').classList.toggle('activa', !entrar);
  mensaje($('msg-login'), '');
}

$('tab-entrar').addEventListener('click', () => cambiarTab(true));
$('tab-registro').addEventListener('click', () => cambiarTab(false));
$('btn-salir').addEventListener('click', () => cerrarSesion());

$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const d = await api('/auth/login', {
      method: 'POST',
      body: { email: $('login-email').value.trim(), contrasena: $('login-pass').value }
    });
    token = d.token;
    usuario = d.usuario;
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('usuario', JSON.stringify(usuario));
    $('login-pass').value = '';
    mensaje($('msg-login'), '');
    mostrarApp();
  } catch (err) {
    mensaje($('msg-login'), err.message);
  }
});

$('form-registro').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/auth/registro', {
      method: 'POST',
      body: {
        nombre: $('reg-nombre').value.trim(),
        email: $('reg-email').value.trim(),
        contrasena: $('reg-pass').value
      }
    });
    e.target.reset();
    cambiarTab(true);
    mensaje($('msg-login'), 'Cuenta creada. Ya puedes iniciar sesión.', true);
  } catch (err) {
    mensaje($('msg-login'), err.message);
  }
});

// ---------- Navegación ----------
const cargadores = {
  clientes: cargarClientes,
  facturas: cargarFacturas,
  pagos: cargarPagos,
  auditoria: cargarAuditoria
};

function irA(vista) {
  document.querySelectorAll('#menu button').forEach((b) =>
    b.classList.toggle('activa', b.dataset.vista === vista));
  document.querySelectorAll('.vista').forEach((s) => { s.hidden = s.id !== 'v-' + vista; });
  mensaje($('msg-app'), '');
  cargadores[vista]().catch(mostrarError);
}

$('menu').addEventListener('click', (e) => {
  if (e.target.dataset.vista) irA(e.target.dataset.vista);
});

// ---------- Clientes ----------
async function cargarClientes() {
  const filas = await api('/clientes');
  $('tabla-clientes').innerHTML = filas.map((c) =>
    `<tr><td>${c.id}</td><td>${esc(c.nombre)}</td><td>${esc(c.documento)}</td>
     <td>${esc(c.email)}</td><td>${esc(c.telefono)}</td></tr>`).join('')
    || '<tr><td colspan="5">Aún no hay clientes</td></tr>';
}

$('form-cliente').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const c = await api('/clientes', {
      method: 'POST',
      body: {
        nombre: $('cli-nombre').value.trim(),
        documento: $('cli-doc').value.trim(),
        email: $('cli-email').value.trim(),
        telefono: $('cli-tel').value.trim()
      }
    });
    e.target.reset();
    mensaje($('msg-app'), `Cliente creado (id ${c.id})`, true);
    await cargarClientes();
  } catch (err) { mostrarError(err); }
});

// ---------- Facturas ----------
async function cargarFacturas() {
  const clientes = await api('/clientes');
  const sel = $('fac-cliente');
  const actual = sel.value;
  sel.innerHTML = clientes.map((c) =>
    `<option value="${c.id}">${esc(c.nombre)} (${esc(c.documento)})</option>`).join('');
  if (actual) sel.value = actual;

  const estado = $('filtro-estado').value;
  const filas = await api('/facturas' + (estado ? '?estado=' + encodeURIComponent(estado) : ''));
  $('tabla-facturas').innerHTML = filas.map((f) => {
    let acciones = '';
    if (f.estado === 'pendiente') {
      acciones = `<button class="mini" data-pagar="${f.id}">Pagar</button>`;
      if (usuario.rol === 'admin') {
        acciones += ` <button class="mini peligro" data-anular="${f.id}">Anular</button>`;
      }
    }
    const vence = f.fecha_vencimiento ? String(f.fecha_vencimiento).slice(0, 10) : '';
    return `<tr><td>${f.id}</td><td>${esc(f.cliente)}</td><td>${esc(f.concepto)}</td>
      <td>${dinero(f.valor)}</td>
      <td><span class="estado ${esc(f.estado)}">${esc(f.estado)}</span></td>
      <td>${esc(vence)}</td><td>${acciones}</td></tr>`;
  }).join('') || '<tr><td colspan="7">No hay facturas</td></tr>';
}

$('form-factura').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const f = await api('/facturas', {
      method: 'POST',
      body: {
        cliente_id: Number($('fac-cliente').value),
        concepto: $('fac-concepto').value.trim(),
        valor: Number($('fac-valor').value),
        fecha_vencimiento: $('fac-venc').value
      }
    });
    $('fac-concepto').value = '';
    $('fac-valor').value = '';
    $('fac-venc').value = '';
    mensaje($('msg-app'), `Factura ${f.id} creada`, true);
    await cargarFacturas();
  } catch (err) { mostrarError(err); }
});

$('filtro-estado').addEventListener('change', () => cargarFacturas().catch(mostrarError));

$('tabla-facturas').addEventListener('click', async (e) => {
  const { anular, pagar } = e.target.dataset;
  try {
    if (anular) {
      if (!confirm(`¿Anular la factura ${anular}?`)) return;
      await api(`/facturas/${anular}/anular`, { method: 'PATCH' });
      mensaje($('msg-app'), `Factura ${anular} anulada`, true);
      await cargarFacturas();
    } else if (pagar) {
      pagoPreseleccionado = pagar;
      irA('pagos');
    }
  } catch (err) { mostrarError(err); }
});

// ---------- Pagos ----------
function autocompletarValor() {
  const op = $('pago-factura').selectedOptions[0];
  $('pago-valor').value = op && op.dataset.valor ? Number(op.dataset.valor) : '';
}

async function cargarPagos() {
  const pendientes = await api('/facturas?estado=pendiente');
  const sel = $('pago-factura');
  sel.innerHTML = pendientes.length
    ? pendientes.map((f) =>
        `<option value="${f.id}" data-valor="${esc(f.valor)}">#${f.id} · ${esc(f.cliente)} · ${dinero(f.valor)}</option>`).join('')
    : '<option value="">No hay facturas pendientes</option>';
  if (pagoPreseleccionado) {
    sel.value = pagoPreseleccionado;
    pagoPreseleccionado = null;
  }
  autocompletarValor();

  const filas = await api('/pagos');
  $('tabla-pagos').innerHTML = filas.map((p) =>
    `<tr><td>${p.id}</td><td>#${p.factura_id}</td><td>${esc(p.cliente)}</td>
     <td>${esc(p.concepto)}</td><td>${dinero(p.valor)}</td><td>${esc(p.metodo)}</td>
     <td>${esc(p.referencia)}</td><td>${esc(p.cajero)}</td></tr>`).join('')
    || '<tr><td colspan="8">Aún no hay pagos</td></tr>';
}

$('pago-factura').addEventListener('change', autocompletarValor);

$('form-pago').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const p = await api('/pagos', {
      method: 'POST',
      body: {
        factura_id: Number($('pago-factura').value),
        valor: Number($('pago-valor').value),
        metodo: $('pago-metodo').value,
        referencia: $('pago-ref').value.trim()
      }
    });
    $('pago-ref').value = '';
    mensaje($('msg-app'), `Pago ${p.id} registrado. La factura quedó pagada.`, true);
    await cargarPagos();
  } catch (err) { mostrarError(err); }
});

// ---------- Auditoría (admin) ----------
async function cargarAuditoria() {
  const accion = $('filtro-accion').value;
  const [filas, res] = await Promise.all([
    api('/reportes/auditoria?limite=100' + (accion ? '&accion=' + encodeURIComponent(accion) : '')),
    api('/reportes/resumen')
  ]);

  const recaudado = res.pagos_por_metodo.reduce((s, p) => s + Number(p.total), 0);
  const pendientes = res.facturas_por_estado.find((f) => f.estado === 'pendiente');
  const fallidos = res.actividad_7_dias.find((a) => a.accion === 'LOGIN_FALLIDO');
  const bloqueos = res.actividad_7_dias.find((a) => a.accion === 'CUENTA_BLOQUEADA');

  $('resumen').innerHTML = `
    <div class="kpi"><span>Total recaudado</span><strong>${dinero(recaudado)}</strong></div>
    <div class="kpi"><span>Facturas pendientes</span><strong>${pendientes ? pendientes.cantidad : 0}</strong></div>
    <div class="kpi"><span>Logins fallidos (7 días)</span><strong>${fallidos ? fallidos.cantidad : 0}</strong></div>
    <div class="kpi"><span>Cuentas bloqueadas (7 días)</span><strong>${bloqueos ? bloqueos.cantidad : 0}</strong></div>`;

  $('tabla-auditoria').innerHTML = filas.map((a) =>
    `<tr><td>${esc(fechaHora(a.fecha))}</td><td>${esc(a.accion)}</td>
     <td>${esc(a.usuario || '—')}</td><td>${esc(a.detalle)}</td><td>${esc(a.ip)}</td></tr>`).join('')
    || '<tr><td colspan="5">Sin registros</td></tr>';
}

$('btn-consultar').addEventListener('click', () => cargarAuditoria().catch(mostrarError));

// ---------- Inicio ----------
if (token && usuario) mostrarApp();