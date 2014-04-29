if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'URIjs',
    'when'
], function(Backbone, _, URI, when) {
    'use strict';

    // Because throwing an exception is not an expression but a statement
    var die = function(msg) { throw new Error(msg); };

    // Secret value that indicates something should not bother to fetch but immediately
    // resolve its promise to an empty collection / missing model
    var NOFETCH = "zoetropic.NOFETCH";

    // Secret value where the errors that do not belong on an attribute go
    var GLOBAL_ERRORS = '__all__';

    // Really poor/basic function to make things JSON-friendly accordin to their own toJSON methods.
    var toJValue = function(value) { return JSON.parse(JSON.stringify(value)); };

    // Random Tastypie support code
    var adjustTastypieError = function(err) {
        // Sometimes it is a dictionary keyed by class name, with a list, other times, just a one-element dict with {"error": <some string>}
        if ( _( _(err).values()[0] ).isString() ) {
            var errs = {};
            errs[GLOBAL_ERRORS] = _(err).values();
            return errs;
        } else {
            return _(err).values()[0];
        }
    };

    return {
        NOFETCH: NOFETCH,
        GLOBAL_ERRORS: GLOBAL_ERRORS,
        adjustTastypieError: adjustTastypieError,
        toJValue: toJValue,
        die: die
    };
});
