const express = require('express');
const pool = require('../db');
const auditar = require('../auditoria');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

const METODOS = ['efectivo', 'transferencia', 'tarjeta'];

// Registrar pago (transacción)
router.post('/', async (req, res) => {
  const { factura_id, valor, metodo, referencia } = req.body || {};
  const valorNum = Number(valor);

  if (!factura_id || !(valorNum > 0) || !METODOS.includes(metodo)) {
    return res.status(400).json({
      error: 'factura_id, valor y metodo (efectivo, transferencia o tarjeta) son obligatorios'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Bloquea la factura para evitar pagos dobles simultáneos
    const f = await client.query('SELECT * FROM facturas WHERE id = $1 FOR UPDATE', [factura_id]);
    const factura = f.rows[0];

    if (!factura) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'La factura no existe' });
    }
    if (factura.estado !== 'pendiente') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `La factura está ${factura.estado}` });
    }
    if (Math.round(valorNum * 100) !== Math.round(Number(factura.valor) * 100)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `El valor debe ser exactamente ${factura.valor}` });
    }

    const p = await client.query(
      `INSERT INTO pagos (factura_id, valor, metodo, referencia, registrado_por)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [factura_id, valorNum, metodo, referencia || null, req.usuario.id]
    );
    await client.query("UPDATE facturas SET estado = 'pagada' WHERE id = $1", [factura_id]);

    await client.query('COMMIT');

    await auditar(
      req.usuario.id,
      'PAGO_REGISTRADO',
      `Pago ${p.rows[0].id} de ${valorNum} (${metodo}) a la factura ${factura_id}`,
      req.ip
    );
    res.status(201).json(p.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  } finally {
    client.release();
  }
});

// Listar pagos
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT p.*, f.concepto, c.nombre AS cliente, u.nombre AS cajero
       FROM pagos p
       JOIN facturas f ON f.id = p.factura_id
       JOIN clientes c ON c.id = f.cliente_id
       JOIN usuarios u ON u.id = p.registrado_por
       ORDER BY p.id DESC`
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;