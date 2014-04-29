if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'URIjs',
    'when',
    '../reference/ToOneReference',
    '../link/UrlLink',
    '../collection/Collection',
], function(Backbone, _, URI, when, ToOneReference, UrlLink, Collection) {
    'use strict';
    
    ///// Model
    //
    // A wrapper that performs "kick typing" on the implementation and
    // then augments it with fluent combinators.

    var Model = function(implementation) {
        if ( !(this instanceof Model) ) return new Model(implementation);

        var self = this;

        self.name = implementation.name || "(anonymous zoetropic.Model)";
        self.debug = implementation.debug || false;
        self.uri = implementation.uri || die('Model implementaion missing mandatory field `uri`');

        ///// attributes :: Attributes
        //
        // If the implementation passes in some attributes that are any sort of observable,
        // then it will be used, otherwise some fresh attributes are created.

        self.attributes = _(implementation.attributes).isObject() ? implementation.attributes : die('Model implementation missing mandatory field `attributes`');
        
        ///// errors :: {String: [String]}
        //
        // A mapping from attribute name to messages about validation problems with that attribute.
        // There is a special key __all__ that should have all of those and also global errors.

        self.errors = implementation.errors || die('Model implementation missing mandatory field `errors`');
        
        ///// relationships :: String -> Relationship
        //
        // A function that maps each attribute to the Relationship
        // between collections for that attribute.

        self.relationships = _(implementation.relationships).isObject() ? implementation.relationships : die('Model implementation missing mandatory field `relationships`');
        
        ///// fetch :: () -> Promise Model
        //
        // A promise that resolves to the current model with attributes from the backend

        self.fetch = implementation.fetch || die('Model implementation missing required field `fetch`');

        ///// save :: Attributes -> Promise Model
        //
        // A promise that resolves to the current model with attributes & errors that are now persisted.
        
        self.save = implementation.save || die('Model implementation missing required field `save`');


        // Combinators
        // -----------

        ///// withFields :: {...} -> Model
        //
        // The "master" combinator for overwriting fields of the Model constructor
        
        self.withFields = function(implementationFields) {
            return Model( _({}).extend(implementation, implementationFields) );
        };

        ///// overlayRelationships :: Relationships -> Model
        //
        // Overlays the provided relationship function to this model.

        self.overlayRelationships = function(additionalRelationships) {
            return self.withFields({ relationships: _({}).extend(self.relationships, additionalRelationships) });
        };
        
        ///// overlayAttributes :: Attributes -> Model
        //
        // A model with the provided attributes overlayed.
        
        self.overlayAttributes = function(overlayedAttributes) {
            return self.withFields({
                attributes: _({}).extend(self.attributes, overlayedAttributes)
            });
        };
        

        ///// overlayRelated :: ([String] | {String: Collection}) -> Model
        //
        //
        // If a list of attributes is provided, overlays the dereferenced
        // models according to the relationships for those attributes.
        //
        // If a dictionary is provided, uses models only from that collection,
        // (this may save a `fetch` if you have already got the related models
        // lying around handy)
        //
        // Going to take some experimentation to decide what to do when
        // fetching / saving, since the new references may not be found in
        // these collections. But initially, NOT causing refetches of the
        // collections.

        self.overlayRelated = function(relations) {
            var overlayedCollections = {};

            if ( _(relations).isObject() ) {
                overlayedCollections = relations
            } else {
                _(arguments).each(function(attribute) { 
                    overlayedCollections[attribute] = self.relatedCollection(attribute);
                });
            }

            var overlayedAttributes = {};

            _(overlayedCollections).each(function(collection, attribute) {
                var relationship = self.relationships[attribute] || { deref: ToOneReference({from: attribute}) };

                overlayedAttributes[attribute] = relationship.deref(self, collection);
            });
            
            return self.overlayAttributes(overlayedAttributes).withFields({
                fetch: function(options) {
                    return self.fetch(options)
                        .then(function(fetchedSelf) {
                            return when.resolve(fetchedSelf.overlayRelated(overlayedCollections));
                        });
                },
                
                save: function(attributes, options) {
                    // HACK: Need to add the inverse of a Reference to it, but not yet designed/implemented
                    var underlyingAttributes = _(attributes).clone();
                    _(overlayedCollections).each(function(collection, attribute) {
                        var relationship = self.relationships[attribute] || { deref: ToOneReference({from: attribute}) };
                        underlyingAttributes[attribute] = attributes[attribute].attributes.resource_uri;
                    });

                    return self.save(underlyingAttributes, options)
                        .then(function(savedSelf) {
                            return when.resolve(savedSelf.overlayRelated(overlayedCollections));
                        });
                }
            });
        };
        
        
        ///// relatedCollection :: String -> Collection
        //
        // The Collection related via the provided attribute to just this model.

        self.relatedCollection = function(attr) { 
            var justThisModelCollection = Collection({ 
                uri: 'fake:uri',
                name: self.name,
                data: {},
                create: function(creationArgs) { },
                fetch: function(data) { return when.resolve(justThisModelCollections); },
                relationships: self.relationships,
                models: _.object( [self.uri, self] )
            });

            var dst = self.relationships[attr].link.resolve(justThisModelCollection);

            return dst;
        };

        
        ///// relatedModel :: String -> Model
        //
        // The Model related via the given attribute. Most of the logic
        // is contained in `onlyModel` which extracts the only model in
        // a collection and otherwise proxies the collection's contents

        var onlyModel = function(collection) {
            var model = _(collection.models).values()[0];

            return Model({
                name:  collection.name,
                debug: collection.debug,
                uri:   'unfetched:' + collection.name,
                relationships: collection.relationships,

                fetch: function() {
                    if (model) {
                        return model.fetch();
                    } else {
                        return collection.fetch()
                            .then(function(fetchedCollection) {
                                return when.resolve(onlyModel(fetchedCollection));
                            });
                    }
                },

                save: function(attributes) {
                    if (model) {
                        return model.save()
                    } else {
                        die('Called save on an un-fetched related model. Unsure what to do!');
                    }
                },

                attributes: model ? model.attributes : {},

                errors: model ? model.errors : {}
            });
        };
        
        self.relatedModel = function(attr) { return onlyModel(self.relatedCollection(attr)); };


        ///// toJSON :: () -> JSON
        // 
        // Converts the Model to a JSON-friendly value for POST, PUT, etc.

        self.toJSON = function() {
            var result = {};
            _(self.attributes).each(function(value, key) { result[key] = value; });
            return result;
        };
        
        Object.freeze(self);

        return self;
    }

    return Model;
});
