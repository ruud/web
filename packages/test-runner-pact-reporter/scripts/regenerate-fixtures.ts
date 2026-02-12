#!/usr/bin/env ts-node
/**
 * Regenerate expected fixture files by running tests and copying actual output
 */
import { promises as fs } from 'fs';
import path from 'path';
import globby from 'globby';
import { chromeLauncher } from '@web/test-runner-chrome';
import { TestRunnerCoreConfig } from '@web/test-runner-core';
import { runTests } from '@web/test-runner-core/test-helpers';

const rootDir = path.join(__dirname, '..', '..', '..');

function createConfig({
  files,
  outputDir,
  fixtureDir,
}: {
  files: string[];
  outputDir: string;
  fixtureDir: string;
}): Partial<TestRunnerCoreConfig> {
  const { pactReporter } = require('../src/pactReporter.js');
  const { pactPlugin } = require('../src/pactPlugin.js');

  return {
    files,
    reporters: [pactReporter({ outputDir, rootDir: fixtureDir })],
    plugins: [pactPlugin({ outputDir, rootDir: fixtureDir })],
    rootDir,
    coverageConfig: {
      report: false,
      reportDir: process.cwd(),
    },
    browserLogs: false,
    watch: false,
    browsers: [chromeLauncher()],
  };
}

async function regenerateFixture(fixtureName: string) {
  console.log(`\nRegenerating ${fixtureName}...`);

  const fixtureDir = path.join(__dirname, '..', 'test', 'fixtures', fixtureName);
  const outputDir = 'pacts';
  const expectedDir = path.join(fixtureDir, 'expected');

  // Run tests
  const files = await globby('*-test.js', { absolute: true, cwd: fixtureDir });

  if (files.length === 0) {
    console.log(`  ⚠️  No test files found`);
    return;
  }

  await runTests(createConfig({ files, outputDir, fixtureDir }), [], {
    allowFailure: true,
    reportErrors: false,
  });

  // Copy pacts to expected
  const pactsDir = path.join(fixtureDir, outputDir);

  try {
    const pactFiles = await fs.readdir(pactsDir);

    for (const file of pactFiles) {
      if (file.endsWith('.json')) {
        const srcPath = path.join(pactsDir, file);
        const destPath = path.join(expectedDir, file);
        await fs.copyFile(srcPath, destPath);
        console.log(`  ✅ Updated ${file}`);
      }
    }

    // Cleanup
    await fs.rm(pactsDir, { recursive: true, force: true });
  } catch (error: any) {
    console.log(`  ⚠️  No pact files generated (${error.message})`);
  }
}

async function main() {
  const fixtures = [
    'simple',
    'multiple-interactions',
    'multiple-providers',
    'malformed-logs',
    'duplicates',
    'merging',
    'missing-fields',
  ];

  console.log('Regenerating expected fixture files...\n');

  for (const fixture of fixtures) {
    await regenerateFixture(fixture);
  }

  console.log('\n✅ Done! All expected fixture files updated.');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
