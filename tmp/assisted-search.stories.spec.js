import { expect } from '@open-wc/testing';
import { storyFixture } from './story-fixture.js';
import * as stories from '../../stories/AssistedSearch.stories.js';

const meta = stories.default;

/**
* Run Storybook play functions using web-test-runner
* Uses generic storyFixture which handles mocks, fixture, args, and play functions
*/
describe('AssistedSearch Stories - Play Functions', () => {
  // Get all named exports (stories) except 'default'
  const storyEntries = Object.entries(stories).filter(
    ([name]) => name !== 'default'
  );

  storyEntries.forEach(([storyName, story]) => {
    // Only test stories that have a play function
    if (!story.play) {
      it.skip(`${storyName} - no play function`, () => {});
      return;
    }

    it(`should pass: ${storyName}`, async () => {
      // storyFixture handles mocks, renders the story with args, and runs the play function
      const element = await storyFixture(story, meta);

      // If we get here without errors, the play function passed
      expect(element).to.exist;
    }).timeout(30000); // Increase timeout for interaction tests
  });
});
