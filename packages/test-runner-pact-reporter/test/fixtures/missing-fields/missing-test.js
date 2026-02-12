import '../../../../../node_modules/chai/chai.js';
import { executeServerCommand } from '../../../../../packages/test-runner-commands/browser/commands.mjs';

describe('Missing optional fields', function () {
  it('handles Pact with minimal fields', async function () {
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

    await executeServerCommand('pact:report', pactMinimal);
    chai.expect(true).to.be.true;
  });
});
