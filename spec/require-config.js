requirejs.config({
    // The RequireJS docs advise against configuring paths to node_modules for use *in node*
    // but I for use *in the browser*, I do not know a better way.
    paths: {
        "solidstate"          : "../solidstate",

        "backbone"            : "vendor/backbone-0.9.10",
        "jquery"              : "vendor/jquery-1.8.2",
        "jasmine"             : "vendor/jasmine-1.3.1/jasmine",
        "jasmine-html"        : "vendor/jasmine-1.3.1/jasmine-html",
        "knockout"            : "vendor/knockout-2.2.0",
        "underscore"          : "vendor/underscore-1.4.3",
        "URIjs"               : "vendor/URIjs-1.10.0/URI",

        // These *should* work already since URIjs requires ./punycode, etc, but they don't...
        "punycode"            : "vendor/URIjs-1.10.0/punycode",
        "IPv6"                : "vendor/URIjs-1.10.0/IPv6",
        "SecondLevelDomains"  : "vendor/URIjs-1.10.0/SecondLevelDomains"
    },
    urlArgs: "v=" + (new Date).getTime(),
    shim: {
        "underscore": {
            exports: "_"
        },
        "backbone": {
            deps: ["underscore", "jquery"],
            exports: "Backbone"
        },
        "jasmine": {
            exports: "jasmine"
        },
        "jasmine-html": {
            deps: ["jasmine"]
        }
    }
});
