import { fixture } from '@open-wc/testing';
import { registerMockRoutes } from '@web/mocks/browser.js';
import { initPactAdapter, pactAdapter } from '../pact/pact-msw-adapter-setup.js';

/**
 * No-op step function for when Storybook's step is not available
 * Simply executes the callback without any step grouping
 */
const noopStep = async (_name, callback) => callback();

/** Track if pact adapter has been initialized */
let pactAdapterInitialized = false;

/**
 * Check if debug mode is enabled via environment variable
 * Note: process.env is replaced at build time by rollup-replace plugin
 * @returns {boolean}
 */
function isPactDebugEnabled() {
  try {
    // This will be replaced by rollup-replace at build time
    return typeof PACT_DEBUG !== 'undefined' && PACT_DEBUG === 'true';
  } catch {
    return false;
  }
}

/**
 * Check if pact generation is enabled via environment variable
 * Note: GENERATE_PACT is replaced at build time by rollup-replace plugin
 * @returns {boolean}
 */
function isPactGenerationEnabled() {
  try {
    // This will be replaced by rollup-replace at build time
    return typeof GENERATE_PACT !== 'undefined' && GENERATE_PACT === 'true';
  } catch {
    return false;
  }
}

/**
* Generic storyFixture for test environments:
* - Registers mock routes from story parameters
* - Generates Pact contracts from mock interactions
* - Renders the story with args
* - Runs play functions with proper context (including step fallback)
*
* @param {Object} story - Story object with render, args, parameters, and optional play function
* @param {Object} meta - Default export from stories file (decorators, loaders, etc.)
* @param {Object} options - Additional options
* @param {boolean} options.generatePact - Whether to generate Pact contracts (default: true)
* @returns {Promise<Element>} The rendered element
*/
export async function storyFixture(story, meta = {}, options = {}) {
  // Determine if pact generation is enabled (build-time env var takes precedence)
  const shouldGeneratePact = options.generatePact !== false && isPactGenerationEnabled();

  // Initialize pact adapter on first use
  if (shouldGeneratePact && !pactAdapterInitialized) {
    await initPactAdapter({ debug: isPactDebugEnabled() });
    pactAdapterInitialized = true;
  }

  // Mark start of new test for pact recording
  if (shouldGeneratePact) {
    pactAdapter.newTest();
  }

  // Extract mocks from story parameters
  const mocks = story?.parameters?.mocks;

  // Register mock routes if available
  if (Array.isArray(mocks)) {
    registerMockRoutes(mocks);
  }

  // Run loaders if defined (e.g., clearCache)
  if (meta.loaders) {
    await Promise.all(meta.loaders.map(loader => loader()));
  }

  // Get args from the story
  const args = story.args || {};

  // Render the story with args
  let rendered;
  if (typeof story === 'function') {
    rendered = story(args);
  } else if (story.render) {
    rendered = story.render(args);
  } else {
    throw new Error('Story must be a function or have a render property');
  }

  // Apply decorators if defined
  if (meta.decorators) {
    for (const decorator of [...meta.decorators].reverse()) {
      const originalRendered = rendered;
      rendered = decorator(() => originalRendered, { args });
    }
  }

  // Create the fixture
  const element = await fixture(rendered);

  // Run play function if defined
  if (story.play) {
    // Provide a full context similar to Storybook
    const context = {
      canvasElement: element.parentElement,
      args,
      step: noopStep,
    };

    await story.play(context);
  }

  // Verify test completed and report pacts
  if (shouldGeneratePact) {
    pactAdapter.verifyTest();
    await pactAdapter.reportPacts();
  }

  return element;
}
