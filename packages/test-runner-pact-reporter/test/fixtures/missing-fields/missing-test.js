import '../../../../../node_modules/chai/chai.js';

describe('Missing optional fields', function () {
  it('handles Pact with minimal fields', function () {
    const pactMinimal = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'user-service' },
      interactions: [
        {
          description: 'GET without query or body',
          providerState: '',
          request: {
            method: 'GET',
            path: '/api/status',
            headers: {},
          },
          response: {
            status: 200,
            headers: {},
          },
        },
      ],
      metadata: {
        pactSpecification: { version: '3.0.0' },
      },
    };

    console.log(
      `[PACT-ADAPTER] FILE ./pacts/test-consumer-user-service.json ${JSON.stringify(pactMinimal)}`,
    );
    chai.expect(true).to.be.true;
  });
});
