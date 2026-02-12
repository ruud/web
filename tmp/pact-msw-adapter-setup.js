/**
 * Pact MSW Adapter Setup for Web Test Runner
 *
 * Browser-side component that captures MSW mocked API interactions and reports
 * them to Node.js for Pact contract generation.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                           HOW THIS ADAPTER WORKS                            │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 *  1. INITIALIZATION (initPactAdapter)
 *     └── Registers listeners on MSW worker events:
 *         ├── 'request:start'    → Stores pending request metadata
 *         └── 'response:mocked'  → Captures complete request/response pair
 *
 *  2. DURING TEST (automatic via MSW events)
 *     └── For each mocked API call:
 *         ├── Match URL to provider (generic mapping)
 *         ├── Extract request: method, path, headers, body, query
 *         ├── Extract response: status, headers, body
 *         └── Store as interaction with provider tag
 *
 *  3. AFTER TEST (reportPacts)
 *     └── Group interactions by provider and send to Node.js:
 *         ├── PRIMARY:  executeServerCommand('pact:report', pactFile)
 *         │             └── Direct WebSocket RPC to pact-wtr-plugin.mjs
 *         └── FALLBACK: console.log('[PACT-ADAPTER] FILE ...')
 *                       └── Parsed by pact-reporter.mjs
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                            PROVIDER URL MAPPING                             │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ Provider Name                    │ URL Pattern                              │
 * ├──────────────────────────────────┼──────────────────────────────────────────┤
 * │ <provider-name>                  │ <url-pattern>                            │
 * │ ...                              │ ...                                      │
 * └──────────────────────────────────┴──────────────────────────────────────────┘
 *
 * Note: @pactflow/pact-msw-adapter doesn't work in browser environments with
 * Web Test Runner, so this is a lightweight browser-compatible implementation.
 *
 * Usage:
 *   import { pactAdapter, initPactAdapter } from './pact-msw-adapter-setup.js';
 *
 *   // In your test setup:
 *   await initPactAdapter();
 *
 *   // Before each test:
 *   pactAdapter.newTest();
 *
 *   // After each test:
 *   pactAdapter.verifyTest();
 *   await pactAdapter.reportPacts();
 */

import { worker } from '@web/mocks/browser.js';

/**
 * Provider URL mapping
 * Maps URL patterns to provider names for Pact contracts
 */
const PROVIDERS = {
  'party-and-agreement-search-api': [
    '/v2/partyandagreementsearch',
    '/v1/partyandagreementsearch',
  ],
  'worker-permissions-api': ['/worker-permissions'],
  'representation-management-api': ['/representation-management'],
  'crossbone-api': ['/crossbone'],
};

/**
 * Headers to exclude from Pact contracts
 * These headers are typically dynamic and not useful for contract testing
 */
