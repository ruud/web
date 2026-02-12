import { expect } from 'chai';
import { promises as fs } from 'fs';
import path from 'path';
import globby from 'globby';

import { chromeLauncher } from '@web/test-runner-chrome';
import { TestRunnerCoreConfig } from '@web/test-runner-core';
import { runTests } from '@web/test-runner-core/test-helpers';
import { pactReporter } from '../src/pactReporter.js';
import { pactPlugin, clearPactStore } from '../src/pactPlugin.js';

const rootDir = path.join(__dirname, '..', '..', '..');

/**
 * Recursively sort object keys for consistent JSON comparison
 */
const sortObjectKeys = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted: any = {};
  Object.keys(obj)
    .sort()
    .forEach(key => {
      sorted[key] = sortObjectKeys(obj[key]);
    });
  return sorted;
};

/**
 * Normalize Pact output for comparison
 * - Sorts interactions by description for consistent comparison
 * - Sorts all object keys recursively for consistent property order
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

    // Sort all object keys recursively
    const sorted = sortObjectKeys(pact);

    return JSON.stringify(sorted, null, 2);
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
  plugins,
}: Partial<TestRunnerCoreConfig>): Partial<TestRunnerCoreConfig> {
  return {
    files,
    reporters,
    plugins,
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
  const outputDir = 'pacts';
  const reporters = [pactReporter({ outputDir, rootDir: cwd })];
  const plugins = [pactPlugin({ outputDir, rootDir: cwd })];

  await runTests(createConfig({ files, reporters, plugins }), [], {
    allowFailure: true,
    reportErrors: false,
  });

  const pactFile = path.join(cwd, outputDir, `${consumer}-${provider}.json`);
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

  // Clean up any leftover files from previous test runs
  before(cleanupFixtures);

  // Clear the pactStore before each test to prevent accumulation
  beforeEach(() => {
    clearPactStore();
  });

  after(cleanupFixtures);

  describe('API', function () {
    it('should be a function', () => {
      expect(pactReporter).to.be.a('function');
    });

    it('should return a reporter object', () => {
      const reporter = pactReporter();
      expect(reporter).to.be.an('object');
      expect(reporter.start).to.be.a('function');
      expect(reporter.stop).to.be.a('function');
      expect(reporter.getTestProgress).to.be.a('function');
    });

    it('should accept configuration options', () => {
      const reporter = pactReporter({
        outputDir: './custom-pacts',
        verbose: true,
      });
      expect(reporter).to.be.an('object');
    });
  });

  describe('pactPlugin API', function () {
    it('should be a function', () => {
      expect(pactPlugin).to.be.a('function');
    });

    it('should return a plugin object', () => {
      const plugin = pactPlugin();
      expect(plugin).to.be.an('object');
      expect(plugin.name).to.equal('pact-plugin');
      expect(plugin.serverStart).to.be.a('function');
      expect(plugin.executeCommand).to.be.a('function');
    });

    it('should accept configuration options', () => {
      const plugin = pactPlugin({
        outputDir: './custom-pacts',
        verbose: true,
      });
      expect(plugin).to.be.an('object');
      expect(plugin.name).to.equal('pact-plugin');
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
    describe('with no pact commands', function () {
      const fixtureDir = path.join(__dirname, 'fixtures/no-pacts');

      it('does not create any Pact files', async function () {
        const files = await globby('*-test.js', { absolute: true, cwd: fixtureDir });
        const outputDir = 'pacts';
        const reporters = [pactReporter({ outputDir, rootDir: fixtureDir })];
        const plugins = [pactPlugin({ outputDir, rootDir: fixtureDir })];

        await runTests(createConfig({ files, reporters, plugins }), [], {
          allowFailure: true,
          reportErrors: false,
        });

        // Check that no pacts directory was created
        const pactsDir = path.join(fixtureDir, outputDir);
        const dirExists = await fs
          .access(pactsDir)
          .then(() => true)
          .catch(() => false);

        expect(dirExists).to.be.false;
      });
    });

    describe('with valid pact data only (malformed-logs fixture)', function () {
      const fixtureDir = path.join(__dirname, 'fixtures/malformed-logs');

      it('processes valid pact data', async function () {
        const { actual, expected } = await run(fixtureDir, 'test-consumer', 'user-service');
        expect(actual).to.equal(expected);
      });
    });

    describe('with duplicate interactions', function () {
      const fixtureDir = path.join(__dirname, 'fixtures/duplicates');

      it('removes duplicate interactions by method+path+body', async function () {
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

    it('handles pacts with missing optional fields', async function () {
      const { actual, expected } = await run(fixtureDir, 'test-consumer', 'user-service');
      expect(actual).to.equal(expected);
    });
  });

  describe('Configuration options', function () {
    it('accepts custom output dir parameter', function () {
      const reporter = pactReporter({
        outputDir: './custom-pacts',
        verbose: true,
      });

      expect(reporter).to.be.an('object');
      expect(reporter.stop).to.be.a('function');
    });
  });
});
