require([ 
    "require",
    "mocha",
    "chai"
],
function(requirejs, mocha, chai) {
    "use strict";
    mocha.setup('bdd');
    chai.Assertion.includeStack = true;
    requirejs(['spec'], function() {
        mocha.run();
    });
});
