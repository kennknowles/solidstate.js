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

    var RemoteModel = function(args) {
        return ModelForZoetrope({
            relationships: args.relationships || {},
            zoetrope: z.RemoteModel({
                uri: args.uri,
                name: args.name,
                debug: args.debug
            })
        });
    };

    return RemoteModel;
});

