import { expect } from 'chai';

/**
 * Unit tests for reporter internal functions
 * These test the parsing and file writing logic in isolation
 */

// Mock TestSession interface for testing
interface TestSession {
  logs?: any[][];
}

// Copy of the internal parsing function for testing
function parsePactFilesFromLogs(
  sessions: TestSession[],
  debug: boolean,
): Map<string, any> {
  const pactFiles = new Map<string, any>();
  const PACT_LOG_PREFIX = '[PACT-ADAPTER] FILE ';

  for (const session of sessions) {
    if (!session.logs || session.logs.length === 0) {
      continue;
    }

    for (const logEntries of session.logs) {
      for (const logEntry of logEntries) {
        if (typeof logEntry !== 'string') {
          continue;
        }

        if (logEntry.startsWith(PACT_LOG_PREFIX)) {
          try {
            const content = logEntry.slice(PACT_LOG_PREFIX.length);
            const firstSpace = content.indexOf(' ');

            if (firstSpace === -1) {
              if (debug) {
                console.warn('[PACT-REPORTER] Invalid Pact log format:', logEntry);
              }
              continue;
            }

            const filepath = content.slice(0, firstSpace);
            const jsonStr = content.slice(firstSpace + 1);
            const pactData = JSON.parse(jsonStr);

            if (pactFiles.has(filepath)) {
              const existing = pactFiles.get(filepath)!;
              existing.interactions.push(...pactData.interactions);
            } else {
              pactFiles.set(filepath, pactData);
            }

            if (debug) {
              console.log(
                `[PACT-REPORTER] Parsed Pact: ${filepath} (${pactData.interactions.length} interactions)`,
              );
            }
          } catch (error) {
            if (debug) {
              console.error('[PACT-REPORTER] Error parsing Pact log:', error, logEntry);
            }
          }
        }
      }
    }
  }

  return pactFiles;
}

