const pool = require('./db');

async function auditar(usuarioId, accion, detalle, ip) {
  try {
    await pool.query(
      'INSERT INTO auditoria (usuario_id, accion, detalle, ip) VALUES ($1, $2, $3, $4)',
      [usuarioId, accion, detalle, ip]
    );
  } catch (e) {
    console.error('Error al registrar auditoría:', e.message);
  }
}

module.exports = auditar;