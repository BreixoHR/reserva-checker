chrome.storage.local.get(['endpoint', 'apiKey']).then(({ endpoint, apiKey }) => {
  const configured = Boolean(endpoint && apiKey);
  document.getElementById('dot').classList.toggle('on', configured);
  document.getElementById('state').textContent = configured
    ? 'Activo: valida la fecha antes de comprar.'
    : 'Sin configurar.';
});

document.getElementById('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
