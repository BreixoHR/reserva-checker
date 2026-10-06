@IsTest
private class ReservaCheckerApiTest {
    private static final String API_KEY = 'test-api-key';

    @TestSetup
    static void setup() {
        insert new List<Booking__c>{
            new Booking__c(Booking_Reference__c = 'ABC-123', Visit_Date__c = Date.newInstance(2026, 10, 15)),
            new Booking__c(Booking_Reference__c = 'NODATE-1')
        };
    }

    private static Map<String, Object> call(String apiKey, String body) {
        ReservaCheckerApi.apiKeyHashOverride = ReservaCheckerApi.sha256Hex(API_KEY);

        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/reserva-checker/v3';
        req.httpMethod = 'POST';
        if (apiKey != null) {
            req.addHeader('X-Api-Key', apiKey);
        }
        req.requestBody = Blob.valueOf(body);
        RestContext.request = req;
        RestContext.response = new RestResponse();

        ReservaCheckerApi.handlePost();

        Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(
            RestContext.response.responseBody.toString()
        );
        result.put('httpStatus', RestContext.response.statusCode);
        return result;
    }

    private static Booking__c booking(String reference) {
        return [
            SELECT Verification_Status__c, Last_Verification__c, Last_Verification_Site__c
            FROM Booking__c
            WHERE Booking_Reference__c = :reference
        ];
    }

    @IsTest
    static void verifyMatchingDate() {
        Test.startTest();
        Map<String, Object> r = call(
            API_KEY,
            '{"action":"verify","bookingReference":"abc-123","visitDate":"2026-10-15","site":"demo"}'
        );
        Test.stopTest();

        Assert.areEqual(200, r.get('httpStatus'));
        Assert.areEqual('ok', r.get('status'));
        Assert.areEqual('2026-10-15', r.get('bookingDate'));
        Booking__c b = booking('ABC-123');
        Assert.areEqual('Verified', b.Verification_Status__c);
        Assert.areEqual('demo', b.Last_Verification_Site__c);
        Assert.isNotNull(b.Last_Verification__c);
    }

    @IsTest
    static void verifyDifferentDate() {
        Map<String, Object> r = call(
            API_KEY,
            '{"action":"verify","bookingReference":"ABC-123","visitDate":"2026-10-16"}'
        );

        Assert.areEqual(200, r.get('httpStatus'));
        Assert.areEqual('mismatch', r.get('status'));
        Assert.areEqual('2026-10-15', r.get('bookingDate'));
        Assert.areEqual('Mismatch', booking('ABC-123').Verification_Status__c);
    }

    @IsTest
    static void bookingWithoutDateIsMismatch() {
        Map<String, Object> r = call(
            API_KEY,
            '{"action":"verify","bookingReference":"NODATE-1","visitDate":"2026-10-16"}'
        );
        Assert.areEqual('mismatch', r.get('status'));
        Assert.isNull(r.get('bookingDate'));
    }

    @IsTest
    static void cancelMarksBooking() {
        Map<String, Object> r = call(API_KEY, '{"action":"cancel","bookingReference":"ABC-123"}');

        Assert.areEqual('ok', r.get('status'));
        Assert.areEqual('Cancelled', booking('ABC-123').Verification_Status__c);
    }

    @IsTest
    static void unknownReferenceReturns404() {
        Map<String, Object> r = call(
            API_KEY,
            '{"action":"verify","bookingReference":"NOPE-999","visitDate":"2026-10-15"}'
        );
        Assert.areEqual(404, r.get('httpStatus'));
        Assert.areEqual('not_found', r.get('status'));
    }

    @IsTest
    static void wrongOrMissingApiKeyReturns401() {
        String body = '{"action":"verify","bookingReference":"ABC-123","visitDate":"2026-10-15"}';
        Assert.areEqual(401, call('otra-clave', body).get('httpStatus'));
        Assert.areEqual(401, call(null, body).get('httpStatus'));
        Assert.isNull(booking('ABC-123').Verification_Status__c, 'Sin autorización no se modifica nada');
    }

    @IsTest
    static void invalidInputReturns400() {
        List<String> bodies = new List<String>{
            'esto no es json',
            '{"action":"delete","bookingReference":"ABC-123"}',
            '{"action":"verify","bookingReference":"x","visitDate":"2026-10-15"}',
            '{"action":"verify","bookingReference":"ABC-123\' OR Name != \'","visitDate":"2026-10-15"}',
            '{"action":"verify","bookingReference":"ABC-123","visitDate":"15/10/2026"}',
            '{"action":"verify","bookingReference":"ABC-123","visitDate":"2026-02-31"}',
            '{"action":"verify","bookingReference":"ABC-123"}'
        };
        for (String body : bodies) {
            Map<String, Object> r = call(API_KEY, body);
            Assert.areEqual(400, r.get('httpStatus'), body);
            Assert.areEqual('error', r.get('status'), body);
        }
    }
}
