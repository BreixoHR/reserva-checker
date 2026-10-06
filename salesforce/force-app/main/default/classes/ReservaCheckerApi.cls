/**
 * Endpoint REST que usa la extensión Reserva Checker para comprobar, antes de
 * comprar entradas, que la fecha elegida en la web coincide con la reserva.
 *
 *   POST /services/apexrest/reserva-checker/v3
 *   X-Api-Key: <clave>
 *   { "action": "verify" | "cancel", "bookingReference": "ABC123", "visitDate": "YYYY-MM-DD", ... }
 *
 * Seguridad:
 *  - La API key nunca se guarda en claro: se compara su SHA-256 con el valor de
 *    Reserva_Checker_Setting__mdt.Default (metadato protegido).
 *  - Entrada validada y tipada; la consulta usa bind variables.
 *  - Los mensajes de error no exponen detalles internos.
 */
@RestResource(urlMapping='/reserva-checker/v3')
global without sharing class ReservaCheckerApi {
    @TestVisible
    private static String apiKeyHashOverride;

    private static final Pattern REFERENCE_PATTERN = Pattern.compile('^[A-Za-z0-9_-]{3,40}$');
    private static final Pattern ISO_DATE_PATTERN = Pattern.compile('^\\d{4}-\\d{2}-\\d{2}$');

    global class CheckRequest {
        public String action;
        public String bookingReference;
        public String visitDate;
        public String visitTime;
        public String product;
        public String site;
    }

    global class CheckResponse {
        public String status;
        public String message;
        public String bookingDate;

        CheckResponse(String status, String message, String bookingDate) {
            this.status = status;
            this.message = message;
            this.bookingDate = bookingDate;
        }
    }

    @HttpPost
    global static void handlePost() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;

        if (!isAuthorized(getHeader(req, 'x-api-key'))) {
            respond(res, 401, new CheckResponse('unauthorized', 'API key no válida', null));
            return;
        }

        CheckRequest body;
        try {
            body = (CheckRequest) JSON.deserialize(req.requestBody.toString(), CheckRequest.class);
        } catch (Exception e) {
            respond(res, 400, new CheckResponse('error', 'JSON no válido', null));
            return;
        }

        String validationError = validate(body);
        if (validationError != null) {
            respond(res, 400, new CheckResponse('error', validationError, null));
            return;
        }

        String reference = body.bookingReference.trim().toUpperCase();
        List<Booking__c> bookings = [
            SELECT Id, Visit_Date__c, Verification_Status__c
            FROM Booking__c
            WHERE Booking_Reference__c = :reference
            LIMIT 1
        ];
        if (bookings.isEmpty()) {
            respond(res, 404, new CheckResponse('not_found', 'Reserva no encontrada', null));
            return;
        }

        Booking__c booking = bookings[0];
        String bookingDate = booking.Visit_Date__c == null ? null : formatIso(booking.Visit_Date__c);
        CheckResponse result;

        if (body.action == 'cancel') {
            booking.Verification_Status__c = 'Cancelled';
            result = new CheckResponse('ok', 'Compra marcada como cancelada', bookingDate);
        } else {
            Boolean matches = booking.Visit_Date__c != null && booking.Visit_Date__c == parseIsoDate(body.visitDate);
            booking.Verification_Status__c = matches ? 'Verified' : 'Mismatch';
            result = matches
                ? new CheckResponse('ok', 'La fecha coincide con la reserva', bookingDate)
                : new CheckResponse('mismatch', 'La fecha no coincide', bookingDate);
        }

        booking.Last_Verification__c = System.now();
        booking.Last_Verification_Site__c = String.isBlank(body.site) ? null : body.site.left(80);
        update booking;

        respond(res, 200, result);
    }

    @TestVisible
    private static String validate(CheckRequest body) {
        if (body == null) {
            return 'Petición vacía';
        }
        if (body.action != 'verify' && body.action != 'cancel') {
            return 'Acción no válida';
        }
        if (
            String.isBlank(body.bookingReference) || !REFERENCE_PATTERN.matcher(body.bookingReference.trim()).matches()
        ) {
            return 'Localizador no válido';
        }
        if (body.action == 'verify' && parseIsoDate(body.visitDate) == null) {
            return 'Fecha no válida';
        }
        return null;
    }

    // Date.newInstance desborda fechas imposibles (31/02 → 03/03); se exige ida y vuelta exacta
    @TestVisible
    private static Date parseIsoDate(String value) {
        if (String.isBlank(value) || !ISO_DATE_PATTERN.matcher(value).matches()) {
            return null;
        }
        Integer y = Integer.valueOf(value.substring(0, 4));
        Integer m = Integer.valueOf(value.substring(5, 7));
        Integer d = Integer.valueOf(value.substring(8, 10));
        if (m < 1 || m > 12 || d < 1) {
            return null;
        }
        Date parsed = Date.newInstance(y, m, d);
        return (parsed.year() == y && parsed.month() == m && parsed.day() == d) ? parsed : null;
    }

    private static Boolean isAuthorized(String apiKey) {
        String expectedHash = apiKeyHashOverride;
        if (expectedHash == null) {
            Reserva_Checker_Setting__mdt setting = Reserva_Checker_Setting__mdt.getInstance('Default');
            expectedHash = setting == null ? null : setting.Api_Key_Hash__c;
        }
        if (String.isBlank(apiKey) || String.isBlank(expectedHash)) {
            return false;
        }
        return sha256Hex(apiKey) == expectedHash.toLowerCase();
    }

    @TestVisible
    private static String sha256Hex(String value) {
        return EncodingUtil.convertToHex(Crypto.generateDigest('SHA-256', Blob.valueOf(value)));
    }

    // Las cabeceras pueden llegar con cualquier capitalización (HTTP/2 las pasa a minúsculas)
    private static String getHeader(RestRequest req, String name) {
        for (String key : req.headers.keySet()) {
            if (key != null && key.equalsIgnoreCase(name)) {
                return req.headers.get(key);
            }
        }
        return null;
    }

    private static String formatIso(Date d) {
        return String.valueOf(d.year()) +
            '-' +
            String.valueOf(d.month()).leftPad(2, '0') +
            '-' +
            String.valueOf(d.day()).leftPad(2, '0');
    }

    private static void respond(RestResponse res, Integer statusCode, CheckResponse body) {
        res.statusCode = statusCode;
        res.addHeader('Content-Type', 'application/json');
        res.responseBody = Blob.valueOf(JSON.serialize(body));
    }
}
