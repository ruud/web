/**
 * Pact MSW Adapter Setup for Web Test Runner
 *
 * Browser-side component that captures MSW mocked API interactions and reports
 * them to Node.js for Pact contract generation.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ HOW THIS ADAPTER WORKS                                                      │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * 1. INITIALIZATION (initPactAdapter)
 *    └── Registers listeners on MSW worker events:
 *        ├── 'request:start' → Stores pending request metadata
 *        └── 'response:mocked' → Captures complete request/response pair
 *
 * 2. DURING TEST (automatic via MSW events)
 *    └── For each mocked API call:
 *        ├── Match URL to provider (e.g., user-service, product-service)
 *        ├── Extract request: method, path, headers, body, query
 *        ├── Extract response: status, headers, body
 *        └── Store as interaction with provider tag
 *
 * 3. AFTER TEST (reportPacts)
 *    └── Group interactions by provider and send to Node.js:
 *        ├── PRIMARY: executeServerCommand('pact:report', pactFile)
 *        │   └── Direct WebSocket RPC to pact-wtr-plugin.mjs
 *        └── FALLBACK: console.log('[PACT-ADAPTER] FILE ...')
 *            └── Parsed by pact-reporter.mjs
 *
 * Note: @pactflow/pact-msw-adapter doesn't work in browser environments with
 * Web Test Runner, so this is a lightweight browser-compatible implementation.
 *
 * Usage:
 *   import { pactAdapter, initPactAdapter } from '@web/test-runner-pact-reporter/browser';
 *
 *   // In your test setup:
 *   await initPactAdapter(worker);
 *
 *   // Before each test:
 *   pactAdapter.newTest();
 *
 *   // After each test:
 *   pactAdapter.verifyTest();
 *   await pactAdapter.reportPacts();
 */

export interface ProviderMapping {
  [provider: string]: string[];
}

export interface PactAdapterOptions {
  /** Enable debug logging */
  debug?: boolean;
  /** Consumer name for Pact contracts */
  consumer?: string;
  /** Provider URL mapping */
  providers?: ProviderMapping;
  /** Headers to exclude from contracts */
  excludedHeaders?: string[];
  /** URL patterns to exclude */
  excludedUrlPatterns?: string[];
}

export interface MSWWorker {
  events: {
    on(event: 'request:start', handler: (data: RequestStartData) => void): void;
    on(event: 'response:mocked', handler: (data: ResponseMockedData) => void): void;
  };
}

interface RequestStartData {
  request: Request;
  requestId: string;
}

interface ResponseMockedData {
  request: Request;
  requestId: string;
  response: Response;
}

interface PendingRequest {
  request: Request;
  provider: string;
  startTime: number;
}

interface PactMatchingRule {
  match: string;
  min?: number;
  regex?: string;
}

interface PactMatchingRules {
  [path: string]: {
    matchers: PactMatchingRule[];
  };
}

interface PactRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  query?: string;
  body?: any;
  matchingRules?: PactMatchingRules;
}

interface PactResponse {
  status: number;
  headers: Record<string, string>;
  body?: any;
  matchingRules?: PactMatchingRules;
}

interface PactInteraction {
  description: string;
  providerState: string;
  request: PactRequest;
  response: PactResponse;
  _provider?: string;
}

interface PactFile {
  consumer: { name: string };
  provider: { name: string };
  interactions: Omit<PactInteraction, '_provider'>[];
  metadata: {
    pactSpecification: { version: string };
    client: { name: string; version: string };
  };
}

/**
 * Default provider URL mapping
 * Maps URL patterns to provider names for Pact contracts
 *
 * NOTE: This is empty by default. You should configure your own provider mappings
 * when initializing the adapter.
 *
 * Example:
 * {
 *   'user-service': ['/api/users', '/api/auth'],
 *   'product-service': ['/api/products', '/api/inventory'],
 * }
 */
const DEFAULT_PROVIDERS: ProviderMapping = {};

