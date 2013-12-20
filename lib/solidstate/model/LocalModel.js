if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'knockout',
    'underscore',
    'URIjs',
    'when',
    'zoetropic',
    './ModelForZoetrope'
], function(ko, _, URI, when, z, ModelForZoetrope) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); };

    ///// LocalModel
    // 
    // A model that exists only locally

    var LocalModel = function(args) {
        args = args || {};
        return ModelForZoetrope({
            state: 'ready',
            relationships: args.relationships || {},
            zoetrope: z.LocalModel({
                uri: args.uri || ('fake:' + Math.random(1000).toString()),
                name: args.name || "(anonymous solidstate.LocalModel)",
                debug: args.debug || false,
                attributes: args.attributes
            })
        });
    };

    return LocalModel;
});