describe('Reporter Internals', function () {
  describe('parsePactFilesFromLogs', function () {
    it('returns empty Map for empty sessions array', function () {
      const result = parsePactFilesFromLogs([], false);
      expect(result.size).to.equal(0);
    });

    it('returns empty Map for sessions with no logs', function () {
      const sessions = [
        { logs: [] } as TestSession,
        { logs: undefined } as any,
      ];
      const result = parsePactFilesFromLogs(sessions, false);
      expect(result.size).to.equal(0);
    });

    it('parses valid Pact log message', function () {
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
        metadata: {
          pactSpecification: { version: '3.0.0' },
        },
      };

      const sessions = [
        {
          logs: [
            [
              `[PACT-ADAPTER] FILE ./pacts/test-consumer-test-provider.json ${JSON.stringify(pactData)}`,
            ],
          ],
        } as any,
      ];

      const result = parsePactFilesFromLogs(sessions, false);
      expect(result.size).to.equal(1);
      expect(result.get('./pacts/test-consumer-test-provider.json')).to.deep.equal(pactData);
    });

    it('ignores non-string log entries', function () {
      const sessions = [
        {
          logs: [[123, null, undefined, { foo: 'bar' }]],
        } as any,
      ];

      const result = parsePactFilesFromLogs(sessions, false);
      expect(result.size).to.equal(0);
    });

    it('ignores logs without PACT-ADAPTER prefix', function () {
      const sessions = [
        {
          logs: [
            [
              'Regular log message',
              'console.log output',
              '[OTHER-PREFIX] Some other message',
            ],
          ],
        } as any,
      ];

      const result = parsePactFilesFromLogs(sessions, false);
      expect(result.size).to.equal(0);
    });

    it('skips malformed log messages (no space separator)', function () {
      const sessions = [
        {
          logs: [['[PACT-ADAPTER] FILE no-space-here']],
        } as any,
      ];

      const result = parsePactFilesFromLogs(sessions, false);
      expect(result.size).to.equal(0);
    });

    it('skips logs with invalid JSON', function () {
      const sessions = [
        {
          logs: [['[PACT-ADAPTER] FILE ./pacts/test.json {invalid json}']],
        } as any,
      ];

      const result = parsePactFilesFromLogs(sessions, false);
      expect(result.size).to.equal(0);
    });

    it('merges interactions from same filepath', function () {
      const pactData1 = {
        consumer: { name: 'test-consumer' },
        provider: { name: 'test-provider' },
        interactions: [{ description: 'interaction 1' }],
        metadata: { pactSpecification: { version: '3.0.0' } },
      };

      const pactData2 = {
        consumer: { name: 'test-consumer' },
        provider: { name: 'test-provider' },
        interactions: [{ description: 'interaction 2' }],
        metadata: { pactSpecification: { version: '3.0.0' } },
      };

      const sessions = [
        {
          logs: [
            [
              `[PACT-ADAPTER] FILE ./pacts/test.json ${JSON.stringify(pactData1)}`,
              `[PACT-ADAPTER] FILE ./pacts/test.json ${JSON.stringify(pactData2)}`,
            ],
          ],
        } as any,
      ];

      const result = parsePactFilesFromLogs(sessions, false);
      expect(result.size).to.equal(1);

      const merged = result.get('./pacts/test.json');
      expect(merged.interactions).to.have.lengthOf(2);
      expect(merged.interactions[0].description).to.equal('interaction 1');
      expect(merged.interactions[1].description).to.equal('interaction 2');
    });

    it('handles multiple sessions', function () {
      const pactData = {
        consumer: { name: 'test-consumer' },
        provider: { name: 'test-provider' },
        interactions: [{ description: 'test' }],
        metadata: { pactSpecification: { version: '3.0.0' } },
      };

      const sessions = [
        {
          logs: [[`[PACT-ADAPTER] FILE ./pacts/test1.json ${JSON.stringify(pactData)}`]],
        } as any,
        {
          logs: [[`[PACT-ADAPTER] FILE ./pacts/test2.json ${JSON.stringify(pactData)}`]],
        } as any,
      ];

      const result = parsePactFilesFromLogs(sessions, false);
      expect(result.size).to.equal(2);
      expect(result.has('./pacts/test1.json')).to.be.true;
      expect(result.has('./pacts/test2.json')).to.be.true;
    });

    it('handles multiple log entries in nested arrays', function () {
      const pactData = {
        consumer: { name: 'test-consumer' },
        provider: { name: 'test-provider' },
        interactions: [{ description: 'test' }],
        metadata: { pactSpecification: { version: '3.0.0' } },
      };

      const sessions = [
        {
          logs: [
            [`[PACT-ADAPTER] FILE ./pacts/test1.json ${JSON.stringify(pactData)}`],
            [`[PACT-ADAPTER] FILE ./pacts/test2.json ${JSON.stringify(pactData)}`],
          ],
        } as any,
      ];

      const result = parsePactFilesFromLogs(sessions, false);
      expect(result.size).to.equal(2);
    });

    it('handles mixed valid and invalid logs', function () {
      const validPact = {
        consumer: { name: 'test-consumer' },
        provider: { name: 'test-provider' },
        interactions: [{ description: 'valid' }],
        metadata: { pactSpecification: { version: '3.0.0' } },
      };

      const sessions = [
        {
          logs: [
            [
              'Regular log',
              `[PACT-ADAPTER] FILE ./pacts/valid.json ${JSON.stringify(validPact)}`,
              '[PACT-ADAPTER] FILE invalid-format',
              'Another regular log',
              '[PACT-ADAPTER] FILE ./pacts/bad.json {invalid json}',
            ],
          ],
        } as any,
      ];

      const result = parsePactFilesFromLogs(sessions, false);
      expect(result.size).to.equal(1);
      expect(result.has('./pacts/valid.json')).to.be.true;
    });
  });

  describe('Deduplication logic', function () {
    it('removes duplicate interactions by description', function () {
      const interactions = [
        { description: 'GET user', request: {}, response: {} },
        { description: 'POST user', request: {}, response: {} },
        { description: 'GET user', request: {}, response: {} }, // Duplicate
        { description: 'DELETE user', request: {}, response: {} },
        { description: 'POST user', request: {}, response: {} }, // Duplicate
      ];

      // Simulate deduplication logic from pactReporter.ts
      const uniqueInteractions = Array.from(
        new Map(interactions.map(i => [i.description, i])).values(),
      );

      expect(uniqueInteractions).to.have.lengthOf(3);
      expect(uniqueInteractions.map(i => i.description)).to.deep.equal([
        'GET user',
        'POST user',
        'DELETE user',
      ]);
    });

    it('keeps last occurrence of duplicate', function () {
      const interactions = [
        { description: 'test', value: 'first' },
        { description: 'test', value: 'second' },
        { description: 'test', value: 'third' },
      ];

      const uniqueInteractions = Array.from(
        new Map(interactions.map(i => [i.description, i])).values(),
      );

      expect(uniqueInteractions).to.have.lengthOf(1);
      expect(uniqueInteractions[0].value).to.equal('third');
    });

    it('handles empty interactions array', function () {
      const interactions: any[] = [];

      const uniqueInteractions = Array.from(
        new Map(interactions.map(i => [i.description, i])).values(),
      );

      expect(uniqueInteractions).to.have.lengthOf(0);
    });
  });
});
