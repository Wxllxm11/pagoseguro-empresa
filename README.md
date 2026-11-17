# PagoSeguro Empresa

Sistema web de **facturación y pagos** con control de acceso por roles y registro de auditoría de seguridad. Permite gestionar clientes, generar facturas y registrar pagos, con datos persistentes en PostgreSQL y publicado en internet con HTTPS.

**Demo en vivo:** [https://pagoseguro-empresa.onrender.com](https://pagoseguro-empresa.onrender.com)

> El servicio está en el plan gratuito de Render: si lleva un rato sin uso, la primera carga puede tardar entre 30 y 60 segundos.

---

## Características

- **Autenticación segura:** registro e inicio de sesión con contraseñas cifradas (bcrypt) y sesiones con JWT que expiran a las 2 horas.
- **Roles:** `admin` y `cajero`. Cada rol ve y puede hacer cosas distintas.
- **Bloqueo por intentos fallidos:** 5 contraseñas incorrectas seguidas bloquean la cuenta durante 15 minutos.
- **Clientes, facturas y pagos:** flujo completo, con validación del valor exacto de la factura.
- **Pagos transaccionales:** registrar el pago y marcar la factura como pagada ocurre en una sola transacción, con bloqueo de fila para evitar pagos dobles.
- **Auditoría:** cada acción sensible queda registrada con usuario, IP y fecha.
- **Panel de auditoría (solo admin):** indicadores, resumen del sistema y filtros por acción.

## Roles y permisos

| Acción | Cajero | Admin |
| --- | :---: | :---: |
| Crear clientes y facturas | ✅ | ✅ |
| Registrar pagos | ✅ | ✅ |
| Anular facturas pendientes | ❌ | ✅ |
| Ver auditoría y reportes | ❌ | ✅ |

Las cuentas creadas desde el formulario de registro siempre son `cajero`.

## Tecnologías

| Capa | Herramientas |
| --- | --- |
| Backend | Node.js, Express |
| Base de datos | PostgreSQL ([Neon](https://neon.tech)) |
| Seguridad | bcryptjs, jsonwebtoken, helmet, cors, express-rate-limit |
| Frontend | HTML, CSS y JavaScript puros (servido por Express) |
| Despliegue | GitHub + [Render](https://render.com) |

## Arquitectura

```
Navegador  →  Render (Express + frontend estático)  →  Neon (PostgreSQL)
                         ↑
                  GitHub (despliegue automático en cada push)
```

## Estructura del proyecto

```
pagoseguro-empresa/
├── middleware/
│   └── auth.js          # Verificación de token y control de roles
├── public/
│   ├── index.html       # Interfaz
│   ├── style.css
│   └── app.js           # Lógica del frontend
├── routes/
│   ├── auth.js          # Registro, login y bloqueo de cuenta
│   ├── clientes.js
│   ├── facturas.js
│   ├── pagos.js
│   └── reportes.js      # Reportes de auditoría (admin)
├── auditoria.js         # Registro de eventos de seguridad
├── db.js                # Conexión a PostgreSQL
├── server.js            # Punto de entrada
└── package.json
```

## Ejecutar en local

### Requisitos

- [Node.js](https://nodejs.org) (versión LTS)
- Una base de datos PostgreSQL (por ejemplo, un proyecto gratuito en [Neon](https://neon.tech))

### Pasos

1. **Clonar e instalar**

   ```bash
   git clone https://github.com/TU_USUARIO/pagoseguro-empresa.git
   cd pagoseguro-empresa
   npm install
   ```

2. **Crear el archivo `.env`** en la raíz del proyecto:

   ```env
   DATABASE_URL=postgresql://usuario:contraseña@host/basedatos?sslmode=require
   JWT_SECRET=una_clave_larga_y_aleatoria
   PORT=3000
   ```

   Para generar una clave segura:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

3. **Crear las tablas** ejecutando el script de la sección [Base de datos](#base-de-datos) en el editor SQL de tu base de datos.

4. **Iniciar el servidor**

   ```bash
   npm run dev     # con reinicio automático (nodemon)
   npm start       # modo producción
   ```

5. Abrir [http://localhost:3000](http://localhost:3000).

6. **Crear un administrador:** regístrate desde la interfaz y luego, en el editor SQL:

   ```sql
   UPDATE usuarios SET rol = 'admin' WHERE email = 'tu_correo@ejemplo.com';
   ```

   Cierra sesión y vuelve a entrar para que el token tome el rol nuevo.

### Variables de entorno

| Variable | Descripción |
| --- | --- |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL |
| `JWT_SECRET` | Clave para firmar los tokens de sesión |
| `PORT` | Puerto del servidor (opcional; Render lo define automáticamente) |

> **Importante:** el archivo `.env` está en `.gitignore` y nunca debe subirse al repositorio.

## Base de datos

<details>
<summary>Ver script SQL completo</summary>

```sql
CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  contrasena_hash TEXT NOT NULL,
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('admin', 'cajero')),
  creado_en TIMESTAMP DEFAULT NOW(),
  intentos_fallidos INT NOT NULL DEFAULT 0,
  bloqueado_hasta TIMESTAMPTZ
);

CREATE TABLE clientes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  documento VARCHAR(30) UNIQUE NOT NULL,
  email VARCHAR(150),
  telefono VARCHAR(30),
  creado_en TIMESTAMP DEFAULT NOW()
);

CREATE TABLE facturas (
  id SERIAL PRIMARY KEY,
  cliente_id INT NOT NULL REFERENCES clientes(id),
  concepto VARCHAR(200) NOT NULL,
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'pagada', 'anulada')),
  fecha_emision TIMESTAMP DEFAULT NOW(),
  fecha_vencimiento DATE
);

CREATE TABLE pagos (
  id SERIAL PRIMARY KEY,
  factura_id INT NOT NULL REFERENCES facturas(id),
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  metodo VARCHAR(30) NOT NULL
    CHECK (metodo IN ('efectivo', 'transferencia', 'tarjeta')),
  referencia VARCHAR(100),
  fecha_pago TIMESTAMP DEFAULT NOW(),
  registrado_por INT NOT NULL REFERENCES usuarios(id)
);

CREATE TABLE auditoria (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id),
  accion VARCHAR(50) NOT NULL,
  detalle TEXT,
  ip VARCHAR(45),
  fecha TIMESTAMP DEFAULT NOW()
);
```

</details>

## API

Todas las rutas, salvo las públicas, requieren el encabezado `Authorization: Bearer <token>`.

| Método y ruta | Acceso | Descripción |
| --- | --- | --- |
| `POST /api/auth/registro` | Público | Crear cuenta (rol cajero) |
| `POST /api/auth/login` | Público | Iniciar sesión |
| `GET /api/salud` | Público | Estado del servidor y de la base de datos |
| `GET /api/perfil` | Sesión | Datos del usuario autenticado |
| `GET /api/clientes` · `POST /api/clientes` | Sesión | Listar y crear clientes |
| `GET /api/facturas` · `POST /api/facturas` | Sesión | Listar (filtro `?estado=`) y crear facturas |
| `PATCH /api/facturas/:id/anular` | Admin | Anular una factura pendiente |
| `GET /api/pagos` · `POST /api/pagos` | Sesión | Listar y registrar pagos |
| `GET /api/auditoria` | Admin | Últimos 100 eventos |
| `GET /api/reportes/auditoria` | Admin | Auditoría con filtros (`accion`, `usuario_id`, `desde`, `hasta`, `limite`) |
| `GET /api/reportes/resumen` | Admin | Resumen de facturas, pagos y actividad |

## Seguridad

| Control | Implementación |
| --- | --- |
| Contraseñas | Cifradas con bcrypt; nunca se guardan en texto plano |
| Sesiones | JWT firmado, con expiración de 2 horas |
| Fuerza bruta | Bloqueo de cuenta tras 5 intentos fallidos (15 min) y límite de peticiones en `/api/auth` |
| Inyección SQL | Todas las consultas usan parámetros (`$1`, `$2`, ...) |
| Inyección de código (XSS) | El frontend escapa todo dato antes de mostrarlo |
| Cabeceras HTTP | helmet |
| Secretos | En variables de entorno, fuera del repositorio |
| Integridad de pagos | Transacción con `FOR UPDATE` y validación del valor exacto |
| Trazabilidad | Auditoría de registros, logins, bloqueos, clientes, facturas y pagos |

## Despliegue

El proyecto se publica en **Render** como *Web Service* conectado a este repositorio:

| Ajuste | Valor |
| --- | --- |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Variables de entorno | `DATABASE_URL`, `JWT_SECRET` |

Cada `git push` a la rama `main` dispara un nuevo despliegue automático.

## Limitaciones conocidas

- Solo se admiten pagos totales (sin abonos parciales).
- No hay verificación en dos pasos ni recuperación de contraseña.
- El token no se renueva: al vencer, hay que iniciar sesión de nuevo.
- No hay gestión de usuarios desde la interfaz; el rol de administrador se asigna directamente en la base de datos.
- CORS está abierto a cualquier origen y la conexión a la base de datos no valida el certificado; para producción real conviene restringir ambos.
- No hay pruebas automatizadas.

## Autor

Proyecto académico desarrollado por **WILLIAM ANGULO, MARTIN TORRES, JESID ROJANO**.
