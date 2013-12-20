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

    ///// RemoteCollection
    //
    // A collection fetched over HTTP from its URI (which is thus a URL)
    // and which saves & creates new models via PUT and POST.

    var RemoteCollection = function(args) {
        args = args || {};

        var name = args.name || '(anonymous solidstate.RemoteCollection)';

        var zoetropicRemoteCollection = z.RemoteCollection({
            uri: args.uri,
            data: args.data,
            name: name + '[.zoetrope]',
            debug: args.debug || false,
            Backbone: args.Backbone
        });

        return CollectionForZoetrope({
            uri: args.uri,
            zoetrope: zoetropicRemoteCollection,

            name: name,
            data: args.data || {},
            debug: args.debug || false,
            state: 'initial',
            relationships: args.relationships || {},
            models: args.models
        });
    }

    return RemoteCollection;
});

