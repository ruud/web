/**
 * Pact Web Test Runner Plugin
 *
 * Generates Pact contract files from Storybook stories by capturing MSW mocked
 * API interactions during story play function execution.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                        PACT CONTRACT GENERATION ARCHITECTURE                │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 *  ┌─────────────────────────── BROWSER (Chromium) ───────────────────────────┐
 *  │                                                                          │
 *  │  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
 *  │  │  Storybook Story │───▶│   MSW Worker     │───▶│  pact-msw-adapter│   │
 *  │  │  (play function) │    │  (intercepts API)│    │  -setup.js       │   │
 *  │  └──────────────────┘    └──────────────────┘    └────────┬─────────┘   │
 *  │                                                           │             │
 *  │  1. Story renders component                               │             │
 *  │  2. Play function triggers API calls                      │             │
 *  │  3. MSW intercepts & returns mocked responses             │             │
 *  │  4. Adapter captures request/response pairs               ▼             │
 *  │                                                  ┌──────────────────┐   │
 *  │                                                  │executeServerCmd  │   │
 *  │                                                  │('pact:report',   │   │
 *  │                                                  │ pactData)        │   │
 *  └──────────────────────────────────────────────────┴────────┬─────────┴───┘
 *                                                              │
 *                              WebSocket RPC                   │
 *                              ───────────────────────────────▶│
 *                                                              │
 *  ┌─────────────────────────── NODE.JS (WTR) ────────────────┬┴────────────┐
 *  │                                                          │             │
 *  │  ┌──────────────────┐                          ┌─────────▼─────────┐   │
 *  │  │   pactPlugin()   │◀─────────────────────────│  executeCommand() │   │
 *  │  │                  │   command: 'pact:report' │  handler          │   │
 *  │  │  - Receives pact │   payload: pactData      └───────────────────┘   │
 *  │  │  - Aggregates by │                                                  │
 *  │  │    provider      │                                                  │
 *  │  │  - Stores in Map │                                                  │
 *  │  └────────┬─────────┘                                                  │
 *  │           │                                                            │
 *  │           │ pactStore (shared Map)                                     │
 *  │           ▼                                                            │
 *  │  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
 *  │  │  pactReporter()  │───▶│  Deduplicates    │───▶│  Writes JSON     │  │
 *  │  │  (on test stop)  │    │  interactions    │    │  to ./pacts/     │  │
 *  │  └──────────────────┘    └──────────────────┘    └──────────────────┘  │
 *  │                                                                        │
 *  └────────────────────────────────────────────────────────────────────────┘
 *
 *  OUTPUT FILES (./pacts/):
*  ├── <consumer>-<provider>.json
*  ├── ...
*  └── ...
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                              FILE RESPONSIBILITIES                          │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ pact-msw-adapter-setup.js  │ Browser-side MSW event listener               │
 * │                            │ - Captures request/response pairs              │
 * │                            │ - Maps URLs to provider names                  │
 * │                            │ - Sends pacts via executeServerCommand         │
 * ├────────────────────────────┼────────────────────────────────────────────────┤
 * │ pact-wtr-plugin.mjs        │ Node.js WTR plugin + reporter                  │
 * │ (this file)                │ - pactPlugin(): receives browser commands      │
 * │                            │ - pactReporter(): writes files on completion   │
 * ├────────────────────────────┼────────────────────────────────────────────────┤
 * │ story-fixture.js           │ Test fixture for running stories               │
 * │                            │ - Initializes adapter before each story        │
 * │                            │ - Calls reportPacts() after play function      │
 * └────────────────────────────┴────────────────────────────────────────────────┘
 *
 * Usage in web-test-runner.stories.config.mjs:
*   import { pactPlugin, pactReporter } from './test/pact/pact-wtr-plugin.mjs';
*
*   plugins: [
*     pactPlugin({ outputDir: 'pacts' }),
*     // ... other plugins
*   ],
*   reporters: [
*     defaultReporter({ reportTestResults: true, reportTestProgress: true }),
*     pactReporter(),
*   ],
 */

import fs from 'fs';
import path from 'path';

/** @type {Map<string, object>} Global store for pact files across all sessions */
const pactStore = new Map();

/** @type {boolean} */
let verboseMode = false;

/**
 * Deduplicate interactions by method + path + body
 */
function deduplicateInteractions(interactions) {
  const seen = new Map();

  for (const interaction of interactions) {
    const method = interaction.request?.method || '';
    const requestPath = interaction.request?.path || '';
    const body = JSON.stringify(interaction.request?.body || '');
    const key = `${method}:${requestPath}:${body}`;

    if (!seen.has(key)) {
      seen.set(key, interaction);
    }
  }

  return Array.from(seen.values());
}

/**
 * Handle a pact report from the browser
 * @param {Object} payload - The pact file data
 */
