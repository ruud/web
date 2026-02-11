import '../../../../../node_modules/chai/chai.js';

describe('Interaction merging', function () {
  it('first test logs interaction', function () {
    const pact1 = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'user-service' },
      interactions: [
        {
          description: 'GET user',
          providerState: '',
          request: {
            method: 'GET',
            path: '/api/users/1',
            headers: { 'content-type': 'application/json' },
          },
          response: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: { id: '1', name: 'User 1' },
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
      `[PACT-ADAPTER] FILE ./pacts/test-consumer-user-service.json ${JSON.stringify(pact1)}`,
    );
    chai.expect(true).to.be.true;
  });

  it('second test logs another interaction', function () {
    const pact2 = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'user-service' },
      interactions: [
        {
          description: 'POST user',
          providerState: '',
          request: {
            method: 'POST',
            path: '/api/users',
            headers: { 'content-type': 'application/json' },
            body: { name: 'New User' },
            matchingRules: {
              '$.body.name': { matchers: [{ match: 'type' }] },
            },
          },
          response: {
            status: 201,
            headers: { 'content-type': 'application/json' },
            body: { id: '2', name: 'New User' },
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
      `[PACT-ADAPTER] FILE ./pacts/test-consumer-user-service.json ${JSON.stringify(pact2)}`,
    );
    chai.expect(true).to.be.true;
  });

  it('third test logs yet another interaction', function () {
    const pact3 = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'user-service' },
      interactions: [
        {
          description: 'DELETE user',
          providerState: '',
          request: {
            method: 'DELETE',
            path: '/api/users/1',
            headers: { 'content-type': 'application/json' },
          },
          response: {
            status: 204,
            headers: {},
          },
        },
      ],
      metadata: {
        pactSpecification: { version: '3.0.0' },
        client: { name: 'pact-msw-adapter-wtr', version: '1.0.0' },
      },
    };

    console.log(
      `[PACT-ADAPTER] FILE ./pacts/test-consumer-user-service.json ${JSON.stringify(pact3)}`,
    );
    chai.expect(true).to.be.true;
  });
});
