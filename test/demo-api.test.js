const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer, isoInDays } = require('../demo/server.js');
const { buildRequest, interpretResponse } = require('../extension/lib/api.js');

let server;
let settings;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  settings = { endpoint: `http://127.0.0.1:${server.address().port}/api/reserva-checker/v3`, apiKey: 'demo-key' };
});

after(() => server.close());

// Mismo camino que background.js: buildRequest → fetch → interpretResponse
async function call(payload, overrides = {}) {
  const { url, init } = buildRequest({ ...settings, ...overrides }, payload);
  const res = await fetch(url, init);
  return interpretResponse(res.status, await res.json());
}

test('fecha correcta → ok', async () => {
  const r = await call({ action: 'verify', bookingReference: 'demo-001', visitDate: isoInDays(7) });
  assert.equal(r.status, 'ok');
});

test('fecha distinta → fail con la fecha esperada', async () => {
  const r = await call({ action: 'verify', bookingReference: 'DEMO-001', visitDate: isoInDays(8) });
  assert.equal(r.status, 'fail');
  assert.ok(r.message.includes(isoInDays(7).split('-').reverse().join('/')));
});

test('localizador inexistente → fail', async () => {
  const r = await call({ action: 'verify', bookingReference: 'NOPE-999', visitDate: isoInDays(7) });
  assert.equal(r.status, 'fail');
  assert.match(r.message, /no encontrada/i);
});

test('API key incorrecta → error de credenciales', async () => {
  const r = await call({ action: 'verify', bookingReference: 'DEMO-001', visitDate: isoInDays(7) }, { apiKey: 'mala' });
  assert.equal(r.status, 'error');
});

test('cancelar marca la reserva', async () => {
  const r = await call({ action: 'cancel', bookingReference: 'DEMO-002' });
  assert.equal(r.status, 'ok');
  const bookings = await (await fetch(settings.endpoint.replace('/reserva-checker/v3', '/bookings'))).json();
  assert.equal(bookings['DEMO-002'].status, 'cancelled');
});
