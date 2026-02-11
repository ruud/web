import '../../../../../node_modules/chai/chai.js';

describe('Request/Response Variations', function () {
  it('handles query parameters', function () {
    const pactFile = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'search-service' },
      interactions: [
        {
          description: 'GET search with query params',
          providerState: '',
          request: {
            method: 'GET',
            path: '/api/search',
            query: 'q=test&limit=10&offset=0',
            headers: { 'content-type': 'application/json' },
          },
          response: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: {
              results: [{ id: '1', title: 'Test Result' }],
              total: 1,
            },
            matchingRules: {
              '$.body.results': { matchers: [{ match: 'type', min: 0 }] },
              '$.body.results[*].id': { matchers: [{ match: 'type' }] },
              '$.body.results[*].title': { matchers: [{ match: 'type' }] },
              '$.body.total': { matchers: [{ match: 'integer' }] },
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
      `[PACT-ADAPTER] FILE ./pacts/test-consumer-search-service.json ${JSON.stringify(pactFile)}`,
    );

    chai.expect(true).to.be.true;
  });

  it('handles error responses', function () {
    const pactFile = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'error-service' },
      interactions: [
        {
          description: 'GET 404 not found',
          providerState: '',
          request: {
            method: 'GET',
            path: '/api/users/999',
            headers: { 'content-type': 'application/json' },
          },
          response: {
            status: 404,
            headers: { 'content-type': 'application/json' },
            body: {
              error: 'User not found',
              code: 'USER_NOT_FOUND',
            },
            matchingRules: {
              '$.body.error': { matchers: [{ match: 'type' }] },
              '$.body.code': { matchers: [{ match: 'type' }] },
            },
          },
        },
        {
          description: 'POST 500 server error',
          providerState: '',
          request: {
            method: 'POST',
            path: '/api/users',
            headers: { 'content-type': 'application/json' },
            body: { name: 'Test' },
            matchingRules: {
              '$.body.name': { matchers: [{ match: 'type' }] },
            },
          },
          response: {
            status: 500,
            headers: { 'content-type': 'application/json' },
            body: {
              error: 'Internal server error',
              code: 'INTERNAL_ERROR',
            },
            matchingRules: {
              '$.body.error': { matchers: [{ match: 'type' }] },
              '$.body.code': { matchers: [{ match: 'type' }] },
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
      `[PACT-ADAPTER] FILE ./pacts/test-consumer-error-service.json ${JSON.stringify(pactFile)}`,
    );

    chai.expect(true).to.be.true;
  });

  it('handles nested objects', function () {
    const pactFile = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'user-service' },
      interactions: [
        {
          description: 'GET user with nested profile',
          providerState: '',
          request: {
            method: 'GET',
            path: '/api/users/1/profile',
            headers: { 'content-type': 'application/json' },
          },
          response: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: {
              id: '1',
              profile: {
                firstName: 'John',
                lastName: 'Doe',
                address: {
                  street: '123 Main St',
                  city: 'Springfield',
                  zipCode: '12345',
                },
                preferences: {
                  theme: 'dark',
                  notifications: true,
                },
              },
            },
            matchingRules: {
              '$.body.id': { matchers: [{ match: 'type' }] },
              '$.body.profile.firstName': { matchers: [{ match: 'type' }] },
              '$.body.profile.lastName': { matchers: [{ match: 'type' }] },
              '$.body.profile.address.street': { matchers: [{ match: 'type' }] },
              '$.body.profile.address.city': { matchers: [{ match: 'type' }] },
              '$.body.profile.address.zipCode': { matchers: [{ match: 'type' }] },
              '$.body.profile.preferences.theme': { matchers: [{ match: 'type' }] },
              '$.body.profile.preferences.notifications': { matchers: [{ match: 'type' }] },
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
      `[PACT-ADAPTER] FILE ./pacts/test-consumer-user-service.json ${JSON.stringify(pactFile)}`,
    );

    chai.expect(true).to.be.true;
  });
});
