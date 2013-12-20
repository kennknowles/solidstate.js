if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'knockout',
    'underscore',
    'URIjs',
    'when',
    'zoetropic',
    './CollectionForZoetrope'
], function(ko, _, URI, when, z, CollectionForZoetrope) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); };

    ///// LocalCollection
    //
    // All in memory

    var LocalCollection = function(args) {
        if (!(this instanceof LocalCollection)) return new LocalCollection(args);

        args = args || {};
        var uri = args.uri || ('fake:' + Math.random(1000).toString());
        var name = args.name || '(anonymous solidstate.LocalCollection with uri '+uri+')';

        return CollectionForZoetrope({
            state: 'ready',
            debug: args.debug,
            relationships: args.relationships || {},
            data: args.data,
            zoetrope: z.LocalCollection({
                uri: uri,
                name: name,
                debug: args.debug,
                data: args.data || {},
                models: args.models,
            })
        });
    };

    return LocalCollection;
});