/**
 * Default headers to exclude from Pact contracts
 * These headers are typically dynamic and not useful for contract testing
 */
const DEFAULT_EXCLUDED_HEADERS = [
  'authorization',
  'x-request-id',
  'x-correlation-id',
  'cookie',
  'set-cookie',
  'x-powered-by',
  'date',
  'content-length',
  'accept',
  'accept-language',
  'accept-encoding',
  'user-agent',
  'referer',
  'origin',
  'host',
  'connection',
  'cache-control',
  'pragma',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
];

/**
 * Default URLs to exclude from Pact recording
 */
const DEFAULT_EXCLUDED_URL_PATTERNS = [
  'mockServiceWorker.js',
  '.js',
  '.css',
  '.png',
  '.svg',
  '.woff',
  '.woff2',
  'favicon',
];

/** Default consumer name */
const DEFAULT_CONSUMER = 'web-test-runner-consumer';

/** Store for captured interactions by request ID */
const pendingRequests = new Map<string, PendingRequest>();

/** Captured complete interactions */
let interactions: PactInteraction[] = [];

/** Initialization state */
let isInitialized = false;

/** Configuration */
let config: Required<PactAdapterOptions> = {
  debug: false,
  consumer: DEFAULT_CONSUMER,
  providers: DEFAULT_PROVIDERS,
  excludedHeaders: DEFAULT_EXCLUDED_HEADERS,
  excludedUrlPatterns: DEFAULT_EXCLUDED_URL_PATTERNS,
};

/**
 * Check if string is a UUID
 */
function isUUID(str: string): boolean {
  return /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(
    str,
  );
}

/**
 * Check if string is an ISO date
 */
function isISODate(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/.test(str);
}

/**
 * Check if string is an email
 */
function isEmail(str: string): boolean {
  return /^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(str);
}

/**
 * Generate Pact v3 matching rules for a value
 * This creates flexible matchers so providers don't need exact data matches
 *
 * @param value - The value to generate matching rules for
 * @param path - The JSON path (e.g., '$.body.id')
 * @returns Matching rules object
 */
function generateMatchingRules(value: any, path: string): PactMatchingRules {
  const rules: PactMatchingRules = {};

  if (value === null || value === undefined) {
    return rules;
  }

  if (Array.isArray(value)) {
    // For arrays, add a type matcher and recurse into first element as template
    rules[path] = { matchers: [{ match: 'type', min: 0 }] };

    if (value.length > 0) {
      const itemRules = generateMatchingRules(value[0], `${path}[*]`);
      Object.assign(rules, itemRules);
    }
  } else if (typeof value === 'object') {
    // For objects, recurse into each property
    for (const [key, val] of Object.entries(value)) {
      const propPath = `${path}.${key}`;
      const propRules = generateMatchingRules(val, propPath);
      Object.assign(rules, propRules);
    }
  } else if (typeof value === 'string') {
    // String matching - use type matcher
    if (isUUID(value)) {
      rules[path] = {
        matchers: [
          {
            match: 'regex',
            regex:
              '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$',
          },
        ],
      };
    } else if (isISODate(value)) {
      rules[path] = {
        matchers: [
          {
            match: 'regex',
            regex: '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})?)?$',
          },
        ],
      };
    } else if (isEmail(value)) {
      rules[path] = {
        matchers: [{ match: 'regex', regex: '^[\\w.+-]+@[\\w.-]+\\.[a-zA-Z]{2,}$' }],
      };
    } else {
      rules[path] = { matchers: [{ match: 'type' }] };
    }
  } else if (typeof value === 'number') {
    // Number matching - use type matcher (integer or decimal)
    if (Number.isInteger(value)) {
      rules[path] = { matchers: [{ match: 'integer' }] };
    } else {
      rules[path] = { matchers: [{ match: 'decimal' }] };
    }
  } else if (typeof value === 'boolean') {
    rules[path] = { matchers: [{ match: 'type' }] };
  }

  return rules;
}

/**
 * Get provider name from URL
 */
