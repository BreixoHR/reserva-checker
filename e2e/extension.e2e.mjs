// E2E: carga la extensión en un navegador Chromium headless y la maneja por CDP (sin dependencias).
// Uso: BROWSER_PATH=/ruta/a/chromium npm run test:e2e   (--screenshots para regenerar docs/*.png)
// Nota: Google Chrome estable ignora --load-extension; usa Edge, Chromium o Chrome for Testing.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER = process.env.BROWSER_PATH || (process.platform === 'win32'
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  : 'chromium');
const SCREENSHOTS = process.argv.includes('--screenshots');
const OUT = path.join(REPO, 'docs');
const { createServer, isoInDays } = require(`${REPO}/demo/server.js`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const demo = createServer();
await new Promise((r) => demo.listen(8787, '127.0.0.1', r));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-e2e-'));
const chrome = spawn(BROWSER, [
  '--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${profile}`,
  `--load-extension=${REPO}/extension`, `--disable-extensions-except=${REPO}/extension`,
  '--disable-features=DisableLoadExtensionCommandLineSwitch', '--no-first-run', '--window-size=1100,760', 'about:blank',
], { stdio: 'ignore' });

let results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

async function targets() {
  for (let i = 0; i < 50; i++) {
    try { return await (await fetch('http://127.0.0.1:9333/json')).json(); } catch { await sleep(200); }
  }
  throw new Error('Chrome no responde');
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const ready = new Promise((r) => (ws.onopen = r));
  const send = async (method, params = {}) => { await ready; return new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }); };
  return { send, close: () => ws.close() };
}

try {
  // 1. Configurar la extensión desde su service worker
  // Identifica nuestro SW por el nombre del manifest (Edge trae otras extensiones internas)
  let swc = null;
  for (let i = 0; i < 40 && !swc; i++) {
    for (const t of (await targets()).filter((t) => t.type === 'service_worker')) {
      const c = connect(t.webSocketDebuggerUrl);
      const r = await c.send('Runtime.evaluate', { expression: `chrome.runtime.getManifest().name`, returnByValue: true });
      if (r.result?.result?.value === 'Reserva Checker') { swc = c; break; }
      c.close();
    }
    if (!swc) await sleep(300);
  }
  check('service worker cargado', Boolean(swc));
  await swc.send('Runtime.evaluate', { expression: `chrome.storage.local.set({ endpoint: 'http://127.0.0.1:8787/api/reserva-checker/v3', apiKey: 'demo-key' })`, awaitPromise: true });
  const saved = await swc.send('Runtime.evaluate', { expression: `chrome.storage.local.get('apiKey').then((s) => s.apiKey)`, awaitPromise: true, returnByValue: true });
  check('configuración guardada', saved.result?.result?.value === 'demo-key');

  const page = (await targets()).find((t) => t.type === 'page');
  const p = connect(page.webSocketDebuggerUrl);
  await p.send('Page.enable');
  const evalPage = async (expr) => (await p.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const go = async (url) => { await p.send('Page.navigate', { url }); await sleep(1500); };
  const type = async (text) => p.send('Input.insertText', { text });
  const key = async (k) => {
    await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: 13, text: '\r' });
    await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: 13 });
  };
  const shot = async (name) => { if (!SCREENSHOTS) return; const { result } = await p.send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), Buffer.from(result.data, 'base64')); };
  const panelOpen = () => evalPage(`Boolean(document.getElementById('reserva-checker-root'))`);
  const status = async (ref) => (await evalPage(`fetch('/api/bookings').then(r=>r.json())`))[ref]?.status;

  // 2. Formulario clásico: fecha correcta → verificar → continuar compra
  await go('http://127.0.0.1:8787/demo/form');
  await evalPage(`document.getElementById('btnContinue').click()`); await sleep(400);
  check('form: panel aparece al pulsar Continuar', await panelOpen());
  check('form: el envío queda bloqueado', !(await evalPage(`getComputedStyle(document.getElementById('step2')).display !== 'none'`)));
  await type('DEMO-001'); await key('Enter'); await sleep(800);
  check('form: reserva verificada en backend', (await status('DEMO-001')) === 'verified');
  await shot('panel-ok.png');
  await key('Enter'); await sleep(500); // foco en "Continuar compra"
  check('form: tras verificar se reenvía el formulario', await evalPage(`getComputedStyle(document.getElementById('step2')).display !== 'none'`));

  // 3. Formulario con fecha equivocada → mismatch, el envío no continúa
  await go('http://127.0.0.1:8787/demo/form');
  await evalPage(`document.getElementById('txtFechaVisita').value = '${isoInDays(9).split('-').reverse().join('/')}'; document.getElementById('btnContinue').click()`); await sleep(400);
  await type('DEMO-001'); await key('Enter'); await sleep(800);
  check('form: fecha errónea marcada como error', (await status('DEMO-001')) === 'error');
  await shot('panel-mismatch.png');
  check('form: con fecha errónea no se avanza', !(await evalPage(`getComputedStyle(document.getElementById('step2')).display !== 'none'`)));

  // 4. Calendario SPA (selectionWatch, aria-label D-M-YYYY)
  await go('http://127.0.0.1:8787/demo/calendar');
  await evalPage(`document.querySelectorAll('.cal-day')[6].click()`); await sleep(200);
  check('calendar: sin hora no hay panel', !(await panelOpen()));
  await evalPage(`document.querySelectorAll('.slot')[1].click()`); await sleep(400);
  check('calendar: panel al elegir día + hora', await panelOpen());
  await type('DEMO-001'); await key('Enter'); await sleep(800);
  check('calendar: verificada', (await status('DEMO-001')) === 'verified');
  await shot('calendar.png');

  // 5. Listado de sesiones (slotClick, fecha textual en español)
  await go('http://127.0.0.1:8787/demo/slots');
  await evalPage(`document.querySelectorAll('.activity')[2].querySelector('.ticket').click()`); await sleep(400);
  check('slots: panel al pulsar una sesión', await panelOpen());
  await type('DEMO-002'); await key('Enter'); await sleep(800);
  check('slots: DEMO-002 (+14 días) verificada con fecha textual', (await status('DEMO-002')) === 'verified');

  // 6. La página no puede leer la API key ni el panel (shadow DOM cerrado)
  check('aislamiento: la web no ve el contenido del panel', (await evalPage(`document.getElementById('reserva-checker-root')?.shadowRoot`)) == null);
  check('aislamiento: la API key no está en la página', !(await evalPage(`document.documentElement.outerHTML.includes('demo-key')`)));

  p.close(); swc.close();
} catch (e) {
  results.push('ERROR ' + e.stack);
} finally {
  console.log(results.join('\n'));
  process.exitCode = results.some((r) => !r.startsWith('PASS')) ? 1 : 0;
  chrome.kill(); demo.close();
  setTimeout(() => process.exit(), 500);
}
