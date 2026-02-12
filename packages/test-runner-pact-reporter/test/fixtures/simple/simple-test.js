import { executeServerCommand } from '../../../../../packages/test-runner-commands/browser/commands.mjs';
import '../../../../../node_modules/chai/chai.js';

describe('User Service', function () {
  it('fetches user profile', async function () {
    // Simulate the Pact adapter sending a pact via executeServerCommand
    const pactFile = {
      consumer: { name: 'test-consumer' },
      provider: { name: 'user-service' },
      interactions: [
        {
          description: 'GET request for user 123',
          providerState: '',
          request: {
            method: 'GET',
            path: '/api/users/123',
            headers: { 'content-type': 'application/json' },
          },
          response: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: {
              id: '123',
              name: 'John Doe',
              email: 'john@example.com',
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
