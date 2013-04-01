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

// map jasmine methods to global namespace
for (key in jasmine) {
    if (jasmine[key] instanceof Function) {
        global[key] = jasmine[key];
    }
}

requirejs(['spec/spec'], function () {
    var terminalReporter = new jasmine.TerminalReporter({ 
        print: util.print, 
        color: true,
        onComplete: function() {
            if ( this.failures_.length > 0 )
                process.exit(1);
            else
                process.exit(0);
        }
    });

    jasmine.getEnv().addReporter(terminalReporter);
    jasmine.getEnv().execute();
});
