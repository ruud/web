import * as path from 'path';
import * as fs from 'fs';
import type { Reporter } from '@web/test-runner-core';
import { getPactStore, clearPactStore } from './pactPlugin.js';

export interface PactReporterArgs {
  /** Output directory for Pact files. Defaults to 'pacts' */
  outputDir?: string;
  /** Root directory to resolve outputDir against. Defaults to process.cwd() */
  rootDir?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

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
 * A Pact-format reporter for Web Test Runner
 *
 * Works together with the pactPlugin to write Pact contract files.
 * The plugin receives pact data from the browser via executeServerCommand,
 * and this reporter writes the accumulated pact files to disk when tests complete.
 *
 * @param args Options for Pact Reporter
 *
 * @example
 * import { pactPlugin, pactReporter } from '@web/test-runner-pact-reporter';
 *
 * export default {
 *   plugins: [
 *     pactPlugin({ outputDir: 'pacts' }),
 *   ],
 *   reporters: [
 *     pactReporter(),
 *   ],
 * };
 */
export function pactReporter({
  outputDir = 'pacts',
  rootDir = process.cwd(),
  verbose = process.env.PACT_REPORTER_VERBOSE === 'true',
}: PactReporterArgs = {}): Reporter {
  return {
    start() {
      clearPactStore();
    },

    stop() {
      const pactStore = getPactStore();

      if (pactStore.size === 0) {
        if (verbose) {
          console.log('\n[PACT-REPORTER] No Pact files captured');
        }
        return;
      }

      const fullOutputDir = path.resolve(process.cwd(), outputDir);

      if (!fs.existsSync(fullOutputDir)) {
        fs.mkdirSync(fullOutputDir, { recursive: true });
      }

      console.log('\n[PACT-REPORTER] Pact Contracts Generated');
      console.log('='.repeat(50));

      for (const [, pactFile] of pactStore) {
        const filename = `${pactFile.consumer.name}-${pactFile.provider.name}.json`;
        const filepath = path.join(fullOutputDir, filename);

        // Deduplicate interactions
        pactFile.interactions = deduplicateInteractions(pactFile.interactions);

        fs.writeFileSync(filepath, JSON.stringify(pactFile, null, 2));

        console.log(`   ${filename}`);
        console.log(`      Interactions: ${pactFile.interactions.length}`);
      }

      console.log('\n');
    },

    getTestProgress() {
      const pactStore = getPactStore();
      const totalInteractions = Array.from(pactStore.values()).reduce(
        (sum, pact) => sum + (pact.interactions?.length || 0),
        0,
      );
      return `Pact providers: ${pactStore.size}, interactions: ${totalInteractions}`;
    },
  };
}
