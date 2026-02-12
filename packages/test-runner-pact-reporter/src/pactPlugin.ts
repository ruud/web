/**
 * Pact Web Test Runner Plugin
 *
 * Receives Pact contract data from the browser via WTR's executeServerCommand
 * WebSocket RPC, replacing the fragile console.log parsing approach.
 *
 * ┌─────────────────────────── BROWSER (Chromium) ───────────────────────────┐
 * │                                                                          │
 * │  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
 * │  │  Storybook Story │───▶│   MSW Worker     │───▶│  pactAdapter     │   │
 * │  │  (play function) │    │  (intercepts API)│    │                  │   │
 * │  └──────────────────┘    └──────────────────┘    └────────┬─────────┘   │
 * │                                                           │             │
 * │  1. Story renders component                               │             │
 * │  2. Play function triggers API calls                      │             │
 * │  3. MSW intercepts & returns mocked responses             │             │
 * │  4. Adapter captures request/response pairs               ▼             │
 * │                                                  ┌──────────────────┐   │
 * │                                                  │executeServerCmd  │   │
 * │                                                  │('pact:report',   │   │
 * │                                                  │ pactData)        │   │
 * └──────────────────────────────────────────────────┴────────┬─────────┴───┘
 *                                                              │
 *                              WebSocket RPC                   │
 *                              ───────────────────────────────▶│
 *                                                              │
 * ┌─────────────────────────── NODE.JS (WTR) ────────────────┬┴────────────┐
 * │                                                          │             │
 * │  ┌──────────────────┐                          ┌─────────▼─────────┐   │
 * │  │   pactPlugin()   │◀─────────────────────────│  executeCommand() │   │
 * │  │                  │   command: 'pact:report' │  handler          │   │
 * │  │  - Receives pact │   payload: pactData      └───────────────────┘   │
 * │  │  - Aggregates by │                                                  │
 * │  │    provider      │                                                  │
 * │  │  - Stores in Map │                                                  │
 * │  └────────┬─────────┘                                                  │
 * │           │                                                            │
 * │           │ pactStore (shared Map)                                     │
 * │           ▼                                                            │
 * │  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
 * │  │  pactReporter()  │───▶│  Deduplicates    │───▶│  Writes JSON     │  │
 * │  │  (on test stop)  │    │  interactions    │    │  to ./pacts/     │  │
 * │  └──────────────────┘    └──────────────────┘    └──────────────────┘  │
 * │                                                                        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Usage in web-test-runner.config.mjs:
 *   import { pactPlugin, pactReporter } from '@web/test-runner-pact-reporter';
 *
 *   plugins: [
 *     pactPlugin({ outputDir: 'pacts' }),
 *   ],
 *   reporters: [
 *     defaultReporter({ reportTestResults: true, reportTestProgress: true }),
 *     pactReporter(),
 *   ],
 */

import * as fs from 'fs';
import * as path from 'path';

interface PactFile {
  consumer: { name: string };
  provider: { name: string };
  interactions: any[];
  metadata: {
    pactSpecification: { version: string };
    client?: { name: string; version: string };
  };
}

export interface PactPluginArgs {
  /** Directory to write Pact files. Defaults to 'pacts' */
  outputDir?: string;
  /** Root directory to resolve outputDir against. Defaults to process.cwd() */
  rootDir?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

/** Global store for pact files across all sessions */
const pactStore = new Map<string, PactFile>();

/** Verbose mode flag */
let verboseMode = false;

/**
 * Deduplicate interactions by method + path + body
 */
function deduplicateInteractions(interactions: any[]): any[] {
  const seen = new Map<string, any>();

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
 */
function handlePactReport(
  payload: PactFile,
): { success: boolean; provider?: string; interactionCount?: number; error?: string } {
  if (!payload || !payload.provider?.name) {
    return { success: false, error: 'Invalid pact payload' };
  }

  const provider = payload.provider.name;

  // Merge with existing pact file for this provider
  if (pactStore.has(provider)) {
    const existing = pactStore.get(provider)!;
    existing.interactions.push(...payload.interactions);
  } else {
    pactStore.set(provider, payload);
  }

  if (verboseMode) {
    console.log(
      `   [PACT-PLUGIN] Received pact for provider: ${provider} (${payload.interactions.length} interactions)`,
    );
  }

  return { success: true, provider, interactionCount: payload.interactions.length };
}

/**
 * Write all accumulated pact files to disk
 */
function writePactFiles(outputDir: string): { success: boolean; files: any[] } {
  const results: any[] = [];

  // Only create directory if we have files to write
  if (pactStore.size > 0 && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

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
 * Get the current pact store (used by pactReporter)
 */
export function getPactStore(): Map<string, PactFile> {
  return pactStore;
}

/**
 * Clear the pact store (used by pactReporter)
 */
export function clearPactStore(): void {
  pactStore.clear();
}

/**
 * WTR Plugin that handles browser commands for pact reporting.
 *
 * Handles three commands from the browser:
 * - `pact:report` - Receive pact data from browser
 * - `pact:clear` - Clear stored pacts
 * - `pact:write` - Write accumulated pacts to disk
 *
 * @param args Plugin configuration options
 *
 * @example
 * import { pactPlugin } from '@web/test-runner-pact-reporter';
 *
 * export default {
 *   plugins: [
 *     pactPlugin({ outputDir: 'pacts', verbose: true }),
 *   ],
 * };
 */
export function pactPlugin({
  outputDir = 'pacts',
  rootDir = process.cwd(),
  verbose = process.env.PACT_REPORTER_VERBOSE === 'true',
}: PactPluginArgs = {}) {
  verboseMode = verbose;
  const fullOutputDir = path.resolve(rootDir, outputDir);

  return {
    name: 'pact-plugin',

    /**
     * Server start hook - log initialization
     */
    serverStart() {
      if (verbose) {
        console.log('\n[PACT-PLUGIN] Pact Plugin initialized');
        console.log(`   Output directory: ${outputDir}`);
      }
    },

    /**
     * Handle commands from browser via executeServerCommand
     */
    executeCommand({ command, payload }: { command: string; payload?: unknown }) {
      if (command === 'pact:report') {
        return handlePactReport(payload as PactFile);
      }

      if (command === 'pact:clear') {
        pactStore.clear();
        return { success: true };
      }

      if (command === 'pact:write') {
        return writePactFiles(fullOutputDir);
      }

      return undefined;
    },
  };
}
