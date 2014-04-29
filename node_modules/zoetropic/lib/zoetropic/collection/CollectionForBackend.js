if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'URIjs',
    'when',
    '../misc',
    './Collection'
], function(Backbone, _, URI, when, misc, Collection) {
    'use strict';

    var die = misc.die;

    var CollectionForBackend = function(args) {
        var self = {};

        var backend = args.backend || die('Missing required arg `backend` for ColletoinForBackend');

        self.uri = args.uri || die('Missing required args `uri` for CollectionsForBackend');
        self.name = args.name || '(anonymous zoetropic.CollectionForBackend)';
        self.debug = args.debug || false;
        self.data = args.data || {};
        self.models = args.models || {};
        self.metadata = args.metadata || {};
        self.relationships = args.relationships || {};

        ////// fetch :: () -> Collection
        //
        // Returns a new collection just like this one but with the models retrieved from the backend
        
        self.fetch = function(options) {
            var defaults = { uri: self.uri, name: self.name, debug: self.debug, data: self.data };

            options = _({}).extend(defaults, options);

            return when(backend.fetch(options))
                .then(function (fetchedResult) {
                    return CollectionForBackend({
                        backend: backend,
                        uri: self.uri,
                        name: self.name,
                        debug: self.debug,
                        data: self.data,
                        metadata: fetchedResult.metadata,
                        models: fetchedResult.models,
                        relationships: self.relationships
                    });
                });
        };

        ////// create :: {...} -> Promise Model
        //
        // Return a new model in this collection.
        // TODO: Be very liberal about optional args w/ overwrite/defaults, etc.
        
        self.create = function(args) { 
            return backend.create({ 
                uri: self.uri, 
                name: self.name, 
                debug: self.debug, 
                attributes: args.attributes 
            });
        };

        return Collection(self);
    }

    return CollectionForBackend;
});
