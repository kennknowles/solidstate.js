if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'knockout',
    'underscore',
    'URIjs',
    'when',
    'zoetropic',
    './ApiForZoetrope'
], function(ko, _, URI, when, z, ApiForZoetrope) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); };

    ///// LocalApi
    //
    // Just in-memory, must have its collections provided

    var LocalApi = function(args) {
        return ApiForZoetrope({
            state: 'ready',
            collections: args.collections,
            zoetrope: z.LocalApi({
                uri: args.uri,
                name: args.name,
                debug: args.debug
            })
        });
    };

    return LocalApi;
});
