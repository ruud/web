# Test Runner Pact Reporter

Pact contract testing reporter for Web Test Runner with MSW (Mock Service Worker) integration.

This package provides both a **Node.js reporter** that writes Pact files and a **browser-side adapter** that captures MSW mocked API interactions and converts them to Pact contracts.

## Features

- 🔄 Captures MSW mocked API interactions automatically
- 📝 Generates Pact v3 contracts with flexible matching rules
- 🎯 Smart matching for UUIDs, dates, emails, and more
- 🏗️ Provider-based contract organization
- 🧹 Automatic duplicate interaction filtering
- 🔍 Debug mode for troubleshooting

## Installation

```bash
npm install --save-dev @web/test-runner-pact-reporter
```

**For Storybook integration:**

```bash
npm install --save-dev @open-wc/testing
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (Test)                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  MSW Worker captures API calls                        │ │
│  │       ↓                                                │ │
│  │  Pact Adapter converts to Pact interactions           │ │
│  │       ↓                                                │ │
│  │  Logs: [PACT-ADAPTER] FILE <path> <json>             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                   Node.js (Reporter)                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Pact Reporter parses console logs                    │ │
│  │       ↓                                                │ │
│  │  Writes Pact contract files to disk                   │ │
│  │  (one file per provider)                              │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Usage

### Step 1: Configure the Node.js Reporter

Add the reporter to your `web-test-runner.config.js`:

```js
import { pactReporter } from '@web/test-runner-pact-reporter';

export default {
  reporters: [
    pactReporter({
      outputPath: './pacts', // Directory for Pact files
      debug: true, // Enable debug logging
    }),
  ],
  // ... other config
};
```

### Step 2: Initialize the Browser Adapter

In your test setup file (e.g., `test-setup.js` or global test file):

```js
import { worker } from './mocks/browser.js'; // Your MSW worker
import { initPactAdapter, pactAdapter } from '@web/test-runner-pact-reporter/browser';

// Initialize MSW
await worker.start();

// Initialize Pact adapter with YOUR provider mappings
await initPactAdapter(worker, {
  debug: true,
  consumer: 'my-app', // Your consumer/application name

  // REQUIRED: Map URL patterns to provider service names
  // Each interaction will be grouped by provider
  providers: {
    'user-service': ['/api/users', '/api/auth', '/api/profile'],
    'product-service': ['/api/products', '/api/inventory'],
    'payment-service': ['/api/payments', '/api/checkout'],
  },
});
```

### Step 3: Use in Tests

#### Option A: Storybook Integration (Recommended)

For projects using Storybook, use the `storyFixture` helper:

```typescript
import { expect } from '@open-wc/testing';
import { storyFixture } from '@web/test-runner-pact-reporter/browser';
import { UserProfileStory, meta } from './UserProfile.stories.js';

