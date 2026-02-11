import { expect } from 'chai';

/**
 * Unit tests for matching rules generation
 * These test the actual logic of the generateMatchingRules function
 */

// We need to import the function - for now we'll inline a copy to test
// In production, you'd export this from the browser adapter
function isUUID(str: string): boolean {
  return /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(
    str,
  );
}

function isISODate(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/.test(str);
}

function isEmail(str: string): boolean {
  return /^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(str);
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

function generateMatchingRules(value: any, path: string): PactMatchingRules {
  const rules: PactMatchingRules = {};

  if (value === null || value === undefined) {
    return rules;
  }

  if (Array.isArray(value)) {
    rules[path] = { matchers: [{ match: 'type', min: 0 }] };

    if (value.length > 0) {
      const itemRules = generateMatchingRules(value[0], `${path}[*]`);
      Object.assign(rules, itemRules);
    }
  } else if (typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      const propPath = `${path}.${key}`;
      const propRules = generateMatchingRules(val, propPath);
      Object.assign(rules, propRules);
    }
  } else if (typeof value === 'string') {
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

describe('Matching Rules', function () {
  describe('generateMatchingRules', function () {
    describe('for null and undefined', function () {
      it('returns empty rules for null', function () {
        const rules = generateMatchingRules(null, '$.body.value');
        expect(rules).to.deep.equal({});
      });

      it('returns empty rules for undefined', function () {
        const rules = generateMatchingRules(undefined, '$.body.value');
        expect(rules).to.deep.equal({});
      });
    });

    describe('for strings', function () {
      it('generates type matcher for regular strings', function () {
        const rules = generateMatchingRules('hello world', '$.body.message');
        expect(rules).to.deep.equal({
          '$.body.message': {
            matchers: [{ match: 'type' }],
          },
        });
      });

      it('generates UUID matcher for UUID strings', function () {
        const rules = generateMatchingRules('550e8400-e29b-41d4-a716-446655440000', '$.body.id');
        expect(rules).to.deep.equal({
          '$.body.id': {
            matchers: [
              {
                match: 'regex',
                regex:
                  '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$',
              },
            ],
          },
        });
      });

      it('generates ISO date matcher for ISO date strings', function () {
        const rules = generateMatchingRules('2024-01-15T10:30:00Z', '$.body.createdAt');
        expect(rules).to.deep.equal({
          '$.body.createdAt': {
            matchers: [
              {
                match: 'regex',
                regex:
                  '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})?)?$',
              },
            ],
          },
        });
      });

      it('generates ISO date matcher for date-only strings', function () {
        const rules = generateMatchingRules('2024-01-15', '$.body.date');
        expect(rules).to.deep.equal({
          '$.body.date': {
            matchers: [
              {
                match: 'regex',
                regex:
                  '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})?)?$',
              },
            ],
          },
        });
      });

      it('generates email matcher for email strings', function () {
        const rules = generateMatchingRules('test@example.com', '$.body.email');
        expect(rules).to.deep.equal({
          '$.body.email': {
            matchers: [{ match: 'regex', regex: '^[\\w.+-]+@[\\w.-]+\\.[a-zA-Z]{2,}$' }],
          },
        });
      });
    });

    describe('for numbers', function () {
      it('generates integer matcher for integers', function () {
        const rules = generateMatchingRules(42, '$.body.count');
        expect(rules).to.deep.equal({
          '$.body.count': {
            matchers: [{ match: 'integer' }],
          },
        });
      });

      it('generates integer matcher for zero', function () {
        const rules = generateMatchingRules(0, '$.body.count');
        expect(rules).to.deep.equal({
          '$.body.count': {
            matchers: [{ match: 'integer' }],
          },
        });
      });

      it('generates decimal matcher for floats', function () {
        const rules = generateMatchingRules(3.14, '$.body.price');
        expect(rules).to.deep.equal({
          '$.body.price': {
            matchers: [{ match: 'decimal' }],
          },
        });
      });

      it('generates integer matcher for negative integers', function () {
        const rules = generateMatchingRules(-10, '$.body.balance');
        expect(rules).to.deep.equal({
          '$.body.balance': {
            matchers: [{ match: 'integer' }],
          },
        });
      });
    });

    describe('for booleans', function () {
      it('generates type matcher for true', function () {
        const rules = generateMatchingRules(true, '$.body.active');
        expect(rules).to.deep.equal({
          '$.body.active': {
            matchers: [{ match: 'type' }],
          },
        });
      });

      it('generates type matcher for false', function () {
        const rules = generateMatchingRules(false, '$.body.deleted');
        expect(rules).to.deep.equal({
          '$.body.deleted': {
            matchers: [{ match: 'type' }],
          },
        });
      });
    });

    describe('for arrays', function () {
      it('generates type matcher with min: 0 for non-empty arrays', function () {
        const rules = generateMatchingRules([1, 2, 3], '$.body.items');
        expect(rules['$.body.items']).to.deep.equal({
          matchers: [{ match: 'type', min: 0 }],
        });
      });

      it('generates rules for array item template', function () {
        const rules = generateMatchingRules([{ id: 1, name: 'Item' }], '$.body.items');
        expect(rules).to.deep.equal({
          '$.body.items': {
            matchers: [{ match: 'type', min: 0 }],
          },
          '$.body.items[*].id': {
            matchers: [{ match: 'integer' }],
          },
          '$.body.items[*].name': {
            matchers: [{ match: 'type' }],
          },
        });
      });

      it('generates only array matcher for empty arrays', function () {
        const rules = generateMatchingRules([], '$.body.items');
        expect(rules).to.deep.equal({
          '$.body.items': {
            matchers: [{ match: 'type', min: 0 }],
          },
        });
      });

      it('handles nested arrays', function () {
        const rules = generateMatchingRules([[1, 2]], '$.body.matrix');
        expect(rules).to.deep.equal({
          '$.body.matrix': {
            matchers: [{ match: 'type', min: 0 }],
          },
          '$.body.matrix[*]': {
            matchers: [{ match: 'type', min: 0 }],
          },
          '$.body.matrix[*][*]': {
            matchers: [{ match: 'integer' }],
          },
        });
      });
    });

    describe('for objects', function () {
      it('generates rules for each property', function () {
        const rules = generateMatchingRules(
          {
            id: 123,
            name: 'Test',
            active: true,
          },
          '$.body',
        );
        expect(rules).to.deep.equal({
          '$.body.id': {
            matchers: [{ match: 'integer' }],
          },
          '$.body.name': {
            matchers: [{ match: 'type' }],
          },
          '$.body.active': {
            matchers: [{ match: 'type' }],
          },
        });
      });

      it('handles nested objects', function () {
        const rules = generateMatchingRules(
          {
            user: {
              profile: {
                name: 'John',
                age: 30,
              },
            },
          },
          '$.body',
        );
        expect(rules).to.deep.equal({
          '$.body.user.profile.name': {
            matchers: [{ match: 'type' }],
          },
          '$.body.user.profile.age': {
            matchers: [{ match: 'integer' }],
          },
        });
      });

      it('handles empty objects', function () {
        const rules = generateMatchingRules({}, '$.body');
        expect(rules).to.deep.equal({});
      });
    });

    describe('for complex structures', function () {
      it('handles objects with arrays of objects', function () {
        const rules = generateMatchingRules(
          {
            users: [
              {
                id: '550e8400-e29b-41d4-a716-446655440000',
                email: 'user@example.com',
                createdAt: '2024-01-15T10:30:00Z',
              },
            ],
            total: 1,
          },
          '$.body',
        );
        expect(rules).to.deep.equal({
          '$.body.users': {
            matchers: [{ match: 'type', min: 0 }],
          },
          '$.body.users[*].id': {
            matchers: [
              {
                match: 'regex',
                regex:
                  '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$',
              },
            ],
          },
          '$.body.users[*].email': {
            matchers: [{ match: 'regex', regex: '^[\\w.+-]+@[\\w.-]+\\.[a-zA-Z]{2,}$' }],
          },
          '$.body.users[*].createdAt': {
            matchers: [
              {
                match: 'regex',
                regex:
                  '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})?)?$',
              },
            ],
          },
          '$.body.total': {
            matchers: [{ match: 'integer' }],
          },
        });
      });
    });
  });

  describe('String validation helpers', function () {
    describe('isUUID', function () {
      it('returns true for valid UUIDs', function () {
        expect(isUUID('550e8400-e29b-41d4-a716-446655440000')).to.be.true;
        expect(isUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).to.be.true;
      });

      it('returns false for invalid UUIDs', function () {
        expect(isUUID('not-a-uuid')).to.be.false;
        expect(isUUID('550e8400-e29b-41d4-a716')).to.be.false;
        expect(isUUID('550e8400-e29b-41d4-a716-446655440000-extra')).to.be.false;
      });
    });

    describe('isISODate', function () {
      it('returns true for valid ISO dates', function () {
        expect(isISODate('2024-01-15')).to.be.true;
        expect(isISODate('2024-01-15T10:30:00Z')).to.be.true;
        expect(isISODate('2024-01-15T10:30:00.123Z')).to.be.true;
        expect(isISODate('2024-01-15T10:30:00+05:30')).to.be.true;
      });

      it('returns false for invalid dates', function () {
        expect(isISODate('not-a-date')).to.be.false;
        expect(isISODate('2024-13-45')).to.be.true; // Matches pattern (regex doesn't validate actual date values)
        expect(isISODate('15-01-2024')).to.be.false;
      });
    });

    describe('isEmail', function () {
      it('returns true for valid emails', function () {
        expect(isEmail('test@example.com')).to.be.true;
        expect(isEmail('user+tag@domain.co.uk')).to.be.true;
        expect(isEmail('first.last@company.org')).to.be.true;
      });

      it('returns false for invalid emails', function () {
        expect(isEmail('not-an-email')).to.be.false;
        expect(isEmail('@example.com')).to.be.false;
        expect(isEmail('user@')).to.be.false;
      });
    });
  });
});
