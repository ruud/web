import '../../../../../node_modules/chai/chai.js';
import { executeServerCommand } from '../../../../../packages/test-runner-commands/browser/commands.mjs';

describe('Multiple Providers', function () {
  it('fetches user from user-service', async function () {
    const pactFile = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'user-service' },
      interactions: [
        {
          description: 'GET user by ID',
          providerState: '',
          request: {
            method: 'GET',
            path: '/api/users/789',
            headers: { 'content-type': 'application/json' },
          },
          response: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: {
              id: '789',
              name: 'Alice',
            },
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

    await executeServerCommand('pact:report', pactFile);

    chai.expect(true).to.be.true;
  });

  it('fetches products from product-service', async function () {
    const pactFile = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'product-service' },
      interactions: [
        {
          description: 'GET products list',
          providerState: '',
          request: {
            method: 'GET',
            path: '/api/products',
            headers: { 'content-type': 'application/json' },
          },
          response: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: [
              { id: 'prod-1', name: 'Product 1', price: 99.99 },
              { id: 'prod-2', name: 'Product 2', price: 149.99 },
            ],
            matchingRules: {
              '$.body': { matchers: [{ match: 'type', min: 0 }] },
              '$.body[*].id': { matchers: [{ match: 'type' }] },
              '$.body[*].name': { matchers: [{ match: 'type' }] },
              '$.body[*].price': { matchers: [{ match: 'decimal' }] },
            },
          },
        },
      ],
      metadata: {
        pactSpecification: { version: '3.0.0' },
        client: { name: 'pact-msw-adapter-wtr', version: '1.0.0' },
      },
    };

    await executeServerCommand('pact:report', pactFile);

    chai.expect(true).to.be.true;
  });
});