const EXCLUDED_HEADERS = [
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
 * URLs to exclude from Pact recording
 */
const EXCLUDED_URL_PATTERNS = [
  'mockServiceWorker.js',
  '.js',
  '.css',
  '.png',
  '.svg',
  '.woff',
  '.woff2',
  'favicon',
];

/** Consumer name */
const CONSUMER = 'consumer-name';

/** @type {Map<string, object>} Store for captured interactions by request ID */
const pendingRequests = new Map();

/** @type {object[]} Captured complete interactions */
let interactions = [];

/** @type {boolean} */
let isInitialized = false;

/** @type {boolean} */
let debugMode = false;

/**
 * Check if string is a UUID
 * @param {string} str
 * @returns {boolean}
 */
function isUUID(str) {
  return /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(str);
}

/**
 * Check if string is an ISO date
 * @param {string} str
 * @returns {boolean}
 */
function isISODate(str) {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/.test(str);
}

/**
 * Check if string is an email
 * @param {string} str
 * @returns {boolean}
 */
function isEmail(str) {
  return /^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(str);
}

/**
 * Generate Pact v3 matching rules for a value
 * This creates flexible matchers so providers don't need exact data matches
 *
 * @param {any} value - The value to generate matching rules for
 * @param {string} path - The JSON path (e.g., '$.body.id')
 * @returns {object} Matching rules object
 */
function generateMatchingRules(value, path) {
  const rules = {};

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
      rules[path] = { matchers: [{ match: 'regex', regex: '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' }] };
    } else if (isISODate(value)) {
      rules[path] = { matchers: [{ match: 'regex', regex: '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})?)?$' }] };
    } else if (isEmail(value)) {
      rules[path] = { matchers: [{ match: 'regex', regex: '^[\\w.+-]+@[\\w.-]+\\.[a-zA-Z]{2,}$' }] };
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
 * @param {string} url
 * @returns {string | null}
 */
function getProviderFromUrl(url) {
  for (const [provider, patterns] of Object.entries(PROVIDERS)) {
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
 * @param {string} url
 * @returns {boolean}
 */
function shouldExcludeUrl(url) {
  return EXCLUDED_URL_PATTERNS.some(pattern => url.includes(pattern));
}

/**
 * Filter headers, removing excluded ones
 * @param {Headers} headers
 * @returns {object}
 */
function filterHeaders(headers) {
  const filtered = {};
  headers.forEach((value, key) => {
    if (!EXCLUDED_HEADERS.includes(key.toLowerCase())) {
      filtered[key] = value;
    }
  });
  return filtered;
}

/**
 * Read body from request or response
 * @param {Request | Response} input
 * @returns {Promise<any>}
 */
async function readBody(input) {
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
 * @param {Object} options
 * @param {boolean} [options.debug=false]
 */
export async function initPactAdapter(options = {}) {
  if (isInitialized) {
    return;
  }

  debugMode = options.debug || false;

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

    if (debugMode) {
      // eslint-disable-next-line no-console
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
      const pactRequest = {
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
      let requestBody;
      if (methodsWithBody.includes(request.method.toUpperCase())) {
        requestBody = await readBody(request);
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
      const pactResponse = {
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

      const interaction = {
        description: requestId,
        providerState: '',
        request: pactRequest,
        response: pactResponse,
        _provider: pending.provider,
      };

      interactions.push(interaction);

      if (debugMode) {
        // eslint-disable-next-line no-console
        console.log(`[PACT] Response captured: ${request.method} ${url.pathname} -> ${response.status}`);
      }
    } catch (error) {
      if (debugMode) {
        // eslint-disable-next-line no-console
        console.warn('[PACT] Error capturing response:', error);
      }
    }
  });

  isInitialized = true;

  if (debugMode) {
    // eslint-disable-next-line no-console
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
  newTest() {
    // Clear pending requests from previous test
    pendingRequests.clear();
  },

  /**
   * Verify the test completed
   */
  verifyTest() {
    // Check for any pending requests that didn't complete
    if (pendingRequests.size > 0 && debugMode) {
      // eslint-disable-next-line no-console
      console.warn(`[PACT] ${pendingRequests.size} requests did not complete`);
    }
    pendingRequests.clear();
  },

  /**
   * Clear all recorded interactions
   */
  clear() {
    interactions = [];
    pendingRequests.clear();
  },

  /**
   * Report pacts using WTR's executeServerCommand API (preferred) or console.log (fallback)
   *
   * executeServerCommand provides direct browser-to-Node.js communication via WebSocket,
   * avoiding the fragility of parsing console.log output.
   */
  async reportPacts() {
    if (interactions.length === 0) {
      return;
    }

    // Group interactions by provider
    const byProvider = {};
    for (const interaction of interactions) {
      const { _provider, ...cleanInteraction } = interaction;
      const provider = _provider || 'unknown';
      if (!byProvider[provider]) {
        byProvider[provider] = [];
      }
      byProvider[provider].push(cleanInteraction);
    }

    // Try to dynamically import executeServerCommand from @web/test-runner-commands
    let executeServerCommand = null;
    try {
      // eslint-disable-next-line import/no-extraneous-dependencies
      const commands = await import('@web/test-runner-commands');
      executeServerCommand = commands.executeServerCommand;
    } catch {
      // Not available - will use console.log fallback
      if (debugMode) {
        // eslint-disable-next-line no-console
        console.log('[PACT] executeServerCommand not available, using console.log fallback');
      }
    }

    // Create and report pact files for each provider
    // eslint-disable-next-line no-await-in-loop
    for (const [provider, providerInteractions] of Object.entries(byProvider)) {
      const pactFile = {
        consumer: { name: CONSUMER },
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
          // eslint-disable-next-line no-await-in-loop
          await executeServerCommand('pact:report', pactFile);
          if (debugMode) {
            // eslint-disable-next-line no-console
            console.log(`[PACT] Reported via executeServerCommand: ${provider}`);
          }
        } catch (error) {
          // Fallback to console.log if executeServerCommand fails
          if (debugMode) {
            // eslint-disable-next-line no-console
            console.log(`[PACT] executeServerCommand failed, using fallback: ${error.message}`);
          }
          const filePath = `./pacts/${CONSUMER}-${provider}.json`;
          // eslint-disable-next-line no-console
          console.log(`[PACT-ADAPTER] FILE ${filePath} ${JSON.stringify(pactFile)}`);
        }
      } else {
        // Fallback: Log in format the reporter can parse
        const filePath = `./pacts/${CONSUMER}-${provider}.json`;
        // eslint-disable-next-line no-console
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
