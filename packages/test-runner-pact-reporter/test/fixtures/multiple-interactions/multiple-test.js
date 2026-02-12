import '../../../../../node_modules/chai/chai.js';
import { executeServerCommand } from '../../../../../packages/test-runner-commands/browser/commands.mjs';

describe('User Service - Multiple Interactions', function () {
  it('fetches user list', async function () {
    const pactFile = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'user-service' },
      interactions: [
        {
          description: 'GET request for user list',
          providerState: '',
          request: {
            method: 'GET',
            path: '/api/users',
            headers: { 'content-type': 'application/json' },
          },
          response: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: [
              { id: '1', name: 'User 1' },
              { id: '2', name: 'User 2' },
            ],
            matchingRules: {
              '$.body': { matchers: [{ match: 'type', min: 0 }] },
              '$.body[*].id': { matchers: [{ match: 'type' }] },
              '$.body[*].name': { matchers: [{ match: 'type' }] },
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

  it('creates new user', async function () {
    const pactFile = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'user-service' },
      interactions: [
        {
          description: 'POST request to create user',
          providerState: '',
          request: {
            method: 'POST',
            path: '/api/users',
            headers: { 'content-type': 'application/json' },
            body: {
              name: 'New User',
              email: 'new@example.com',
            },
            matchingRules: {
              '$.body.name': { matchers: [{ match: 'type' }] },
              '$.body.email': {
                matchers: [
                  { match: 'regex', regex: '^[\\w.+-]+@[\\w.-]+\\.[a-zA-Z]{2,}$' },
                ],
              },
            },
          },
          response: {
            status: 201,
            headers: { 'content-type': 'application/json' },
            body: {
              id: '456',
              name: 'New User',
              email: 'new@example.com',
            },
            matchingRules: {
              '$.body.id': { matchers: [{ match: 'type' }] },
              '$.body.name': { matchers: [{ match: 'type' }] },
              '$.body.email': {
                matchers: [
                  { match: 'regex', regex: '^[\\w.+-]+@[\\w.-]+\\.[a-zA-Z]{2,}$' },
                ],
              },
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
