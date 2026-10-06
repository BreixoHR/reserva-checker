/**
 * Servidor de demostración sin dependencias:
 *   - /demo/*                       tres webs de venta de entradas ficticias (una por estrategia)
 *   - POST /api/reserva-checker/v3  API mock con el mismo contrato que el endpoint Apex
 *
 *   node demo/server.js   →  http://localhost:8787/demo/
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.DEMO_API_KEY || 'demo-key';
const PAGES_DIR = path.join(__dirname, 'pages');

function isoInDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Reservas de ejemplo con fechas relativas a hoy para que la demo no caduque
function createBookings() {
  return new Map([
    ['DEMO-001', { visitDate: isoInDays(7), status: 'pending' }],
    ['DEMO-002', { visitDate: isoInDays(14), status: 'pending' }],
  ]);
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 10_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
  });
}

function handleApi(bookings, body) {
  if (!body || !['verify', 'cancel'].includes(body.action) || typeof body.bookingReference !== 'string') {
    return [400, { status: 'error', message: 'Petición no válida' }];
  }
  const booking = bookings.get(body.bookingReference.trim().toUpperCase());
  if (!booking) return [404, { status: 'not_found', message: 'Reserva no encontrada' }];

  if (body.action === 'cancel') {
    booking.status = 'cancelled';
    return [200, { status: 'ok', message: 'Compra marcada como cancelada' }];
  }
  const matches = body.visitDate === booking.visitDate;
  booking.status = matches ? 'verified' : 'error';
  return matches
    ? [200, { status: 'ok', message: 'La fecha coincide con la reserva', bookingDate: booking.visitDate }]
    : [200, { status: 'mismatch', message: 'La fecha no coincide', bookingDate: booking.visitDate }];
}

function createServer() {
  const bookings = createBookings();

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/reserva-checker/v3') {
      // CORS abierto solo en la demo, para que funcione aunque no se haya concedido el permiso de host
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }
      if (req.method !== 'POST') return sendJson(res, 405, { status: 'error', message: 'Método no permitido' });
      if (req.headers['x-api-key'] !== API_KEY) return sendJson(res, 401, { status: 'unauthorized', message: 'API key no válida' });
      const [status, body] = handleApi(bookings, await readJson(req));
      return sendJson(res, status, body);
    }

    if (url.pathname === '/api/bookings') {
      return sendJson(res, 200, Object.fromEntries(bookings));
    }

    if (url.pathname === '/' || url.pathname === '/demo' || url.pathname === '/demo/') {
      res.writeHead(302, { Location: '/demo/index.html' });
      return res.end();
    }

    const match = url.pathname.match(/^\/demo\/([\w-]+)(\.html)?$/);
    const file = match && path.join(PAGES_DIR, `${match[1]}.html`);
    if (file && fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(file).pipe(res);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`Demo en http://localhost:${PORT}/demo/  ·  API key: ${API_KEY}`);
  });
}

module.exports = { createServer, handleApi, createBookings, isoInDays };
