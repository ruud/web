import { expect } from 'chai';
import { promises as fs } from 'fs';
import path from 'path';
import globby from 'globby';

import { chromeLauncher } from '@web/test-runner-chrome';
import { TestRunnerCoreConfig } from '@web/test-runner-core';
import { runTests } from '@web/test-runner-core/test-helpers';
import { pactReporter } from '../src/pactReporter.js';

const rootDir = path.join(__dirname, '..', '..', '..');

/**
 * Normalize Pact output for comparison
 * - Removes dynamic timestamps, IDs, etc.
 * - Sorts interactions for consistent comparison
 */
const normalizePactOutput = (output: string): string => {
  try {
    const pact = JSON.parse(output);

    // Sort interactions by description for consistent comparison
    if (pact.interactions) {
      pact.interactions.sort((a: any, b: any) =>
        (a.description || '').localeCompare(b.description || ''),
      );
    }

    return JSON.stringify(pact, null, 2);
  } catch {
    return output;
  }
};

const readNormalized = async (filePath: string): Promise<string> => {
  const content = await fs.readFile(filePath, 'utf-8');
  return normalizePactOutput(content);
};

function createConfig({
  files,
  reporters,
}: Partial<TestRunnerCoreConfig>): Partial<TestRunnerCoreConfig> {
  return {
    files,
    reporters,
    rootDir,
    coverageConfig: {
      report: false,
      reportDir: process.cwd(),
    },
    browserLogs: true,
    watch: false,
    browsers: [chromeLauncher()],
  };
}

async function run(
  cwd: string,
  consumer: string,
  provider: string,
): Promise<{ actual: string; expected: string }> {
  const files = await globby('*-test.js', { absolute: true, cwd });
  const outputPath = './pacts';
  const reporters = [pactReporter({ outputPath, rootDir: cwd, debug: false })];

  await runTests(createConfig({ files, reporters }), [], {
    allowFailure: true,
    reportErrors: false,
  });

  const pactFile = path.join(cwd, outputPath, `${consumer}-${provider}.json`);
  const actual = await readNormalized(pactFile);
  const expected = await readNormalized(path.join(cwd, 'expected', `${consumer}-${provider}.json`));

  return { actual, expected };
}

async function cleanupFixtures() {
  for (const file of await globby('fixtures/**/pacts/**/*.json', {
    absolute: true,
    cwd: __dirname,
  })) {
    await fs.unlink(file);
  }

  // Remove pacts directories
  for (const dir of await globby('fixtures/**/pacts', {
    absolute: true,
    cwd: __dirname,
    onlyDirectories: true,
  })) {
    try {
      await fs.rmdir(dir);
    } catch {
      // Ignore if directory doesn't exist or isn't empty
    }
  }
}

describe('pactReporter', function () {
  // Increase timeout for integration tests
  this.timeout(30000);

  after(cleanupFixtures);

  describe('API', function () {
    it('should be a function', () => {
      expect(pactReporter).to.be.a('function');
    });

    it('should return a reporter object', () => {
      const reporter = pactReporter();
      expect(reporter).to.be.an('object');
      expect(reporter.onTestRunFinished).to.be.a('function');
    });

    it('should accept configuration options', () => {
      const reporter = pactReporter({
        outputPath: './custom-pacts',
        rootDir: '/custom/root',
        debug: true,
      });
      expect(reporter).to.be.an('object');
    });
  });

  describe('Integration tests', function () {
    describe('for a simple API interaction', function () {
      const fixtureDir = path.join(__dirname, 'fixtures/simple');

      it('produces expected Pact file', async function () {
        const { actual, expected } = await run(fixtureDir, 'test-consumer', 'user-service');
        expect(actual).to.equal(expected);
      });
    });

    describe('for multiple interactions with one provider', function () {
      const fixtureDir = path.join(__dirname, 'fixtures/multiple-interactions');

      it('produces expected Pact file with all interactions', async function () {
        const { actual, expected } = await run(fixtureDir, 'test-consumer', 'user-service');
        expect(actual).to.equal(expected);
      });
    });

    describe('for multiple providers', function () {
      const fixtureDir = path.join(__dirname, 'fixtures/multiple-providers');

      it('produces separate Pact files per provider', async function () {
        const userServiceResult = await run(fixtureDir, 'test-consumer', 'user-service');
        expect(userServiceResult.actual).to.equal(userServiceResult.expected);

        const productServiceResult = await run(fixtureDir, 'test-consumer', 'product-service');
        expect(productServiceResult.actual).to.equal(productServiceResult.expected);
      });
    });
  });

  describe('Edge cases', function () {
    describe('with no Pact logs', function () {
      const fixtureDir = path.join(__dirname, 'fixtures/no-pacts');

      it('does not create any Pact files', async function () {
        const files = await globby('*-test.js', { absolute: true, cwd: fixtureDir });
        const outputPath = './pacts';
        const reporters = [pactReporter({ outputPath, rootDir: fixtureDir, debug: false })];

        await runTests(createConfig({ files, reporters }), [], {
          allowFailure: true,
          reportErrors: false,
        });

        // Check that no pacts directory was created
        const pactsDir = path.join(fixtureDir, outputPath);
        const dirExists = await fs
          .access(pactsDir)
          .then(() => true)
          .catch(() => false);

        expect(dirExists).to.be.false;
      });
    });

    describe('with malformed log messages', function () {
      const fixtureDir = path.join(__dirname, 'fixtures/malformed-logs');

      it('skips invalid logs and processes valid ones', async function () {
        const { actual, expected } = await run(fixtureDir, 'test-consumer', 'user-service');
        expect(actual).to.equal(expected);
      });
    });

    describe('with duplicate interactions', function () {
      const fixtureDir = path.join(__dirname, 'fixtures/duplicates');

      it('removes duplicate interactions by description', async function () {
        const { actual, expected } = await run(fixtureDir, 'test-consumer', 'user-service');
        expect(actual).to.equal(expected);
      });
    });
  });

  describe('Interaction merging', function () {
    const fixtureDir = path.join(__dirname, 'fixtures/merging');

    it('merges interactions from multiple test sessions', async function () {
      const { actual, expected } = await run(fixtureDir, 'test-consumer', 'user-service');
      expect(actual).to.equal(expected);
    });
  });

  describe('Missing fields', function () {
    const fixtureDir = path.join(__dirname, 'fixtures/missing-fields');

    it('handles logs with missing optional fields', async function () {
      const { actual, expected } = await run(fixtureDir, 'test-consumer', 'user-service');
      expect(actual).to.equal(expected);
    });
  });

  describe('Configuration options', function () {
    it('accepts custom output path parameter', function () {
      const reporter = pactReporter({
        outputPath: './custom-pacts',
        rootDir: '/custom/root',
        debug: true,
      });

      expect(reporter).to.be.an('object');
      expect(reporter.onTestRunFinished).to.be.a('function');
    });
  });
});
