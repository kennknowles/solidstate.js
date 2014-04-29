if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'URIjs',
    'when',
    './Api',
    '../collection/RemoteCollection',
    '../misc'
], function(Backbone, _, URI, when, Api, RemoteCollection, misc) {
    'use strict';

    var die = misc.die;
    
    var RemoteApi = function(args) {
        if (!(this instanceof RemoteApi)) return new RemoteApi(args);

        var self = this;
        args = args || {};
        var BB = args.Backbone || Backbone;

        self.uri = args.uri || die('Missing required argument `uri` for RemoteApi');

        self.debug = args.debug || false;
        self.collections = args.collections || {};
        self.name = args.name || '(anonymous zoetropic.RemoteApi)';
        self.relationships = args.relationships || {};

        ///// fetch
        //
        // Fetches the collections from the server and adds them. Currently does not remove
        // collections.
        //
        // The API metadata endpoint (a la Tastypie) is implemented as a Backbone model
        // where each attribute is a resource endpoint.

        var BBModelClass = BB.Model.extend({ url: self.uri });

        self.fetch = function(options) {
            var doneFetching = when.defer();
            var bbModel = new BBModelClass();

            if (self.debug) console.log((options && options.name) || self.name, '-->', self.uri);
            
            bbModel.fetch({
                success: function(bbModelFromServer, response) { 
                    if (self.debug) console.log((options && options.name) || self.name, '<--', self.uri);
                    
                    var additionalCollections = _(bbModelFromServer.attributes).mapValues(function(metadata, name) {
                        return RemoteCollection({ 
                            name: name,
                            debug: self.debug,
                            uri: metadata.list_endpoint,
                            schema_url: metadata.schema
                        });
                    });

                    doneFetching.resolve(Api(self).overlayCollections(additionalCollections));
                },
                error: function() {
                    doneFetching.reject();
                }
            });

            return doneFetching.promise;
        };

        return Api(self).overlayRelationships(self.relationships);
    };

    return RemoteApi;
});
