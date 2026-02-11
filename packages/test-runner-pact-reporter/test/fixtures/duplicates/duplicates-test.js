import '../../../../../node_modules/chai/chai.js';

describe('Duplicate interactions', function () {
  it('logs same interaction multiple times', function () {
    const pactData1 = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'user-service' },
      interactions: [
        {
          description: 'GET user by ID',
          providerState: '',
          request: {
            method: 'GET',
            path: '/api/users/1',
            headers: { 'content-type': 'application/json' },
          },
          response: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: { id: '1', name: 'First Call' },
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
      `[PACT-ADAPTER] FILE ./pacts/test-consumer-user-service.json ${JSON.stringify(pactData1)}`,
    );

    chai.expect(true).to.be.true;
  });

  it('logs duplicate interaction again', function () {
    const pactData2 = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'user-service' },
      interactions: [
        {
          description: 'GET user by ID',
          providerState: '',
          request: {
            method: 'GET',
            path: '/api/users/1',
            headers: { 'content-type': 'application/json' },
          },
          response: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: { id: '1', name: 'Second Call' },
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
      `[PACT-ADAPTER] FILE ./pacts/test-consumer-user-service.json ${JSON.stringify(pactData2)}`,
    );

    chai.expect(true).to.be.true;
  });

  it('logs unique interaction', function () {
    const pactData3 = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'user-service' },
      interactions: [
        {
          description: 'POST create user',
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
      `[PACT-ADAPTER] FILE ./pacts/test-consumer-user-service.json ${JSON.stringify(pactData3)}`,
    );

    chai.expect(true).to.be.true;
  });
});
