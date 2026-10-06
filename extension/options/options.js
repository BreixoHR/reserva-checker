const form = document.getElementById('settings');
const endpointInput = document.getElementById('endpoint');
const apiKeyInput = document.getElementById('apiKey');
const statusEl = document.getElementById('status');

function setStatus(text, tone = '') {
  statusEl.textContent = text;
  statusEl.className = tone;
}

function originPattern(url) {
  const { protocol, hostname } = new URL(url);
  return `${protocol}//${hostname}/*`;
}

// Solo se pide permiso de red para el origen del endpoint configurado (no <all_urls>)
async function ensureHostPermission(url) {
  const origins = [originPattern(url)];
  if (await chrome.permissions.contains({ origins })) return true;
  return chrome.permissions.request({ origins });
}

chrome.storage.local.get(['endpoint', 'apiKey']).then(({ endpoint = '', apiKey = '' }) => {
  endpointInput.value = endpoint;
  apiKeyInput.value = apiKey;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const endpoint = endpointInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  try {
    const { protocol, hostname } = new URL(endpoint);
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    if (protocol !== 'https:' && !isLocal) {
      setStatus('El endpoint debe usar HTTPS.', 'error');
      return;
    }
  } catch {
    setStatus('URL no válida.', 'error');
    return;
  }
  if (!(await ensureHostPermission(endpoint))) {
    setStatus('Sin permiso para conectar con ese dominio.', 'error');
    return;
  }
  await chrome.storage.local.set({ endpoint, apiKey });
  setStatus('Guardado.', 'ok');
});

document.getElementById('test').addEventListener('click', async () => {
  setStatus('Probando…');
  const response = await chrome.runtime.sendMessage({
    type: 'reserva-checker:submit',
    payload: { action: 'verify', bookingReference: 'PING-000', visitDate: '2000-01-01', visitTime: null, site: 'options' },
  });
  // "Reserva no encontrada" significa que endpoint y credenciales funcionan
  const reachable = response.status !== 'error';
  setStatus(reachable ? 'Conexión correcta.' : response.message, reachable ? 'ok' : 'error');
});