function getProviderFromUrl(url: string): string | null {
  for (const [provider, patterns] of Object.entries(config.providers)) {
    for (const pattern of patterns) {
      if (url.includes(pattern)) {
        return provider;
      }
    }
  }
  return null;
}

/**
 * Check if URL should be excluded
 */
function shouldExcludeUrl(url: string): boolean {
  return config.excludedUrlPatterns.some(pattern => url.includes(pattern));
}

/**
 * Filter headers, removing excluded ones
 */
function filterHeaders(headers: Headers): Record<string, string> {
  const filtered: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (!config.excludedHeaders.includes(key.toLowerCase())) {
      filtered[key] = value;
    }
  });
  return filtered;
}

/**
 * Read body from request or response
 */
async function readBody(input: Request | Response): Promise<any> {
  try {
    const clone = input.clone();
    if (!clone.body) return undefined;

    const contentType = clone.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await clone.json();
    }
    return await clone.text();
  } catch {
    return undefined;
  }
}

/**
 * Initialize the Pact adapter
 * @param worker - MSW worker instance
 * @param options - Configuration options
 */
export async function initPactAdapter(
  worker: MSWWorker,
  options: PactAdapterOptions = {},
): Promise<void> {
  if (isInitialized) {
    return;
  }

  // Merge options with defaults
  config = {
    debug: options.debug ?? false,
    consumer: options.consumer ?? DEFAULT_CONSUMER,
    providers: options.providers ?? DEFAULT_PROVIDERS,
    excludedHeaders: options.excludedHeaders ?? DEFAULT_EXCLUDED_HEADERS,
    excludedUrlPatterns: options.excludedUrlPatterns ?? DEFAULT_EXCLUDED_URL_PATTERNS,
  };

  // Listen to MSW request start events
  worker.events.on('request:start', ({ request, requestId }) => {
    const { url } = request;

    // Skip excluded URLs
    if (shouldExcludeUrl(url)) return;

    // Skip if no provider matches
    const provider = getProviderFromUrl(url);
    if (!provider) return;

    // Store pending request
    pendingRequests.set(requestId, {
      request,
      provider,
      startTime: Date.now(),
    });

    if (config.debug) {
      console.log(`[PACT] Request start: ${request.method} ${url}`);
    }
  });

  // Listen to MSW response events
  worker.events.on('response:mocked', async ({ request, requestId, response }) => {
    const pending = pendingRequests.get(requestId);
    if (!pending) return;

    pendingRequests.delete(requestId);

    try {
      const url = new URL(request.url);
      const responseBody = await readBody(response);

      // Build request object - only include body for methods that have a body
      const pactRequest: PactRequest = {
        method: request.method,
        path: url.pathname,
        headers: filterHeaders(request.headers),
      };

      // Only add query if there are query parameters
      if (url.search && url.search.length > 1) {
        pactRequest.query = url.search.slice(1);
      }

      // Only add body for methods that typically have a body (POST, PUT, PATCH)
      const methodsWithBody = ['POST', 'PUT', 'PATCH'];
      if (methodsWithBody.includes(request.method.toUpperCase())) {
        const requestBody = await readBody(request);
        if (requestBody !== undefined) {
          pactRequest.body = requestBody;
          // Generate matching rules for request body (Pact v3 - inside request block)
          const requestMatchingRules = generateMatchingRules(requestBody, '$.body');
          if (Object.keys(requestMatchingRules).length > 0) {
            pactRequest.matchingRules = requestMatchingRules;
          }
        }
      }

      // Build response object
      const pactResponse: PactResponse = {
        status: response.status,
        headers: filterHeaders(response.headers),
      };

      // Only add body if present
      if (responseBody !== undefined) {
        pactResponse.body = responseBody;
        // Generate matching rules for response body (Pact v3 - inside response block)
        const responseMatchingRules = generateMatchingRules(responseBody, '$.body');
        if (Object.keys(responseMatchingRules).length > 0) {
          pactResponse.matchingRules = responseMatchingRules;
        }
      }

      const interaction: PactInteraction = {
        description: requestId,
        providerState: '',
        request: pactRequest,
        response: pactResponse,
        _provider: pending.provider,
      };

      interactions.push(interaction);

      if (config.debug) {
        console.log(
          `[PACT] Response captured: ${request.method} ${url.pathname} -> ${response.status}`,
        );
      }
    } catch (error) {
      if (config.debug) {
        console.warn('[PACT] Error capturing response:', error);
      }
    }
  });

  isInitialized = true;

  if (config.debug) {
    console.log('[PACT] Adapter initialized');
  }
}

