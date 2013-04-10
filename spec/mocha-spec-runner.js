var requirejs = require('requirejs');
requirejs.config({
    baseUrl: '.',
    nodeRequire: require
});

/* 
   Only the use of `requirejs :: String -> Module` is synchronous, 
   which is necessary for mocha to work properly.

   Do not attempt to use `requirejs :: [String] -> ([Module] -> Module) -> ()`
*/
requirejs('spec/spec');
