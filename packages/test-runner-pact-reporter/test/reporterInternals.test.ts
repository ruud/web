import { expect } from 'chai';
import { getPactStore, clearPactStore, pactPlugin } from '../src/pactPlugin.js';

/**
 * Unit tests for pactPlugin internals
 * These test the store management, command handling, and deduplication logic
 */

describe('Plugin Internals', function () {
  beforeEach(function () {
    clearPactStore();
  });

  describe('getPactStore / clearPactStore', function () {
    it('returns empty Map initially', function () {
      const store = getPactStore();
      expect(store.size).to.equal(0);
    });

    it('clears the store', function () {
      const store = getPactStore();
      store.set('test-provider', {
        consumer: { name: 'test' },
        provider: { name: 'test-provider' },
        interactions: [],
        metadata: { pactSpecification: { version: '3.0.0' } },
      });
      expect(store.size).to.equal(1);

      clearPactStore();
      expect(getPactStore().size).to.equal(0);
    });
  });

  describe('executeCommand - pact:report', function () {
    it('stores a valid pact payload', function () {
      const plugin = pactPlugin();
      const pactData = {
        consumer: { name: 'test-consumer' },
        provider: { name: 'test-provider' },
        interactions: [
          {
            description: 'test interaction',
            request: { method: 'GET', path: '/test' },
            response: { status: 200 },
          },
        ],
        metadata: { pactSpecification: { version: '3.0.0' } },
      };

      const result = plugin.executeCommand({ command: 'pact:report', payload: pactData });
      expect(result).to.deep.include({
        success: true,
        provider: 'test-provider',
        interactionCount: 1,
      });

      const store = getPactStore();
      expect(store.size).to.equal(1);
      expect(store.get('test-provider')).to.deep.equal(pactData);
    });

    it('returns error for invalid payload', function () {
      const plugin = pactPlugin();

      const result = plugin.executeCommand({ command: 'pact:report', payload: null });
      expect(result).to.deep.include({ success: false });
    });

    it('returns error for payload without provider name', function () {
      const plugin = pactPlugin();

      const result = plugin.executeCommand({
        command: 'pact:report',
        payload: { consumer: { name: 'test' }, interactions: [] },
      });
      expect(result).to.deep.include({ success: false });
    });

    it('merges interactions from same provider', function () {
      const plugin = pactPlugin();

      const pact1 = {
        consumer: { name: 'test-consumer' },
        provider: { name: 'test-provider' },
        interactions: [{ description: 'interaction 1' }],
        metadata: { pactSpecification: { version: '3.0.0' } },
      };

      const pact2 = {
        consumer: { name: 'test-consumer' },
        provider: { name: 'test-provider' },
        interactions: [{ description: 'interaction 2' }],
        metadata: { pactSpecification: { version: '3.0.0' } },
      };

      plugin.executeCommand({ command: 'pact:report', payload: pact1 });
      plugin.executeCommand({ command: 'pact:report', payload: pact2 });

      const store = getPactStore();
      expect(store.size).to.equal(1);

      const merged = store.get('test-provider');
      expect(merged!.interactions).to.have.lengthOf(2);
      expect(merged!.interactions[0].description).to.equal('interaction 1');
      expect(merged!.interactions[1].description).to.equal('interaction 2');
    });

    it('stores pacts for different providers separately', function () {
      const plugin = pactPlugin();

      const pact1 = {
        consumer: { name: 'test-consumer' },
        provider: { name: 'provider-a' },
        interactions: [{ description: 'interaction a' }],
        metadata: { pactSpecification: { version: '3.0.0' } },
      };

      const pact2 = {
        consumer: { name: 'test-consumer' },
        provider: { name: 'provider-b' },
        interactions: [{ description: 'interaction b' }],
        metadata: { pactSpecification: { version: '3.0.0' } },
      };

      plugin.executeCommand({ command: 'pact:report', payload: pact1 });
      plugin.executeCommand({ command: 'pact:report', payload: pact2 });

      const store = getPactStore();
      expect(store.size).to.equal(2);
      expect(store.has('provider-a')).to.be.true;
      expect(store.has('provider-b')).to.be.true;
    });
  });

  describe('executeCommand - pact:clear', function () {
    it('clears the pact store', function () {
      const plugin = pactPlugin();

      // Add some data first
      plugin.executeCommand({
        command: 'pact:report',
        payload: {
          consumer: { name: 'test' },
          provider: { name: 'test-provider' },
          interactions: [{ description: 'test' }],
          metadata: { pactSpecification: { version: '3.0.0' } },
        },
      });
      expect(getPactStore().size).to.equal(1);

      const result = plugin.executeCommand({ command: 'pact:clear' });
      expect(result).to.deep.equal({ success: true });
      expect(getPactStore().size).to.equal(0);
    });
  });

  describe('executeCommand - unknown command', function () {
    it('returns undefined for unknown commands', function () {
      const plugin = pactPlugin();
      const result = plugin.executeCommand({ command: 'unknown:command' });
      expect(result).to.be.undefined;
    });
  });

  describe('Deduplication logic', function () {
    it('stores raw interactions (deduplication happens at write time)', function () {
      const plugin = pactPlugin();

      const pact = {
        consumer: { name: 'test-consumer' },
        provider: { name: 'test-provider' },
        interactions: [
          {
            description: 'GET user first',
            request: { method: 'GET', path: '/api/users/1' },
            response: { status: 200 },
          },
          {
            description: 'POST user',
            request: { method: 'POST', path: '/api/users', body: { name: 'Test' } },
            response: { status: 201 },
          },
          {
            description: 'GET user duplicate',
            request: { method: 'GET', path: '/api/users/1' },
            response: { status: 200 },
          },
          {
            description: 'DELETE user',
            request: { method: 'DELETE', path: '/api/users/1' },
            response: { status: 204 },
          },
          {
            description: 'POST user duplicate',
            request: { method: 'POST', path: '/api/users', body: { name: 'Test' } },
            response: { status: 201 },
          },
        ],
        metadata: { pactSpecification: { version: '3.0.0' } },
      };

      plugin.executeCommand({ command: 'pact:report', payload: pact });

      const store = getPactStore();
      expect(store.get('test-provider')!.interactions).to.have.lengthOf(5);
    });

    it('handles empty interactions array', function () {
      const plugin = pactPlugin();

      const pact = {
        consumer: { name: 'test-consumer' },
        provider: { name: 'test-provider' },
        interactions: [],
        metadata: { pactSpecification: { version: '3.0.0' } },
      };

      const result = plugin.executeCommand({ command: 'pact:report', payload: pact });
      expect(result).to.deep.include({ success: true, interactionCount: 0 });
    });
  });
});
