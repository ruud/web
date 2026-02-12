/**
* Generic Pact Contract Reporter for Web Test Runner
*
* This reporter captures Pact contract files from MSW adapter
* during story tests and writes them to disk.
*
* The adapter logs pacts in format:
*   [PACT-ADAPTER] FILE <filepath> <json>
*
* Usage in web-test-runner.stories.config.mjs:
*   import { pactReporter } from './test/reporters/pact-reporter.mjs';
*   reporters: [
*     defaultReporter({ reportTestResults: true, reportTestProgress: true }),
*     pactReporter({ outputDir: 'pacts' }),
*   ],
*/

import fs from 'fs';
import path from 'path';

/**
 * @typedef {Object} PactReporterOptions
 * @property {string} [outputDir='pacts'] - Directory to write Pact files
 * @property {boolean} [verbose=false] - Enable verbose logging
 */

const LOG_PREFIX = '[PACT-ADAPTER]';

/**
 * Extract all string values from various log formats
 * WTR logs can come in different shapes
 * @param {*} log
 * @returns {string[]}
 */
function extractLogStrings(log) {
  const strings = [];

  if (log && typeof log === 'object') {
    // Check for array-like object with numeric keys
    if (log[0] !== undefined) {
      for (let i = 0; log[i] !== undefined; i++) {
        if (typeof log[i] === 'string') {
          strings.push(log[i]);
        }
      }
    } else if (Array.isArray(log.args)) {
      strings.push(...log.args.filter(a => typeof a === 'string'));
    } else if (log.message !== undefined) {
      strings.push(String(log.message));
    } else if (log.text !== undefined) {
      strings.push(String(log.text));
    }
  } else if (Array.isArray(log)) {
    strings.push(...log.filter(a => typeof a === 'string'));
  } else if (typeof log === 'string') {
    strings.push(log);
  }

  return strings;
}

/**
 * Deduplicate interactions by method + path
 * @param {Array} interactions
 * @returns {Array} Deduplicated interactions
 */
function deduplicateInteractions(interactions) {
  const seen = new Map();

  for (const interaction of interactions) {
    const key = `${interaction.request?.method} ${interaction.request?.path}`;

    // Keep the most recent interaction for each key
    // Or merge if they have different request bodies
    if (!seen.has(key)) {
      seen.set(key, interaction);
    } else {
      // Check if request bodies differ - if so, create unique key
      const existing = seen.get(key);
      const existingBody = JSON.stringify(existing.request?.body);
      const newBody = JSON.stringify(interaction.request?.body);

      if (existingBody !== newBody) {
        const uniqueKey = `${key}-${seen.size}`;
        seen.set(uniqueKey, interaction);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Creates a Pact contract reporter for Web Test Runner
 * @param {PactReporterOptions} options
 * @returns {import('@web/test-runner').Reporter}
 */
export function pactReporter({
  outputDir = 'pacts',
  verbose = process.env.PACT_REPORTER_VERBOSE === 'true',
} = {}) {
  // Store for captured pact files from all sessions
  // Key: provider name, Value: pact file object
  const pactFiles = new Map();

  return {
    /**
     * Called once when the test runner starts.
     */
    start() {
      if (verbose) {
        // eslint-disable-next-line no-console
        console.log('\n📝 Pact Reporter initialized');
        // eslint-disable-next-line no-console
        console.log(`   Output directory: ${outputDir}`);
        // eslint-disable-next-line no-console
        console.log('   Using pact-msw-adapter');
      }

      // Ensure output directory exists
      const fullOutputDir = path.resolve(process.cwd(), outputDir);
      if (!fs.existsSync(fullOutputDir)) {
        fs.mkdirSync(fullOutputDir, { recursive: true });
      }
    },

    /**
     * Called once when the test runner stops.
     */
    stop() {
      if (pactFiles.size === 0) {
        if (verbose) {
          // eslint-disable-next-line no-console
          console.log('\n📝 No Pact files captured');
        }
        return;
      }

      const fullOutputDir = path.resolve(process.cwd(), outputDir);

      // eslint-disable-next-line no-console
      console.log('\n📝 Pact Contracts Generated');
      // eslint-disable-next-line no-console
      console.log('═'.repeat(50));

      for (const [, pactFile] of pactFiles) {
        const filename = `${pactFile.consumer.name}-${pactFile.provider.name}.json`;
        const filepath = path.join(fullOutputDir, filename);

        // Deduplicate interactions within the pact file
        const uniqueInteractions = deduplicateInteractions(pactFile.interactions);
        pactFile.interactions = uniqueInteractions;

        fs.writeFileSync(filepath, JSON.stringify(pactFile, null, 2));

        // eslint-disable-next-line no-console
        console.log(`   ✅ ${filename}`);
        // eslint-disable-next-line no-console
        console.log(`      Interactions: ${uniqueInteractions.length}`);
      }

      // eslint-disable-next-line no-console
      console.log('\n');
    },

    /**
     * Called when a test run starts.
     */
    onTestRunStarted() {
      // Clear pact files for new test run
      pactFiles.clear();
    },

    /**
     * Called when results for a test file can be reported.
     */
    async reportTestFileResults({ sessionsForTestFile }) {
      for (const session of sessionsForTestFile) {
        // Parse browser logs for Pact file output
        if (session.logs && Array.isArray(session.logs)) {
          for (const log of session.logs) {
            const logStrings = extractLogStrings(log);

            for (const logStr of logStrings) {
              if (logStr.includes(LOG_PREFIX) && logStr.includes('FILE')) {
                try {
                  // Format: "[PACT-ADAPTER] FILE <filepath> <json>"
                  const match = logStr.match(/\[PACT-ADAPTER\]\s*FILE\s+(\S+)\s+(\{[\s\S]*\})$/);
                  if (match) {
                    const [, , jsonStr] = match;
                    const pactFile = JSON.parse(jsonStr);
                    const provider = pactFile.provider?.name || 'unknown';

                    // Merge with existing pact file for this provider
                    if (pactFiles.has(provider)) {
                      const existing = pactFiles.get(provider);
                      existing.interactions.push(...pactFile.interactions);
                    } else {
                      pactFiles.set(provider, pactFile);
                    }

                    if (verbose) {
                      // eslint-disable-next-line no-console
                      console.log(`   📝 Captured pact for provider: ${provider}`);
                    }
                  }
                } catch (e) {
                  if (verbose) {
                    // eslint-disable-next-line no-console
                    console.log(`   ⚠️ Failed to parse pact file: ${e.message}`);
                  }
                }
              }
            }
          }
        }
      }

      if (verbose) {
        // eslint-disable-next-line no-console
        console.log(`   📝 Total providers: ${pactFiles.size}`);
      }
    },

    /**
     * Called when test progress should be rendered.
     */
    getTestProgress() {
      const totalInteractions = Array.from(pactFiles.values()).reduce(
        (sum, pact) => sum + (pact.interactions?.length || 0),
        0
      );
      return `📝 Pact providers: ${pactFiles.size}, interactions: ${totalInteractions}`;
    },
  };
}
