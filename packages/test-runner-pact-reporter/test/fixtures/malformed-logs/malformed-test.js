import '../../../../../node_modules/chai/chai.js';

describe('Malformed logs', function () {
  it('handles malformed and valid logs', function () {
    // Invalid: no space separator
    console.log('[PACT-ADAPTER] FILE no-space-separator-here');

    // Invalid: malformed JSON
    console.log('[PACT-ADAPTER] FILE ./pacts/bad.json {invalid json}');

    // Valid log
    const validPact = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'user-service' },
      interactions: [
        {
          description: 'GET user data',
          providerState: '',
          request: {
            method: 'GET',
            path: '/api/users/123',
            headers: { 'content-type': 'application/json' },
          },
          response: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: { id: '123', name: 'John Doe' },
            matchingRules: {
              '$.body.id': { matchers: [{ match: 'type' }] },
              '$.body.name': { matchers: [{ match: 'type' }] },
            },
          },
        },
      ],
      metadata: {
        pactSpecification: { version: '3.0.0' },
        client: { name: 'pact-msw-adapter-wtr', version: '1.0.0' },
      },
    };

    console.log(
      `[PACT-ADAPTER] FILE ./pacts/test-consumer-user-service.json ${JSON.stringify(validPact)}`,
    );

    // More invalid logs after valid one
    console.log('[PACT-ADAPTER] FILE');
    console.log('[PACT-ADAPTER] FILE  '); // Just spaces

    chai.expect(true).to.be.true;
  });
});
