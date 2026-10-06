/**
 * Punto de entrada del content script: elige el adaptador de la web actual y,
 * cuando el operador selecciona fecha/hora, muestra el panel de verificación.
 *
 * El content script NUNCA habla con el backend ni conoce la API key: delega en
 * el service worker (background.js) mediante chrome.runtime.sendMessage.
 */
(function () {
  'use strict';

  const { date: dateLib, adapters } = globalThis.ReservaChecker;
  const adapter = adapters.findAdapter(window.location);
  if (!adapter) return;

  const HOST_ID = 'reserva-checker-root';

  const STYLE = `
    :host { all: initial; }
    .backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: grid;
      place-items: center; z-index: 2147483647; font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
    .card { background: #fff; color: #0f172a; width: min(400px, calc(100vw - 32px)); border-radius: 14px;
      padding: 22px; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
    h2 { margin: 0 0 4px; font-size: 18px; }
    .meta { margin: 0 0 16px; color: #475569; font-size: 14px; }
    .meta strong { color: #0f172a; }
    label { display: block; font-size: 13px; color: #475569; margin-bottom: 6px; }
    input { box-sizing: border-box; width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1;
      border-radius: 8px; font: inherit; }
    input:focus { outline: 2px solid #2563eb; outline-offset: 1px; }
    .actions { display: flex; gap: 8px; margin-top: 16px; }
    button { flex: 1; padding: 10px 12px; border: 0; border-radius: 8px; font: inherit; font-weight: 600; cursor: pointer; }
    button:disabled { opacity: .6; cursor: default; }
    .primary { background: #2563eb; color: #fff; }
    .secondary { background: #f1f5f9; color: #0f172a; }
    .danger { background: transparent; color: #b91c1c; flex: 0 0 auto; padding-inline: 4px; }
    .result { margin-top: 14px; padding: 10px 12px; border-radius: 8px; font-size: 14px; display: none; }
    .result.ok { display: block; background: #dcfce7; color: #14532d; }
    .result.fail { display: block; background: #fee2e2; color: #7f1d1d; }
    .result.info { display: block; background: #f1f5f9; color: #334155; }
  `;

  function sendToBackground(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ status: 'error', message: 'La extensión se ha recargado. Refresca la página.' });
          } else {
            resolve(response || { status: 'error', message: 'Sin respuesta del servicio.' });
          }
        });
      } catch {
        resolve({ status: 'error', message: 'La extensión se ha recargado. Refresca la página.' });
      }
    });
  }

  function el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text) node.textContent = text;
    return node;
  }

  function openPanel({ date, time, product, onVerified }) {
    document.getElementById(HOST_ID)?.remove();

    const host = el('div', { id: HOST_ID });
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.append(el('style', {}, STYLE));

    const backdrop = el('div', { class: 'backdrop' });
    const card = el('div', { class: 'card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rc-title' });

    card.append(el('h2', { id: 'rc-title' }, 'Comprobar reserva'));
    const meta = el('p', { class: 'meta' });
    meta.append('Fecha seleccionada: ', el('strong', {}, dateLib.formatForDisplay(date)));
    if (time) meta.append(' · ', el('strong', {}, time));
    if (product) meta.append(' · ', el('strong', {}, product));
    card.append(meta);

    card.append(el('label', { for: 'rc-ref' }, 'Localizador de la reserva'));
    const input = el('input', { id: 'rc-ref', type: 'text', autocomplete: 'off', spellcheck: 'false' });
    card.append(input);

    const result = el('div', { class: 'result', role: 'status', 'aria-live': 'polite' });
    const actions = el('div', { class: 'actions' });
    const verifyBtn = el('button', { class: 'primary', type: 'button' }, 'Verificar');
    const closeBtn = el('button', { class: 'secondary', type: 'button' }, 'Cerrar');
    const cancelBtn = el('button', { class: 'danger', type: 'button', title: 'Marcar la compra como cancelada' }, 'Cancelar compra');
    actions.append(verifyBtn, closeBtn, cancelBtn);
    card.append(actions, result);

    backdrop.append(card);
    shadow.append(backdrop);
    document.documentElement.append(host);
    input.focus();

    const close = () => host.remove();
    const showResult = (tone, text) => {
      result.className = `result ${tone}`;
      result.textContent = text;
    };
    const setBusy = (busy) => [verifyBtn, cancelBtn].forEach((b) => (b.disabled = busy));

    async function submit(action) {
      const bookingReference = input.value.trim();
      if (!bookingReference) {
        showResult('fail', 'Introduce el localizador.');
        input.focus();
        return;
      }
      setBusy(true);
      showResult('info', action === 'cancel' ? 'Registrando cancelación…' : 'Verificando…');

      const response = await sendToBackground({
        type: 'reserva-checker:submit',
        payload: { action, bookingReference, visitDate: date, visitTime: time || null, product: product || null, site: adapter.id },
      });
      setBusy(false);

      if (action === 'cancel') {
        showResult(response.status === 'ok' ? 'info' : 'fail', response.message);
        if (response.status === 'ok') setTimeout(close, 1200);
        return;
      }

      if (response.status === 'ok') {
        showResult('ok', response.message || 'La fecha coincide con la reserva.');
        verifyBtn.textContent = onVerified ? 'Continuar compra' : 'Hecho';
        verifyBtn.onclick = () => {
          close();
          onVerified?.();
        };
        verifyBtn.focus();
      } else {
        showResult('fail', response.message || 'La fecha no coincide con la reserva.');
      }
    }

    verifyBtn.onclick = () => submit('verify');
    cancelBtn.onclick = () => submit('cancel');
    closeBtn.onclick = close;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        verifyBtn.click();
      }
    });
    backdrop.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  }

  adapters.startAdapter(adapter, openPanel, { dateLib });
  console.info(`[Reserva Checker] activo en "${adapter.name}"`);
})();
