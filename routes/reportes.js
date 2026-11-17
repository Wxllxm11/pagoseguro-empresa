const express = require('express');
const pool = require('../db');
const { verificarToken, soloAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken, soloAdmin);

// Auditoría con filtros: ?accion=LOGIN_FALLIDO&usuario_id=1&desde=2026-11-01&hasta=2026-11-30&limite=50
router.get('/auditoria', async (req, res) => {
  const { accion, usuario_id, desde, hasta } = req.query;
  const limite = Math.min(Number(req.query.limite) || 100, 500);
  try {
    const r = await pool.query(
      `SELECT a.id, a.fecha AT TIME ZONE 'UTC' AS fecha, a.accion, a.detalle, a.ip, u.nombre AS usuario
       FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
       WHERE ($1::text IS NULL OR a.accion = $1)
         AND ($2::int IS NULL OR a.usuario_id = $2)
         AND ($3::timestamp IS NULL OR a.fecha >= $3)
         AND ($4::timestamp IS NULL OR a.fecha < $4)
       ORDER BY a.fecha DESC LIMIT $5`,
      [accion || null, usuario_id || null, desde || null, hasta || null, limite]
    );
    res.json(r.rows);
  } catch (e) {
    if (['22007', '22008', '22P02'].includes(e.code)) {
      return res.status(400).json({ error: 'Algún filtro tiene un formato inválido' });
    }
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Resumen general del sistema
router.get('/resumen', async (req, res) => {
  try {
    const [facturas, pagos, acciones, ips] = await Promise.all([
      pool.query(`SELECT estado, COUNT(*)::int AS cantidad, COALESCE(SUM(valor),0) AS total
                  FROM facturas GROUP BY estado`),
      pool.query(`SELECT metodo, COUNT(*)::int AS cantidad, COALESCE(SUM(valor),0) AS total
                  FROM pagos GROUP BY metodo`),
      pool.query(`SELECT accion, COUNT(*)::int AS cantidad FROM auditoria
                  WHERE fecha >= NOW() - INTERVAL '7 days'
                  GROUP BY accion ORDER BY cantidad DESC`),
      pool.query(`SELECT ip, COUNT(*)::int AS intentos FROM auditoria
                  WHERE accion IN ('LOGIN_FALLIDO', 'LOGIN_BLOQUEADO')
                    AND fecha >= NOW() - INTERVAL '7 days'
                  GROUP BY ip ORDER BY intentos DESC LIMIT 5`)
    ]);
    res.json({
      facturas_por_estado: facturas.rows,
      pagos_por_metodo: pagos.rows,
      actividad_7_dias: acciones.rows,
      ips_con_mas_intentos_fallidos: ips.rows
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;