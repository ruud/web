import '../../../../../node_modules/chai/chai.js';

describe('No Pacts Test', function () {
  it('runs without any Pact logs', function () {
    // This test doesn't log any Pact data
    chai.expect(true).to.be.true;
  });
});