/**
 * Convenience object for test usage
 */
export const pactAdapter = {
  /**
   * Mark the start of a new test
   */
  newTest(): void {
    // Clear pending requests from previous test
    pendingRequests.clear();
  },

  /**
   * Verify the test completed
   */
  verifyTest(): void {
    // Check for any pending requests that didn't complete
    if (pendingRequests.size > 0 && config.debug) {
      console.warn(`[PACT] ${pendingRequests.size} requests did not complete`);
    }
    pendingRequests.clear();
  },

  /**
   * Clear all recorded interactions
   */
  clear(): void {
    interactions = [];
    pendingRequests.clear();
  },

  /**
   * Report pacts using WTR's executeServerCommand API (preferred) or console.log (fallback)
   *
   * executeServerCommand provides direct browser-to-Node.js communication via WebSocket,
   * avoiding the fragility of parsing console.log output.
   */
  async reportPacts(): Promise<void> {
    if (interactions.length === 0) {
      return;
    }

    // Group interactions by provider
    const byProvider: Record<string, Omit<PactInteraction, '_provider'>[]> = {};
    for (const interaction of interactions) {
      const { _provider, ...cleanInteraction } = interaction;
      const provider = _provider || 'unknown';
      if (!byProvider[provider]) {
        byProvider[provider] = [];
      }
      byProvider[provider].push(cleanInteraction);
    }

    // Try to dynamically import executeServerCommand from @web/test-runner-commands
    let executeServerCommand: ((command: string, payload: any) => Promise<any>) | null = null;
    try {
      const commands = await import('@web/test-runner-commands');
      executeServerCommand = commands.executeServerCommand;
    } catch {
      // Not available - will use console.log fallback
      if (config.debug) {
        console.log('[PACT] executeServerCommand not available, using console.log fallback');
      }
    }

    // Create and report pact files for each provider
    for (const [provider, providerInteractions] of Object.entries(byProvider)) {
      const pactFile: PactFile = {
        consumer: { name: config.consumer },
        provider: { name: provider },
        interactions: providerInteractions,
        metadata: {
          pactSpecification: { version: '3.0.0' },
          client: { name: 'pact-msw-adapter-wtr', version: '1.0.0' },
        },
      };

      // Try executeServerCommand first (WTR plugin), fallback to console.log (WTR reporter)
      if (executeServerCommand) {
        try {
          await executeServerCommand('pact:report', pactFile);
          if (config.debug) {
            console.log(`[PACT] Reported via executeServerCommand: ${provider}`);
          }
        } catch (error: any) {
          // Fallback to console.log if executeServerCommand fails
          if (config.debug) {
            console.log(`[PACT] executeServerCommand failed, using fallback: ${error.message}`);
          }
          const filePath = `./pacts/${config.consumer}-${provider}.json`;
          console.log(`[PACT-ADAPTER] FILE ${filePath} ${JSON.stringify(pactFile)}`);
        }
      } else {
        // Fallback: Log in format the reporter can parse
        const filePath = `./pacts/${config.consumer}-${provider}.json`;
        console.log(`[PACT-ADAPTER] FILE ${filePath} ${JSON.stringify(pactFile)}`);
      }
    }

    // Clear interactions after reporting
    interactions = [];
  },
};

/**
 * Get the current Pact adapter for direct access
 */
export function getPactAdapter() {
  return pactAdapter;
}
