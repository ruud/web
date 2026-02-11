import { fixture } from '@open-wc/testing';
import { pactAdapter } from './pactAdapter.js';

/**
 * No-op step function for when Storybook's step is not available
 * Simply executes the callback without any step grouping
 */
const noopStep = async <T>(_name: string, callback: () => T | Promise<T>): Promise<T> =>
  callback();

/** Track if pact adapter has been initialized */
let pactAdapterInitialized = false;

/**
 * Check if debug mode is enabled via environment variable
 * Note: process.env is replaced at build time by bundler
 */
function isPactDebugEnabled(): boolean {
  try {
    // @ts-ignore - PACT_DEBUG is replaced at build time
    return typeof PACT_DEBUG !== 'undefined' && PACT_DEBUG === 'true';
  } catch {
    return false;
  }
}

/**
 * Check if pact generation is enabled via environment variable
 * Note: GENERATE_PACT is replaced at build time by bundler
 */
function isPactGenerationEnabled(): boolean {
  try {
    // @ts-ignore - GENERATE_PACT is replaced at build time
    return typeof GENERATE_PACT !== 'undefined' && GENERATE_PACT === 'true';
  } catch {
    return false;
  }
}

export interface StoryContext<TArgs = any> {
  /** The canvas element (parent of rendered story) */
  canvasElement: HTMLElement;
  /** Story arguments */
  args: TArgs;
  /** Step function for grouping test steps */
  step: typeof noopStep;
}

export interface Story<TArgs = any> {
  /** Story render function */
  render?: (args: TArgs) => any;
  /** Story arguments */
  args?: TArgs;
  /** Story parameters (including mocks) */
  parameters?: {
    mocks?: any[];
    [key: string]: any;
  };
  /** Story play function for interactions */
  play?: (context: StoryContext<TArgs>) => void | Promise<void>;
}

export interface StoryMeta<TArgs = any> {
  /** Decorators to wrap the story */
  decorators?: Array<(story: () => any, context: { args: TArgs }) => any>;
  /** Loaders to run before rendering (e.g., clearCache) */
  loaders?: Array<() => void | Promise<void>>;
  [key: string]: any;
}

export interface StoryFixtureOptions {
  /** Whether to generate Pact contracts (default: true if GENERATE_PACT env var is set) */
  generatePact?: boolean;
  /** MSW worker instance (optional, for dynamic initialization) */
  worker?: any;
  /** Function to register mock routes (optional, defaults to @web/mocks) */
  registerMockRoutes?: (mocks: any[]) => void;
}

/**
 * Custom storyFixture that properly handles:
 * - Registering mock routes from story parameters
 * - Generating Pact contracts from mock interactions
 * - Rendering the story with args
 * - Running play functions with proper context (including step fallback)
 *
 * @example
 * ```typescript
 * import { storyFixture } from '@web/test-runner-pact-reporter/browser';
 * import { UserProfileStory, meta } from './UserProfile.stories';
 *
 * it('renders user profile', async () => {
 *   const element = await storyFixture(UserProfileStory, meta);
 *   expect(element).to.exist;
 * });
 * ```
 *
 * @param story - The story object with render, args, parameters, and optional play function
 * @param meta - The default export from the stories file (contains decorators, loaders, etc.)
 * @param options - Additional options
 * @returns The rendered element
 */
export async function storyFixture<TArgs = any, TElement extends Element = Element>(
  story: Story<TArgs> | ((args: TArgs) => any),
  meta: StoryMeta<TArgs> = {},
  options: StoryFixtureOptions = {},
): Promise<TElement> {
  // Determine if pact generation is enabled (build-time env var takes precedence)
  const shouldGeneratePact = options.generatePact !== false && isPactGenerationEnabled();

  // Initialize pact adapter on first use
  if (shouldGeneratePact && !pactAdapterInitialized) {
    if (options.worker) {
      const { initPactAdapter } = await import('./pactAdapter.js');
      await initPactAdapter(options.worker, { debug: isPactDebugEnabled() });
    }
    pactAdapterInitialized = true;
  }

  // Mark start of new test for pact recording
  if (shouldGeneratePact) {
    pactAdapter.newTest();
  }

  // Convert function-style story to object
  const storyObj: Story<TArgs> = typeof story === 'function' ? { render: story } : story;

  // Extract mocks from story parameters
  const mocks = storyObj?.parameters?.mocks;

  // Register mock routes if available
  if (Array.isArray(mocks) && mocks.length > 0) {
    if (options.registerMockRoutes) {
      options.registerMockRoutes(mocks);
    } else {
      // Try to dynamically import @web/mocks if available
      try {
        const { registerMockRoutes } = await import('@web/mocks/browser.js');
        registerMockRoutes(mocks);
      } catch (error) {
        console.warn(
          '[PACT-FIXTURE] Could not load @web/mocks. Pass registerMockRoutes in options if using a different mock library.',
        );
      }
    }
  }

  // Run loaders if defined (e.g., clearCache)
  if (meta.loaders) {
    await Promise.all(meta.loaders.map(loader => loader()));
  }

  // Get args from the story
  const args = (storyObj.args || {}) as TArgs;

  // Render the story with args
  let rendered: any;
  if (typeof story === 'function') {
    rendered = story(args);
  } else if (storyObj.render) {
    rendered = storyObj.render(args);
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
  const element = (await fixture(rendered)) as TElement;

  // Run play function if defined
  if (storyObj.play) {
    // Provide a full context similar to Storybook
    const context: StoryContext<TArgs> = {
      canvasElement: element.parentElement as HTMLElement,
      args,
      step: noopStep,
    };

    await storyObj.play(context);
  }

  // Verify test completed and report pacts
  if (shouldGeneratePact) {
    pactAdapter.verifyTest();
    await pactAdapter.reportPacts();
  }

  return element;
}
