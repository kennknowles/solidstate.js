var requirejs = require('requirejs');

var solidstatePath = process.env.SOLIDSTATE_PATH || 'src/solidstate';

requirejs.config({
    baseUrl: '.',
    nodeRequire: require,
    paths: {
        'solidstate': solidstatePath
    }
});

// Load the module, which disables contracts, then turn them on during testing
requirejs('solidstate');
var contracts = require('contracts-js');
contracts.enabled(true);

/* 
   Only the use of `requirejs :: String -> Module` is synchronous, 
   which is necessary for mocha to work properly.

   Do not attempt to use `requirejs :: [String] -> ([Module] -> Module) -> ()`
*/
requirejs('spec/spec');

