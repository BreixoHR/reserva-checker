/* Service worker: único punto que conoce la API key y habla con el backend. */
importScripts('lib/api.js');

const { validatePayload, buildRequest, interpretResponse } = self.ReservaChecker.api;
const REQUEST_TIMEOUT_MS = 10000;

async function getSettings() {
  const { endpoint = '', apiKey = '' } = await chrome.storage.local.get(['endpoint', 'apiKey']);
  return { endpoint, apiKey };
}

async function handleSubmit(payload) {
  const invalid = validatePayload(payload);
  if (invalid) return { status: 'fail', message: invalid };

  const settings = await getSettings();
  if (!settings.endpoint || !settings.apiKey) {
    return { status: 'error', message: 'Extensión sin configurar. Abre Opciones e indica endpoint y API key.' };
  }

  const { url, init } = buildRequest(settings, payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const body = await res.json().catch(() => null);
    return interpretResponse(res.status, body);
  } catch (err) {
    const timedOut = err.name === 'AbortError';
    return { status: 'error', message: timedOut ? 'El servidor no responde. Inténtalo de nuevo.' : 'No se pudo contactar con el servidor.' };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'reserva-checker:submit' || sender.id !== chrome.runtime.id) return false;
  handleSubmit(message.payload).then(sendResponse);
  return true; // respuesta asíncrona
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
