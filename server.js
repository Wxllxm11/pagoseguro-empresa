require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pool = require('./db');
const { verificarToken, soloAdmin } = require('./middleware/auth');
const path = require('path');

const app = express();
app.set('trust proxy', 1); // necesario detrás del proxy de Render
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Límite de intentos en rutas de autenticación
const limiteAuth = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
app.use('/api/auth', limiteAuth, require('./routes/auth'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/facturas', require('./routes/facturas'));
app.use('/api/pagos', require('./routes/pagos'));
app.use('/api/reportes', require('./routes/reportes'));

// Verifica que el servidor y la base de datos funcionan
app.get('/api/salud', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ estado: 'ok', baseDeDatos: 'conectada' });
  } catch {
    res.status(500).json({ estado: 'error', baseDeDatos: 'sin conexión' });
  }
});

// Ruta protegida (cualquier usuario con sesión)
app.get('/api/perfil', verificarToken, (req, res) => {
  res.json({ usuario: req.usuario });
});

// Ruta protegida solo para admin: ver el registro de seguridad
app.get('/api/auditoria', verificarToken, soloAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, usuario_id, accion, detalle, ip, fecha FROM auditoria ORDER BY fecha DESC LIMIT 100'
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));