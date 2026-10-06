/**
 * Contrato con el backend de verificación (Apex REST o la API mock de /demo).
 *
 *   POST {endpoint}
 *   X-Api-Key: <clave configurada en Opciones>
 *   { "action": "verify" | "cancel", "bookingReference": "ABC123",
 *     "visitDate": "YYYY-MM-DD", "visitTime": "HH:MM" | null, "site": "demo-form" }
 *
 *   200 { "status": "ok" | "mismatch", "message": "...", "bookingDate": "YYYY-MM-DD" }
 *   404 { "status": "not_found", ... }   401 { "status": "unauthorized", ... }
 */
(function (root) {
  'use strict';

  const ACTIONS = ['verify', 'cancel'];
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME = /^\d{2}:\d{2}$/;

  function validatePayload(p) {
    if (!p || typeof p !== 'object') return 'Petición vacía';
    if (!ACTIONS.includes(p.action)) return 'Acción no válida';
    if (typeof p.bookingReference !== 'string' || !/^[\w-]{3,40}$/.test(p.bookingReference.trim())) {
      return 'Localizador no válido';
    }
    if (p.action === 'verify' && !ISO_DATE.test(p.visitDate || '')) return 'Fecha no válida';
    if (p.visitTime != null && !TIME.test(p.visitTime)) return 'Hora no válida';
    return null;
  }

  function buildRequest(settings, payload) {
    return {
      url: settings.endpoint,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Api-Key': settings.apiKey },
        credentials: 'omit',
        body: JSON.stringify({
          action: payload.action,
          bookingReference: payload.bookingReference.trim().toUpperCase(),
          visitDate: payload.visitDate || null,
          visitTime: payload.visitTime || null,
          product: payload.product || null,
          site: payload.site || null,
        }),
      },
    };
  }

  /** Traduce la respuesta HTTP a un resultado uniforme para la UI. */
  function interpretResponse(httpStatus, body) {
    const data = body && typeof body === 'object' ? body : {};
    const message = typeof data.message === 'string' ? data.message : null;

    if (httpStatus === 401 || httpStatus === 403) {
      return { status: 'error', message: 'Credenciales no válidas. Revisa la API key en Opciones.' };
    }
    if (httpStatus === 404 || data.status === 'not_found') {
      return { status: 'fail', message: message || 'Reserva no encontrada.' };
    }
    if (httpStatus >= 200 && httpStatus < 300) {
      if (data.status === 'ok') return { status: 'ok', message: message || 'Reserva verificada.' };
      if (data.status === 'mismatch') {
        const base = (message || 'La fecha no coincide').replace(/\.?$/, '.');
        const expected = ISO_DATE.test(data.bookingDate || '')
          ? ` La reserva es para el ${data.bookingDate.split('-').reverse().join('/')}.`
          : '';
        return { status: 'fail', message: base + expected };
      }
    }
    return { status: 'error', message: message || `Error del servidor (${httpStatus}).` };
  }

  const api = { validatePayload, buildRequest, interpretResponse };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ReservaChecker = root.ReservaChecker || {};
    root.ReservaChecker.api = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
