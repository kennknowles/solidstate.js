requirejs.config({
    // The RequireJS docs advise against configuring paths to node_modules for use *in node*
    // but I do it for use *in the browser*, because it is just the test suite
    paths: {
        "solidstate"          : "../solidstate",
    },
    packages: [
        { "name": "backbone",    "main": "backbone.js",                      "location": "../node_modules/backbone"    },
        { "name": "chai",        "main": "chai.js",                          "location": "../node_modules/chai"        },
        { "name": "knockout",    "main": "build/output/knockout-latest.js",  "location": "../node_modules/knockout"    },
        { "name": "mocha",       "main": "mocha.js",                         "location": "../node_modules/mocha"       },
        { "name": "sinon",       "main": "pkg/sinon.js",                     "location": "../node_modules/sinon"       },
        { "name": "mocha",       "main": "mocha.js",                         "location": "../node_modules/mocha"       },
        { "name": "underscore",  "main": "underscore.js",                    "location": "../node_modules/underscore"  },
        { "name": "URIjs",       "main": "URI.js",                           "location": "../node_modules/URIjs/src"   },
    ],
    shim: {
        "backbone": { 
            exports: "Backbone",
            deps: ["underscore"]
        },
        "mocha": { 
            exports: "mocha" 
        },
        "sinon": {
            exports: "sinon"
        },
        "underscore": { 
            exports: "_" 
        }
    },
    urlArgs: "v=" + (new Date).getTime()
});
