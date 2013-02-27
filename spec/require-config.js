var require = {
    paths: {
        "backbone"            : "vendor/backbone-0.9.10",
        "jquery"              : "vendor/jquery-1.8.2",
        "knockout"            : "vendor/knockout-2.2.0",
        "purl"                : "vendor/purl-2.2.1",
        "underscore"          : "vendor/underscore-1.4.3",
        "jasmine"             : "vendor/jasmine-1.3.1/jasmine",
        "jasmine-html"        : "vendor/jasmine-1.3.1/jasmine-html",
        "solidstate"          : "../solidstate"
    },
    shim: {
        "purl": {
            deps: ["jquery"],
            exports: "purl"
        },
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
    },
    deps: ['runner'] // Load and fire as soon as ready
}
