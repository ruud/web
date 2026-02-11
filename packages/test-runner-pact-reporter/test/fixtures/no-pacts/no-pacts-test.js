import '../../../../../node_modules/chai/chai.js';

describe('No Pacts', function () {
  it('runs tests without generating Pact logs', function () {
    // Regular test logs - no Pact data
    console.log('Regular console.log');
    console.log('Testing something');
    console.log('[OTHER-PREFIX] Not a Pact log');

    chai.expect(1 + 1).to.equal(2);
  });

  it('another test without Pacts', function () {
    console.log('More regular logs');
    chai.expect(true).to.be.true;
  });
});
