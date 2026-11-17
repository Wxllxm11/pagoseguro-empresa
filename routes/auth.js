const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const auditar = require('../auditoria');

const router = express.Router();
const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;

// Registro: siempre crea usuarios con rol "cajero"
router.post('/registro', async (req, res) => {
  const { nombre, email, contrasena } = req.body || {};

  if (!nombre || !email || !contrasena) {
    return res.status(400).json({ error: 'Faltan datos' });
  }
  if (contrasena.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener mínimo 8 caracteres' });
  }

  try {
    const hash = await bcrypt.hash(contrasena, 10);
    const r = await pool.query(
      `INSERT INTO usuarios (nombre, email, contrasena_hash, rol)
       VALUES ($1, $2, $3, 'cajero') RETURNING id, nombre, email, rol`,
      [nombre, email.toLowerCase(), hash]
    );
    await auditar(r.rows[0].id, 'REGISTRO', `Usuario creado: ${email}`, req.ip);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Ese correo ya está registrado' });
    }
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Inicio de sesión con bloqueo por intentos fallidos
router.post('/login', async (req, res) => {
  const { email, contrasena } = req.body || {};
  if (!email || !contrasena) {
    return res.status(400).json({ error: 'Faltan datos' });
  }
  try {
    const r = await pool.query(
      `SELECT *, (bloqueado_hasta IS NOT NULL AND bloqueado_hasta > NOW()) AS bloqueada
       FROM usuarios WHERE email = $1`,
      [email.toLowerCase()]
    );
    const u = r.rows[0];

    // 1. ¿La cuenta está bloqueada?
    if (u && u.bloqueada) {
      await auditar(u.id, 'LOGIN_BLOQUEADO', `Intento con cuenta bloqueada: ${email}`, req.ip);
      return res.status(423).json({
        error: `Cuenta bloqueada temporalmente. Intenta de nuevo en ${MINUTOS_BLOQUEO} minutos`
      });
    }

    // 2. Verificar contraseña
    const valido = u && (await bcrypt.compare(contrasena, u.contrasena_hash));

    if (!valido) {
      await auditar(u ? u.id : null, 'LOGIN_FALLIDO', `Intento con ${email}`, req.ip);
      if (u) {
        const f = await pool.query(
          `UPDATE usuarios SET
             intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= $2 THEN 0 ELSE intentos_fallidos + 1 END,
             bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= $2
                                    THEN NOW() + make_interval(mins => $3)
                                    ELSE bloqueado_hasta END
           WHERE id = $1
           RETURNING (bloqueado_hasta IS NOT NULL AND bloqueado_hasta > NOW()) AS bloqueada`,
          [u.id, MAX_INTENTOS, MINUTOS_BLOQUEO]
        );
        if (f.rows[0].bloqueada) {
          await auditar(u.id, 'CUENTA_BLOQUEADA',
            `Bloqueada ${MINUTOS_BLOQUEO} min tras ${MAX_INTENTOS} intentos fallidos`, req.ip);
        }
      }
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // 3. Login correcto: reiniciar contador
    await pool.query(
      'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1',
      [u.id]
    );
    const token = jwt.sign(
      { id: u.id, nombre: u.nombre, rol: u.rol },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );
    await auditar(u.id, 'LOGIN_EXITOSO', `Inicio de sesión de ${email}`, req.ip);
    res.json({ token, usuario: { id: u.id, nombre: u.nombre, rol: u.rol } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;