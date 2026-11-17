const express = require('express');
const pool = require('../db');
const auditar = require('../auditoria');
const { verificarToken, soloAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

// Crear factura
router.post('/', async (req, res) => {
  const { cliente_id, concepto, valor, fecha_vencimiento } = req.body || {};
  const valorNum = Number(valor);

  if (!cliente_id || !concepto || !(valorNum > 0)) {
    return res.status(400).json({ error: 'cliente_id, concepto y un valor mayor a 0 son obligatorios' });
  }

  try {
    const r = await pool.query(
      `INSERT INTO facturas (cliente_id, concepto, valor, fecha_vencimiento)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [cliente_id, concepto, valorNum, fecha_vencimiento || null]
    );
    await auditar(
      req.usuario.id,
      'FACTURA_CREADA',
      `Factura ${r.rows[0].id} por ${valorNum} al cliente ${cliente_id}`,
      req.ip
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23503') {
      return res.status(404).json({ error: 'El cliente no existe' });
    }
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Listar facturas (opcional: ?estado=pendiente)
router.get('/', async (req, res) => {
  const { estado } = req.query;
  try {
    const r = await pool.query(
      `SELECT f.*, c.nombre AS cliente
       FROM facturas f JOIN clientes c ON c.id = f.cliente_id
       WHERE ($1::text IS NULL OR f.estado = $1)
       ORDER BY f.id DESC`,
      [estado || null]
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Anular factura (solo admin, solo si está pendiente)
router.patch('/:id/anular', soloAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE facturas SET estado = 'anulada'
       WHERE id = $1 AND estado = 'pendiente' RETURNING *`,
      [req.params.id]
    );
    if (r.rowCount === 0) {
      return res.status(400).json({ error: 'La factura no existe o no está pendiente' });
    }
    await auditar(req.usuario.id, 'FACTURA_ANULADA', `Factura ${req.params.id}`, req.ip);
    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;