/* jshint -W070 */
/* jshint -W064 */
/* jshint -W025 */
/* jshint -W055 */
/* jshint -W030 */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'when',
    './Collection',
    './CollectionForBackend',
    '../model/LocalModel'
], function(Backbone, _, when, Collection, CollectionForBackend, LocalModel) {
    'use strict';


    var LocalCollectionBackend = function(args) {
        if (!(this instanceof LocalCollectionBackend)) return new LocalCollectionBackend(args);

        var self = this;

        self.models = (args && args.models) || {};

        self.metadata = (args && args.metadata) || {};

        self.fetch = function(args) {
            var uri  = args.uri || ('fake:' + Math.random(1000).toString());
            var name = args.name || '(anonymous zoetropic.LocalCollectionBackend.fetch)';
            var data = args.data || {};

            return when.resolve({
                models: self.models,
                metadata: self.metadata
            });
        }

        self.create = function(modelArgs) {
            // If no URI passed in (the normal case) just generate one by choosing a random id
            if ( !modelArgs.attributes.resource_uri ) {
                modelArgs = _(modelArgs).clone();
                modelArgs.attributes = _(modelArgs.attributes).clone();

                if ( !modelArgs.attributes.id )
                    modelArgs.attributes.id = Math.random(1000);

                modelArgs.attributes.resource_uri = 'fake:' + modelArgs.attributes.id.toString();
            }

            return when.resolve(LocalModel(modelArgs));
        };

        return self;
    };


    ////// LocalCollection <: Collection
    //
    // A stateless collection backend that always returns the models provided
    // upon construction.

    var LocalCollection = function(args) {
        args = args || {};
        return CollectionForBackend({
            uri: args.uri || ('fake:' + Math.random(1000)),
            name: args.name || '(anonymous zoetropic.LocalCollection)',
            debug: args.debug || false,
            data: args.data || {},
            models: args.models,
            metadata: args.metadata || {},
            relationships: args.relationships || {},
            backend: LocalCollectionBackend({ 
                models: args.models || {}, 
                metadata: args.metadata || {} 
            })
        });
    };

    // Module Exports
    // ==============

    return LocalCollection;
});
