var requirejs = require('requirejs');
requirejs.config({
	baseUrl: './',
    nodeRequire: require,
    paths: {
        'jasmine': 'spec/vendor/jasmine-1.3.1/jasmine'
    }
});

jasmine = require('jasmine-node');
util = require('util');

// Mutates global jasmine object :-/
require('jasmine-reporters');

// map jasmine methods to global namespace
for (key in jasmine) {
    if (jasmine[key] instanceof Function) {
        global[key] = jasmine[key];
    }
}

requirejs(['spec/spec'], function () {
    jasmine.getEnv().addReporter(new jasmine.TerminalReporter({ print: util.print, color: true }));
    jasmine.getEnv().execute();
});
