/**
 * Normalización de fechas y horas leídas del DOM de webs de venta de entradas.
 *
 * Cada web muestra la fecha a su manera ("30-4-2026", "30/04/2026", "2026-04-30",
 * "30.04.2026", "jueves, 30 de abril de 2026"...). Todo se normaliza a ISO
 * (YYYY-MM-DD) antes de enviarlo al backend, que solo compara fechas ISO.
 *
 * Script clásico (no módulo) para poder usarse como content script de MV3 y,
 * a la vez, cargarse desde los tests de Node.
 */
(function (root) {
  'use strict';

  const MONTHS_ES = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
    agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  };
  const MONTHS_EN = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
    august: 8, september: 9, october: 10, november: 11, december: 12,
  };

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function isValidDate(y, m, d) {
    if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1)) return false;
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return d <= daysInMonth;
  }

  function toIso(y, m, d) {
    return isValidDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  }

  /**
   * Convierte un texto de fecha a ISO YYYY-MM-DD, o null si no es reconocible.
   * Las fechas numéricas ambiguas se interpretan como europeas (día primero).
   */
  function normalizeDate(text) {
    if (typeof text !== 'string') return null;
    const clean = text.replace(/[#]/g, '').trim().toLowerCase();
    if (!clean) return null;

    // Rango "DD/MM/YYYY-DD/MM/YYYY": nos quedamos con la fecha inicial
    const range = clean.match(/^(\d{1,2}[\/.]\d{1,2}[\/.]\d{4})\s*-\s*\d{1,2}[\/.]\d{1,2}[\/.]\d{4}$/);
    if (range) return normalizeDate(range[1]);

    let m = clean.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[t\s].*)?$/);
    if (m) return toIso(+m[1], +m[2], +m[3]);

    m = clean.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:[,\s].*)?$/);
    if (m) return toIso(+m[3], +m[2], +m[1]);

    // Fecha textual: "30 de abril de 2026", "jueves, 30 abril 2026", "april 30, 2026"
    m = clean.match(/(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)\s+(?:de\s+)?(\d{4})/);
    if (m) {
      const month = MONTHS_ES[m[2]] || MONTHS_EN[m[2]];
      if (month) return toIso(+m[3], month, +m[1]);
    }
    m = clean.match(/([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (m && MONTHS_EN[m[1]]) return toIso(+m[3], MONTHS_EN[m[1]], +m[2]);

    return null;
  }

  /** Extrae una hora HH:MM de un texto ("10:30", "Sesión 9:05h", "10.30"), o null. */
  function normalizeTime(text) {
    if (typeof text !== 'string') return null;
    const m = text.match(/(?<!\d)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/);
    return m ? `${pad(+m[1])}:${m[2]}` : null;
  }

  /** Formato legible DD/MM/YYYY para mostrar al operador. */
  function formatForDisplay(isoDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }

  const api = { normalizeDate, normalizeTime, formatForDisplay };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ReservaChecker = root.ReservaChecker || {};
    root.ReservaChecker.date = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
