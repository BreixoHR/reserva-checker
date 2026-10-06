const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validatePayload, buildRequest, interpretResponse } = require('../extension/lib/api.js');

const valid = { action: 'verify', bookingReference: 'abc-123', visitDate: '2026-04-30', visitTime: '10:30', site: 'demo' };

test('validatePayload acepta una petición correcta', () => {
  assert.equal(validatePayload(valid), null);
  assert.equal(validatePayload({ action: 'cancel', bookingReference: 'ABC123' }), null);
});

test('validatePayload rechaza datos malformados', () => {
  assert.match(validatePayload(null), /vacía/);
  assert.match(validatePayload({ ...valid, action: 'delete' }), /Acción/);
  assert.match(validatePayload({ ...valid, bookingReference: 'a' }), /Localizador/);
  assert.match(validatePayload({ ...valid, bookingReference: "x' OR 1=1" }), /Localizador/);
  assert.match(validatePayload({ ...valid, visitDate: '30/04/2026' }), /Fecha/);
  assert.match(validatePayload({ ...valid, visitTime: '9h' }), /Hora/);
});

test('buildRequest envía la API key en cabecera y normaliza el localizador', () => {
  const { url, init } = buildRequest({ endpoint: 'https://api.example/v3', apiKey: 'k' }, valid);
  assert.equal(url, 'https://api.example/v3');
  assert.equal(init.headers['X-Api-Key'], 'k');
  assert.equal(init.credentials, 'omit');
  const body = JSON.parse(init.body);
  assert.equal(body.bookingReference, 'ABC-123');
  assert.equal(body.visitDate, '2026-04-30');
});

test('interpretResponse traduce cada caso a ok / fail / error', () => {
  assert.equal(interpretResponse(200, { status: 'ok' }).status, 'ok');

  const mismatch = interpretResponse(200, { status: 'mismatch', message: 'La fecha no coincide', bookingDate: '2026-05-01' });
  assert.equal(mismatch.status, 'fail');
  assert.equal(mismatch.message, 'La fecha no coincide. La reserva es para el 01/05/2026.');

  assert.equal(interpretResponse(404, { status: 'not_found' }).status, 'fail');
  assert.match(interpretResponse(401, {}).message, /API key/);
  assert.equal(interpretResponse(500, null).status, 'error');
  assert.equal(interpretResponse(200, { status: 'raro' }).status, 'error');
});
