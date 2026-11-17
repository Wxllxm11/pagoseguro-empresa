const express = require('express');
const pool = require('../db');
const auditar = require('../auditoria');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

// Crear cliente
router.post('/', async (req, res) => {
  const { nombre, documento, email, telefono } = req.body || {};
  if (!nombre || !documento) {
    return res.status(400).json({ error: 'Nombre y documento son obligatorios' });
  }

  try {
    const r = await pool.query(
      `INSERT INTO clientes (nombre, documento, email, telefono)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre, documento, email || null, telefono || null]
    );
    await auditar(req.usuario.id, 'CLIENTE_CREADO', `Cliente ${r.rows[0].id}: ${nombre}`, req.ip);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un cliente con ese documento' });
    }
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Listar clientes
router.get('/', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM clientes ORDER BY id DESC');
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;