function handlePactReport(payload) {
  if (!payload || !payload.provider?.name) {
    return { success: false, error: 'Invalid pact payload' };
  }

  const provider = payload.provider.name;

  // Merge with existing pact file for this provider
  if (pactStore.has(provider)) {
    const existing = pactStore.get(provider);
    existing.interactions.push(...payload.interactions);
  } else {
    pactStore.set(provider, payload);
  }

  if (verboseMode) {
    // eslint-disable-next-line no-console
    console.log(`   📝 Received pact for provider: ${provider} (${payload.interactions.length} interactions)`);
  }

  return { success: true, provider, interactionCount: payload.interactions.length };
}

/**
 * Write all accumulated pact files to disk
 * @param {string} outputDir - Output directory
 */
function writePactFiles(outputDir) {
  const results = [];

  for (const [provider, pactFile] of pactStore) {
    const filename = `${pactFile.consumer.name}-${pactFile.provider.name}.json`;
    const filepath = path.join(outputDir, filename);

    // Deduplicate interactions
    pactFile.interactions = deduplicateInteractions(pactFile.interactions);

    fs.writeFileSync(filepath, JSON.stringify(pactFile, null, 2));

    results.push({
      provider,
      filename,
      interactionCount: pactFile.interactions.length,
    });
  }

  return { success: true, files: results };
}

/**
 * WTR Plugin that handles browser commands for pact reporting
 *
 * @param {Object} options
 * @param {string} [options.outputDir='pacts'] - Directory to write pact files
 * @param {boolean} [options.verbose=false] - Enable verbose logging
 * @returns {import('@web/dev-server').Plugin}
 */
export function pactPlugin({
  outputDir = 'pacts',
  verbose = process.env.PACT_REPORTER_VERBOSE === 'true',
} = {}) {
  verboseMode = verbose;
  const fullOutputDir = path.resolve(process.cwd(), outputDir);

  return {
    name: 'pact-plugin',

    /**
     * Server start hook - ensure output directory exists
     */
    serverStart() {
      if (!fs.existsSync(fullOutputDir)) {
        fs.mkdirSync(fullOutputDir, { recursive: true });
      }
      if (verbose) {
        // eslint-disable-next-line no-console
        console.log('\n📝 Pact Plugin initialized');
        // eslint-disable-next-line no-console
        console.log(`   Output directory: ${outputDir}`);
      }
    },

    /**
     * Handle commands from browser via executeCommand
     * @param {Object} params
     * @param {string} params.command - The command name
     * @param {unknown} params.payload - The command payload
     */
    executeCommand({ command, payload }) {
      // Handle pact:report command
      if (command === 'pact:report') {
        return handlePactReport(payload);
      }

      // Handle pact:clear command (for test isolation)
      if (command === 'pact:clear') {
        pactStore.clear();
        return { success: true };
      }

      // Handle pact:write command (write all accumulated pacts)
      if (command === 'pact:write') {
        return writePactFiles(fullOutputDir);
      }

      return undefined;
    },
  };
}

/**
 * Get current pact store state (for reporter)
 */
export function getPactStore() {
  return pactStore;
}

/**
 * Clear pact store (for test isolation)
 */
export function clearPactStore() {
  pactStore.clear();
}

/**
 * WTR Reporter that works with the pact plugin
 * This reporter writes the final pact files when tests complete
 */
export function pactReporter() {
  return {
    start() {
      pactStore.clear();
    },

    stop() {
      if (pactStore.size === 0) {
        if (verboseMode) {
          // eslint-disable-next-line no-console
          console.log('\n📝 No Pact files captured');
        }
        return;
      }

      const outputDir = path.resolve(process.cwd(), 'pacts');

      // eslint-disable-next-line no-console
      console.log('\n📝 Pact Contracts Generated');
      // eslint-disable-next-line no-console
      console.log('═'.repeat(50));

      for (const [, pactFile] of pactStore) {
        const filename = `${pactFile.consumer.name}-${pactFile.provider.name}.json`;
        const filepath = path.join(outputDir, filename);

        // Deduplicate interactions
        pactFile.interactions = deduplicateInteractions(pactFile.interactions);

        fs.writeFileSync(filepath, JSON.stringify(pactFile, null, 2));

        // eslint-disable-next-line no-console
        console.log(`   ✅ ${filename}`);
        // eslint-disable-next-line no-console
        console.log(`      Interactions: ${pactFile.interactions.length}`);
      }

      // eslint-disable-next-line no-console
      console.log('\n');
    },

    getTestProgress() {
      const totalInteractions = Array.from(pactStore.values()).reduce(
        (sum, pact) => sum + (pact.interactions?.length || 0),
        0
      );
      return `📝 Pact providers: ${pactStore.size}, interactions: ${totalInteractions}`;
    },
  };
}
