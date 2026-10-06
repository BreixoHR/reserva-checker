/**
 * Adaptadores por web.
 *
 * Cada web de venta de entradas expone la fecha/hora elegida de forma distinta.
 * En lugar de un script por web, hay tres estrategias genéricas que se
 * parametrizan con selectores CSS:
 *
 *  - formSubmit:      la web es un formulario clásico (p. ej. ASP.NET WebForms).
 *                     Se intercepta el submit del botón "Continuar", se leen los
 *                     inputs de fecha/hora y se re-envía el formulario tras verificar.
 *  - selectionWatch:  SPA (Angular/React) donde la selección se refleja en clases
 *                     o atributos del DOM. Se observa con MutationObserver y se
 *                     dispara cuando la combinación fecha+hora cambia.
 *  - slotClick:       listado de sesiones clicables. La hora está en el propio
 *                     botón y la fecha en un contenedor ancestro.
 *
 * Los adaptadores de las webs reales usadas en producción no se publican; los
 * de este fichero apuntan a las páginas de /demo.
 */
(function (root) {
  'use strict';

  const ADAPTERS = [
    {
      id: 'demo-form',
      name: 'Demo · formulario clásico',
      match: { hosts: ['localhost', '127.0.0.1'], pathIncludes: '/demo/form' },
      strategy: 'formSubmit',
      submitButton: '#btnContinue',
    },
    {
      id: 'demo-calendar',
      name: 'Demo · calendario SPA',
      match: { hosts: ['localhost', '127.0.0.1'], pathIncludes: '/demo/calendar' },
      strategy: 'selectionWatch',
      date: { selector: '.cal-day[aria-selected="true"]', attr: 'aria-label' }, // "30-4-2026"
      time: { selector: '.slot.is-selected', attr: 'aria-label' },
      product: { selector: '.product.is-selected' },
    },
    {
      id: 'demo-slots',
      name: 'Demo · listado de sesiones',
      match: { hosts: ['localhost', '127.0.0.1'], pathIncludes: '/demo/slots' },
      strategy: 'slotClick',
      container: '#schedule',
      slot: '.ticket',
      time: { selector: '.ticket-time' },
      dateScope: '.activity',
      date: { selector: '.activity-date' },
    },
  ];

  function findAdapter(location, adapters = ADAPTERS) {
    return (
      adapters.find(({ match }) => {
        const hostOk = match.hosts.some((h) => location.hostname === h || location.hostname.endsWith('.' + h));
        const pathOk = !match.pathIncludes || location.pathname.includes(match.pathIncludes);
        return hostOk && pathOk;
      }) || null
    );
  }

  function readValue(scope, spec) {
    if (!spec || !scope) return null;
    const el = scope.querySelector(spec.selector);
    if (!el) return null;
    const isField = el.matches('input, select, textarea');
    const raw = spec.attr ? el.getAttribute(spec.attr) : isField ? el.value : el.textContent;
    return raw ? String(raw).trim() : null;
  }

  // Heurística heredada de v1/v2 para formularios sin selectores estables
  function detectDateTimeInForm(form, dateLib) {
    const fields = [...form.querySelectorAll('input, select, textarea')]
      .map((input) => ({
        value: (input.value || '').trim(),
        hints: [input.name, input.id, input.placeholder, input.className].join(' ').toLowerCase(),
      }))
      .filter((f) => f.value);

    const fromHinted = (hintRe, normalize) =>
      fields.filter((f) => hintRe.test(f.hints)).map((f) => normalize(f.value)).find(Boolean) || null;

    // Fecha: primero campos cuyo nombre la sugiere; si no, cualquier valor con forma de fecha.
    // Hora: solo campos con nombre de hora ("1.05.2026" no debe leerse como 01:05).
    return {
      date:
        fromHinted(/fecha|date|day|dia/, dateLib.normalizeDate) ||
        fields.map((f) => dateLib.normalizeDate(f.value)).find(Boolean) ||
        null,
      time: fromHinted(/hora|time|session|sesion/, dateLib.normalizeTime),
    };
  }

  const strategies = {
    formSubmit(adapter, onSelection, { dateLib }) {
      document.addEventListener(
        'submit',
        (event) => {
          const form = event.target;
          const submitter = event.submitter || document.activeElement;
          if (!submitter || !submitter.matches?.(adapter.submitButton)) return;
          if (form.dataset.rcVerified === '1') return; // ya verificado: se deja pasar

          const { date, time } = detectDateTimeInForm(form, dateLib);
          if (!date) return; // sin fecha no se bloquea nada

          // Captura en document: se frena antes de que lleguen los handlers de la web
          event.preventDefault();
          event.stopPropagation();
          onSelection({
            date,
            time,
            onVerified() {
              form.dataset.rcVerified = '1';
              form.requestSubmit(submitter);
            },
          });
        },
        true
      );
    },

    selectionWatch(adapter, onSelection, { dateLib }) {
      let last = null;
      let scheduled = false;

      const check = () => {
        scheduled = false;
        const date = dateLib.normalizeDate(readValue(document, adapter.date));
        const time = dateLib.normalizeTime(readValue(document, adapter.time));
        const product = adapter.product ? readValue(document, adapter.product) : null;
        if (!date || !time) return;

        const key = `${date}|${time}|${product || ''}`;
        if (key === last) return;
        last = key;
        onSelection({ date, time, product });
      };

      // Agrupa ráfagas de mutaciones en una sola comprobación (setTimeout y no
      // requestAnimationFrame: rAF no se ejecuta si la pestaña no se está pintando)
      new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(check, 50);
      }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-selected'] });
    },

    slotClick(adapter, onSelection, { dateLib }) {
      document.addEventListener('click', (event) => {
        const slot = event.target.closest?.(`${adapter.container} ${adapter.slot}`);
        if (!slot) return;
        const scope = slot.closest(adapter.dateScope) || document;
        const date = dateLib.normalizeDate(readValue(scope, adapter.date));
        const time = dateLib.normalizeTime(readValue(slot, adapter.time));
        if (date) onSelection({ date, time });
      });
    },
  };

  function startAdapter(adapter, onSelection, deps) {
    const strategy = strategies[adapter.strategy];
    if (!strategy) throw new Error(`Estrategia desconocida: ${adapter.strategy}`);
    strategy(adapter, onSelection, deps);
  }

  const api = { ADAPTERS, findAdapter, startAdapter, detectDateTimeInForm };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ReservaChecker = root.ReservaChecker || {};
    root.ReservaChecker.adapters = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