describe('UserProfile', () => {
  it('renders and generates Pact', async () => {
    const element = await storyFixture(UserProfileStory, meta);

    // storyFixture handles everything automatically:
    // ✅ Initializes Pact adapter
    // ✅ Registers mocks from story.parameters.mocks
    // ✅ Renders story with decorators & loaders
    // ✅ Runs play function
    // ✅ Reports Pact contracts

    expect(element).to.exist;
  });
});
```

**Story example:**

```typescript
// UserProfile.stories.ts
export const UserProfileStory = {
  args: { userId: '123' },
  parameters: {
    mocks: [
      {
        url: '/api/users/123',
        method: 'GET',
        response: { id: '123', name: 'John Doe' },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector('button');
    button?.click();
  },
};

export const meta = { decorators: [...], loaders: [...] };
```

#### Option B: Manual Pact Adapter

For non-Storybook tests:

```js
import { pactAdapter } from '@web/test-runner-pact-reporter/browser';

describe('User API', () => {
  beforeEach(() => {
    pactAdapter.newTest();
  });

  afterEach(async () => {
    pactAdapter.verifyTest();
    await pactAdapter.reportPacts();
  });

  it('fetches user profile', async () => {
    // Your test that makes API calls via MSW
    const response = await fetch('/api/users/123');
    const user = await response.json();

    expect(user.id).to.equal('123');
    // Pact adapter automatically captured this interaction!
  });
});
```

## Configuration

### Configuring Provider Mappings

The most important configuration is the `providers` mapping, which tells the adapter which URLs belong to which provider services. This determines how interactions are grouped into separate Pact files.

**How it works:**

- Each API request URL is checked against the provider patterns
- If a URL contains any of the patterns, it's assigned to that provider
- Each provider gets its own Pact file: `{consumer}-{provider}.json`

**Example:**

```js
providers: {
  // Provider name: array of URL patterns to match
  'user-service': ['/api/users', '/api/auth'],
  'product-service': ['/api/products'],
}
```

**Matching:**

- Request to `/api/users/123` → Matches `'user-service'` (contains `/api/users`)
- Request to `/api/products?page=1` → Matches `'product-service'` (contains `/api/products`)
- Request to `/health` → No match, not captured

**Tips:**

- Use the most specific patterns that identify your providers
- Patterns are case-sensitive
- Patterns can be full paths or partial paths
- The first matching provider wins

### Reporter Options (Node.js)

```ts
interface PactReporterArgs {
  /** Output directory for Pact files. Defaults to './pacts' */
  outputPath?: string;

  /** Package root dir. Defaults to cwd */
  rootDir?: string;

  /** Enable debug logging */
  debug?: boolean;
}
```

### Adapter Options (Browser)

```ts
interface PactAdapterOptions {
  /** Enable debug logging */
  debug?: boolean;

  /** Consumer name for Pact contracts (default: 'web-test-runner-consumer') */
  consumer?: string;

  /**
   * Provider URL mapping (REQUIRED for capturing interactions)
   * Maps provider names to URL patterns that identify requests to that provider
   * Example: { 'user-api': ['/api/users', '/v1/users'] }
   */
  providers?: {
    [providerName: string]: string[]; // URL patterns
  };

  /** Headers to exclude from contracts (uses sensible defaults if not specified) */
  excludedHeaders?: string[];

  /** URL patterns to exclude (uses sensible defaults if not specified) */
  excludedUrlPatterns?: string[];
}
```

**Important:** You must configure the `providers` mapping to match your API endpoints. Without this configuration, no interactions will be captured.

### Default Excluded Headers

The following headers are excluded by default (typically dynamic/not useful for contracts):

- `authorization`, `cookie`, `set-cookie`
- `x-request-id`, `x-correlation-id`
- `date`, `content-length`
- `user-agent`, `accept-*`, `sec-*`
- And more...

### Default Excluded URL Patterns

The following URL patterns are excluded by default:

- `mockServiceWorker.js`
- `.js`, `.css`, `.png`, `.svg`, `.woff`, `.woff2`
- `favicon`

## Output

Pact files are written to the `outputPath` directory (default: `./pacts`), with one file per provider:

```
pacts/
├── my-app-user-service.json
├── my-app-product-service.json
└── my-app-payment-service.json
```

Each file contains Pact v3 contracts with:

- Consumer/Provider metadata
- Interactions (request/response pairs)
- Flexible matching rules (UUIDs, dates, emails, types)
- Pact specification version 3.0.0

### Example Pact File

```json
{
  "consumer": { "name": "my-app" },
  "provider": { "name": "user-service" },
  "interactions": [
    {
      "description": "request-123",
      "providerState": "",
      "request": {
        "method": "GET",
        "path": "/api/users/123",
        "headers": { "content-type": "application/json" },
        "matchingRules": {
          "$.path": { "matchers": [{ "match": "type" }] }
        }
      },
      "response": {
        "status": 200,
        "headers": { "content-type": "application/json" },
        "body": {
          "id": "123",
          "email": "user@example.com"
        },
        "matchingRules": {
          "$.body.id": { "matchers": [{ "match": "type" }] },
          "$.body.email": {
            "matchers": [
              {
                "match": "regex",
                "regex": "^[\\w.+-]+@[\\w.-]+\\.[a-zA-Z]{2,}$"
              }
            ]
          }
        }
      }
    }
  ],
  "metadata": {
    "pactSpecification": { "version": "3.0.0" },
    "client": { "name": "pact-msw-adapter-wtr", "version": "1.0.0" }
  }
}
```

## Matching Rules

The adapter automatically generates Pact v3 matching rules for:

| Type     | Matcher              | Example                              |
| -------- | -------------------- | ------------------------------------ |
| UUID     | `regex`              | `^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-...` |
| ISO Date | `regex`              | `^\d{4}-\d{2}-\d{2}T...`             |
| Email    | `regex`              | `^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$`   |
| String   | `type`               | Any string                           |
| Integer  | `integer`            | Any integer                          |
| Decimal  | `decimal`            | Any decimal number                   |
| Boolean  | `type`               | `true` or `false`                    |
| Array    | `type` with `min: 0` | Any array                            |
| Object   | Recursive matching   | All properties                       |

## API Reference

### Browser Adapter

#### `initPactAdapter(worker, options)`

Initialize the Pact adapter with an MSW worker.

#### `pactAdapter.newTest()`

Clear state before a new test.

#### `pactAdapter.verifyTest()`

Verify test completed (warns about incomplete requests).

#### `pactAdapter.clear()`

Clear all recorded interactions.

#### `pactAdapter.reportPacts()`

Send Pact contracts to Node.js reporter.

#### `getPactAdapter()`

Get the adapter instance for direct access.

## Troubleshooting

### No Pact files generated

1. Check that `debug: true` is enabled in both reporter and adapter
2. Verify MSW worker is properly initialized
3. Ensure `reportPacts()` is called after each test
4. Check console for `[PACT-ADAPTER]` and `[PACT-REPORTER]` messages

### Interactions not captured

1. **Most common issue:** Verify you've configured the `providers` mapping in `initPactAdapter()`
2. Verify URLs match the provider patterns you configured
3. Check MSW handlers are defined and working
4. Enable debug mode to see what's being captured
5. Ensure URLs aren't in the excluded patterns list

Example: If your API calls go to `/api/users/123`, you need:

```js
providers: {
  'user-service': ['/api/users']  // Pattern must match the URL
}
```

### TypeScript errors

Make sure to install dependencies and build the project:

```bash
npm install
npm run build
```

## License

MIT
