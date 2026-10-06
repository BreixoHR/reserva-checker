# Historial de versiones

Fechas reales de cada versión en producción. La v3 es la reescritura publicada en este repositorio.

## 3.0.0 · 2026-10-05: reescritura para publicación
- Adaptadores declarativos (`formSubmit`, `selectionWatch`, `slotClick`) en lugar de código duplicado por web.
- Credenciales fuera del código: página de Opciones y `chrome.storage`. Los callouts salen del service worker.
- Endpoint Apex con la API key guardada como hash en Custom Metadata.
- Permisos mínimos (`optional_host_permissions`) y panel en Shadow DOM cerrado.
- 16 tests unitarios, e2e en Chromium headless y tests Apex.

## 2.1.x · 2026-02-11 → 2026-04-28
- **2.1.8** (2026-04-28): la release en producción cubre 10 webs de venta de entradas de monumentos.
- **2.1.1** (2026-02-11): release con dos webs y nuevos tipos de calendario.

## 2.0.x / 2.1.0 · 2025-08-20 → 2025-09-15
- **2.1.0** (2025-08-25), **2.0.12** (2025-09-15, en proceso), **2.0.10** y **2.0.11** (2025-08-20).
- Paso de una web a varias: formularios ASP.NET, SPAs y listados de sesiones.

## 1.x · 2025-04-09 → 2025-08-18
| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 2025-04-09 | Prueba de concepto: popup de verificación antes de comprar |
| 1.1 | 2025-04-15 | Ajustes de detección de fecha |
| 1.2 | 2025-04-16 | Comunicación estable con el endpoint Apex (sin token) |
| 1.3 | 2025-04-16 | Trazabilidad de cancelaciones |
| 1.4 | 2025-04-21 | Alertas verificadas |
| 1.5 | 2025-05-15 | El popup se lanza en el paso de confirmación |
| 1.6 / 1.6.1 | 2025-05-14 → 2025-05-15 | Autenticación del endpoint y servidor intermedio |
| 1.6.2 | 2025-08-06 | Credenciales cifradas en la extensión |
| 1.7 | 2025-07-07 → 2025-08-07 | Ejecución con autenticación |
| 1.8 | 2025-08-08 | |
| 1.9 | 2025-08-18 | Revisión previa al multisitio |
