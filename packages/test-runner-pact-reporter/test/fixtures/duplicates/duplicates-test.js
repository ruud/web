import '../../../../../node_modules/chai/chai.js';
import { executeServerCommand } from '../../../../../packages/test-runner-commands/browser/commands.mjs';

describe('Duplicate interactions', function () {
  it('logs same interaction multiple times', async function () {
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

    await executeServerCommand('pact:report', pactData1);

    chai.expect(true).to.be.true;
  });

  it('logs duplicate interaction again', async function () {
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

    await executeServerCommand('pact:report', pactData2);

    chai.expect(true).to.be.true;
  });

  it('logs unique interaction', async function () {
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

    await executeServerCommand('pact:report', pactData3);

    chai.expect(true).to.be.true;
  });
});
