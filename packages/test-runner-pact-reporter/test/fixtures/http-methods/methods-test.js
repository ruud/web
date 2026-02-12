import '../../../../../node_modules/chai/chai.js';
import { executeServerCommand } from '../../../../../packages/test-runner-commands/browser/commands.mjs';

describe('HTTP Methods', function () {
  it('handles various HTTP methods', async function () {
    const pactFile = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'user-service' },
      interactions: [
        {
          description: 'DELETE user',
          providerState: '',
          request: {
            method: 'DELETE',
            path: '/api/users/5',
            headers: { 'content-type': 'application/json' },
          },
          response: {
            status: 204,
            headers: {},
          },
        },
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
            body: { id: '1', name: 'Alice' },
            matchingRules: {
              '$.body.id': { matchers: [{ match: 'type' }] },
              '$.body.name': { matchers: [{ match: 'type' }] },
            },
          },
        },
        {
          description: 'PATCH user',
          providerState: '',
          request: {
            method: 'PATCH',
            path: '/api/users/3',
            headers: { 'content-type': 'application/json' },
            body: { name: 'Updated Name' },
            matchingRules: {
              '$.body.name': { matchers: [{ match: 'type' }] },
            },
          },
          response: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: { id: '3', name: 'Updated Name' },
            matchingRules: {
              '$.body.id': { matchers: [{ match: 'type' }] },
              '$.body.name': { matchers: [{ match: 'type' }] },
            },
          },
        },
        {
          description: 'POST create user',
          providerState: '',
          request: {
            method: 'POST',
            path: '/api/users',
            headers: { 'content-type': 'application/json' },
            body: { name: 'Bob', email: 'bob@example.com' },
            matchingRules: {
              '$.body.name': { matchers: [{ match: 'type' }] },
              '$.body.email': { matchers: [{ match: 'regex', regex: '^[\\w.+-]+@[\\w.-]+\\.[a-zA-Z]{2,}$' }] },
            },
          },
          response: {
            status: 201,
            headers: { 'content-type': 'application/json' },
            body: { id: '2', name: 'Bob', email: 'bob@example.com' },
            matchingRules: {
              '$.body.id': { matchers: [{ match: 'type' }] },
              '$.body.name': { matchers: [{ match: 'type' }] },
              '$.body.email': { matchers: [{ match: 'regex', regex: '^[\\w.+-]+@[\\w.-]+\\.[a-zA-Z]{2,}$' }] },
            },
          },
        },
        {
          description: 'PUT update user',
          providerState: '',
          request: {
            method: 'PUT',
            path: '/api/users/1',
            headers: { 'content-type': 'application/json' },
            body: { name: 'Alice Updated', email: 'alice@example.com' },
            matchingRules: {
              '$.body.name': { matchers: [{ match: 'type' }] },
              '$.body.email': { matchers: [{ match: 'regex', regex: '^[\\w.+-]+@[\\w.-]+\\.[a-zA-Z]{2,}$' }] },
            },
          },
          response: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: { id: '1', name: 'Alice Updated', email: 'alice@example.com' },
            matchingRules: {
              '$.body.id': { matchers: [{ match: 'type' }] },
              '$.body.name': { matchers: [{ match: 'type' }] },
              '$.body.email': { matchers: [{ match: 'regex', regex: '^[\\w.+-]+@[\\w.-]+\\.[a-zA-Z]{2,}$' }] },
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
