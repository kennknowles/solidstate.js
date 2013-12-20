if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'knockout',
    'underscore',
    'URIjs',
    'when',
    'zoetropic'
], function(ko, _, URI, when, z) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); };

    //contracts.enabled(false);

    // Alias extremely common knockout functions.
    // Trust me, this actually improves readability.
    var //C = contracts,
        o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); },
        die = function(msg) { throw new Error(msg); };

    // Secret value that indicates something should not bother to fetch
    var NOFETCH = "solidstate.NOFETCH";

    var transformed = function(underlyingObservable, args) {
        return c({
            read: function() { return args.read ? args.read(underlyingObservable()) : underlyingObservable(); },
            write: function(v) { return args.write ? underlyingObservable(args.write(v)) : underlyingObservable(v); }
        });
    };


    // Module Exports
    // --------------

    return {
        transformed: transformed,
        die: die,
        NOFETCH: NOFETCH
    };
});
