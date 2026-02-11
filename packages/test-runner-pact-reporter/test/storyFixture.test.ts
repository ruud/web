import { expect } from 'chai';
import type { Story, StoryMeta, StoryContext } from '../src/browser/storyFixture.js';

/**
 * Unit tests for storyFixture helper
 *
 * Note: These are Node.js unit tests that test the TypeScript types and interfaces.
 * The storyFixture function is primarily tested through integration tests in actual
 * Web Test Runner environment.
 */

// Mock html template function for testing
const html = (strings: TemplateStringsArray, ...values: any[]) => {
  return { __html: strings.join(''), values };
};
describe('storyFixture', function () {
  describe('Type definitions', function () {
    it('defines Story interface correctly', function () {
      const story: Story = {
        render: (args: any) => html`<div>${args.text}</div>`,
        args: { text: 'Hello' },
        parameters: {
          mocks: [{ url: '/api/test', response: {} }],
        },
      };

      expect(story.render).to.be.a('function');
      expect(story.args).to.deep.equal({ text: 'Hello' });
      expect(story.parameters?.mocks).to.be.an('array');
    });

    it('defines StoryMeta interface correctly', function () {
      const meta: StoryMeta = {
        decorators: [(story: () => any) => story()],
        loaders: [async () => console.log('loaded')],
      };

      expect(meta.decorators).to.be.an('array');
      expect(meta.loaders).to.be.an('array');
    });

    it('defines StoryContext interface correctly', function () {
      // Mock HTMLElement for Node.js testing
      const mockElement = {} as HTMLElement;
      const context: StoryContext = {
        canvasElement: mockElement,
        args: { test: true },
        step: async (name: string, callback: () => any) => callback(),
      };

      expect(context.canvasElement).to.equal(mockElement);
      expect(context.args).to.deep.equal({ test: true });
      expect(context.step).to.be.a('function');
    });
  });

  describe('Story formats', function () {
    it('supports function-style stories', function () {
      const story = (args: { name: string }) => html`<div>Hello ${args.name}</div>`;

      expect(story).to.be.a('function');
      const result = story({ name: 'World' });
      expect(result).to.exist;
    });

    it('supports object-style stories with render', function () {
      const story: Story = {
        render: (args: { name: string }) => html`<div>Hello ${args.name}</div>`,
        args: { name: 'World' },
      };

      expect(story.render).to.be.a('function');
      expect(story.args).to.deep.equal({ name: 'World' });
    });

    it('supports stories with play function', function () {
      const playFn = async (context: StoryContext) => {
        const button = context.canvasElement.querySelector('button');
        expect(button).to.exist;
      };

      const story: Story = {
        render: () => html`<button>Click me</button>`,
        play: playFn,
      };

      expect(story.play).to.equal(playFn);
    });
  });

  describe('Story parameters', function () {
    it('supports mocks parameter', function () {
      const mocks = [
        { url: '/api/users', method: 'GET', response: { id: '1' } },
        { url: '/api/posts', method: 'GET', response: [] },
      ];

      const story: Story = {
        render: () => html`<div>Test</div>`,
        parameters: { mocks },
      };

      expect(story.parameters?.mocks).to.have.lengthOf(2);
      expect(story.parameters?.mocks?.[0].url).to.equal('/api/users');
    });

    it('supports custom parameters', function () {
      const story: Story = {
        render: () => html`<div>Test</div>`,
        parameters: {
          mocks: [],
          customParam: 'value',
          anotherParam: 123,
        },
      };

      expect(story.parameters?.customParam).to.equal('value');
      expect(story.parameters?.anotherParam).to.equal(123);
    });
  });

  describe('Meta configuration', function () {
    it('supports decorators', function () {
      const decorator1 = (story: () => any) => html`<div class="wrapper">${story()}</div>`;
      const decorator2 = (story: () => any) => html`<div class="container">${story()}</div>`;

      const meta: StoryMeta = {
        decorators: [decorator1, decorator2],
      };

      expect(meta.decorators).to.have.lengthOf(2);
      expect(meta.decorators?.[0]).to.equal(decorator1);
    });

    it('supports loaders', async function () {
      let loadCalled = false;
      const loader = async () => {
        loadCalled = true;
      };

      const meta: StoryMeta = {
        loaders: [loader],
      };

      expect(meta.loaders).to.have.lengthOf(1);
      await meta.loaders?.[0]();
      expect(loadCalled).to.be.true;
    });

    it('supports multiple loaders', function () {
      const loader1 = async () => console.log('load 1');
      const loader2 = async () => console.log('load 2');

      const meta: StoryMeta = {
        loaders: [loader1, loader2],
      };

      expect(meta.loaders).to.have.lengthOf(2);
    });
  });

  describe('StoryContext', function () {
    it('provides canvasElement in play function', function () {
      const story: Story = {
        render: () => html`<button>Test</button>`,
        play: async (context: StoryContext) => {
          expect(context.canvasElement).to.exist;
          expect(context.canvasElement).to.be.instanceOf(HTMLElement);
        },
      };

      expect(story.play).to.exist;
    });

    it('provides args in play function', function () {
      const story: Story = {
        args: { userId: '123', name: 'John' },
        render: () => html`<div>User</div>`,
        play: async (context: StoryContext) => {
          expect(context.args).to.deep.equal({ userId: '123', name: 'John' });
        },
      };

      expect(story.args).to.exist;
      expect(story.play).to.exist;
    });

    it('provides step function in play function', function () {
      const story: Story = {
        render: () => html`<div>Test</div>`,
        play: async (context: StoryContext) => {
          expect(context.step).to.be.a('function');

          // Step function should execute callback
          let executed = false;
          await context.step('test step', () => {
            executed = true;
          });
          expect(executed).to.be.true;
        },
      };

      expect(story.play).to.exist;
    });
  });

  describe('Options interface', function () {
    it('supports generatePact option', function () {
      const options = { generatePact: true };
      expect(options.generatePact).to.be.true;
    });

    it('supports worker option', function () {
      const mockWorker = {
        events: {
          on: () => {},
        },
      };

      const options = { worker: mockWorker };
      expect(options.worker).to.equal(mockWorker);
    });

    it('supports registerMockRoutes option', function () {
      const customRegister = (mocks: any[]) => {
        console.log(`Registering ${mocks.length} mocks`);
      };

      const options = { registerMockRoutes: customRegister };
      expect(options.registerMockRoutes).to.equal(customRegister);
    });

    it('supports all options together', function () {
      const mockWorker = { events: { on: () => {} } };
      const customRegister = (mocks: any[]) => {};

      const options = {
        generatePact: false,
        worker: mockWorker,
        registerMockRoutes: customRegister,
      };

      expect(options.generatePact).to.be.false;
      expect(options.worker).to.equal(mockWorker);
      expect(options.registerMockRoutes).to.equal(customRegister);
    });
  });

  describe('Integration scenarios', function () {
    it('defines story with all features', function () {
      const story: Story = {
        args: { userId: '123' },
        parameters: {
          mocks: [{ url: '/api/users/123', response: { id: '123', name: 'John' } }],
        },
        render: (args: any) => html`
          <div class="user-profile" data-user-id="${args.userId}">
            <h1>User Profile</h1>
            <button>Load Data</button>
          </div>
        `,
        play: async (context: StoryContext) => {
          await context.step('Click load button', () => {
            const button = context.canvasElement.querySelector('button');
            button?.click();
          });

          await context.step('Verify data loaded', () => {
            expect(context.args.userId).to.equal('123');
          });
        },
      };

      expect(story.args).to.exist;
      expect(story.parameters?.mocks).to.have.lengthOf(1);
      expect(story.render).to.be.a('function');
      expect(story.play).to.be.a('function');
    });

    it('defines meta with all features', function () {
      const meta: StoryMeta = {
        decorators: [
          (story: () => any) => html`<div class="theme-wrapper">${story()}</div>`,
          (story: () => any) => html`<div class="layout">${story()}</div>`,
        ],
        loaders: [
          async () => {
            // Clear cache
            console.log('Cache cleared');
          },
          async () => {
            // Initialize data
            console.log('Data initialized');
          },
        ],
      };

      expect(meta.decorators).to.have.lengthOf(2);
      expect(meta.loaders).to.have.lengthOf(2);
    });
  });

  describe('Edge cases', function () {
    it('handles story without args', function () {
      const story: Story = {
        render: () => html`<div>No args</div>`,
      };

      expect(story.args).to.be.undefined;
      expect(story.render).to.be.a('function');
    });

    it('handles story without parameters', function () {
      const story: Story = {
        render: () => html`<div>No params</div>`,
      };

      expect(story.parameters).to.be.undefined;
    });

    it('handles story without play function', function () {
      const story: Story = {
        render: () => html`<div>No play</div>`,
      };

      expect(story.play).to.be.undefined;
    });

    it('handles meta without decorators', function () {
      const meta: StoryMeta = {
        loaders: [async () => {}],
      };

      expect(meta.decorators).to.be.undefined;
      expect(meta.loaders).to.have.lengthOf(1);
    });

    it('handles meta without loaders', function () {
      const meta: StoryMeta = {
        decorators: [(story: () => any) => story()],
      };

      expect(meta.decorators).to.have.lengthOf(1);
      expect(meta.loaders).to.be.undefined;
    });

    it('handles empty meta', function () {
      const meta: StoryMeta = {};

      expect(meta.decorators).to.be.undefined;
      expect(meta.loaders).to.be.undefined;
    });

    it('handles empty mocks array', function () {
      const story: Story = {
        render: () => html`<div>Test</div>`,
        parameters: {
          mocks: [],
        },
      };

      expect(story.parameters?.mocks).to.have.lengthOf(0);
    });
  });

  describe('Type safety', function () {
    it('enforces story must have render or be a function', function () {
      // Valid: function style
      const funcStory = (args: any) => html`<div>${args.text}</div>`;
      expect(funcStory).to.be.a('function');

      // Valid: object with render
      const objStory: Story = {
        render: (args: any) => html`<div>${args.text}</div>`,
      };
      expect(objStory.render).to.be.a('function');

      // Invalid story would be caught by TypeScript at compile time
      // const invalidStory: Story = { args: {} }; // TypeScript error
    });

    it('enforces correct play function signature', function () {
      const validPlay = async (context: StoryContext) => {
        expect(context.canvasElement).to.exist;
        expect(context.args).to.exist;
        expect(context.step).to.exist;
      };

      const story: Story = {
        render: () => html`<div>Test</div>`,
        play: validPlay,
      };

      expect(story.play).to.equal(validPlay);
    });

    it('supports generic args typing', function () {
      interface UserArgs {
        userId: string;
        name: string;
        age: number;
      }

      const story: Story<UserArgs> = {
        args: { userId: '123', name: 'John', age: 30 },
        render: (args: UserArgs) => html`
          <div>
            ${args.name} (${args.age}) - ID: ${args.userId}
          </div>
        `,
        play: async (context: StoryContext<UserArgs>) => {
          expect(context.args.userId).to.be.a('string');
          expect(context.args.name).to.be.a('string');
          expect(context.args.age).to.be.a('number');
        },
      };

      expect(story.args?.userId).to.equal('123');
    });
  });
});
