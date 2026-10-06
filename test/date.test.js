const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDate, normalizeTime, formatForDisplay } = require('../extension/lib/date.js');

test('normalizeDate: formatos numéricos europeos e ISO', () => {
  const cases = {
    '30/04/2026': '2026-04-30',
    '30-4-2026': '2026-04-30',
    '3.5.2026': '2026-05-03',
    '2026-04-30': '2026-04-30',
    '2026/4/3': '2026-04-03',
    '2026-04-30T10:00:00Z': '2026-04-30',
    '30/04/2026, 10:30': '2026-04-30',
    '#30/04/2026': '2026-04-30',
  };
  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(normalizeDate(input), expected, input);
  }
});

test('normalizeDate: rangos devuelven la fecha inicial', () => {
  assert.equal(normalizeDate('23/05/2026-23/05/2026'), '2026-05-23');
});

test('normalizeDate: fechas textuales en español e inglés', () => {
  assert.equal(normalizeDate('jueves, 15 de octubre de 2026'), '2026-10-15');
  assert.equal(normalizeDate('1 septiembre 2026'), '2026-09-01');
  assert.equal(normalizeDate('October 15, 2026'), '2026-10-15');
  assert.equal(normalizeDate('15 October 2026'), '2026-10-15');
});

test('normalizeDate: rechaza fechas imposibles o texto sin fecha', () => {
  for (const input of ['31/02/2026', '00/01/2026', '12/13/2026', 'mañana', '', null, undefined, 42, '10:30']) {
    assert.equal(normalizeDate(input), null, String(input));
  }
});

test('normalizeDate: 29 de febrero solo en años bisiestos', () => {
  assert.equal(normalizeDate('29/02/2028'), '2028-02-29');
  assert.equal(normalizeDate('29/02/2027'), null);
});

test('normalizeTime: extrae y rellena HH:MM', () => {
  assert.equal(normalizeTime('9:05'), '09:05');
  assert.equal(normalizeTime('Sesión 16:30h'), '16:30');
  assert.equal(normalizeTime('10.45'), '10:45');
  assert.equal(normalizeTime('25:00'), null);
  assert.equal(normalizeTime('sin hora'), null);
  assert.equal(normalizeTime(null), null);
});

test('formatForDisplay', () => {
  assert.equal(formatForDisplay('2026-04-30'), '30/04/2026');
  assert.equal(formatForDisplay('basura'), '');
});
