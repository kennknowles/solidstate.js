require([ 
    "require",
    "mocha",
],
function(requirejs, mocha) {
    mocha.setup('bdd');
    requirejs(['spec'], function() {
        mocha.run();
    });
});
