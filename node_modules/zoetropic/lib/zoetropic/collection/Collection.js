if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'URIjs',
    'when',
    '../underscore.ext',
    '../link/LinkToCollection',
    '../misc'
], function(Backbone, URI, when, _, LinkToCollection, misc) {
    'use strict';

    var die = misc.die;
    
    var Collection = function(implementation) {
        if (!(this instanceof Collection)) return new Collection(implementation);

        var self = _(this).extend(implementation);

        ///// name :: String
        //
        // For debugging, etc

        self.name || '(anonymous zoetropic.Collection)';


        ///// uri :: String
        //
        // A URI for this collection that can be a URL or other.
        // It is not validated, but simply used to keep track of
        // some notion of identity.

        self.uri || die('Collection implementation missing required field `uri`.');


        ///// relationships :: {String: Relationship} 
        //
        // For each attribute of the models in the collection, there may 
        // be a relationship defined or no.
        
        _(self.relationships).isObject() || die('Collection implementation missing required field `relationships`.');

        ///// data :: {...}
        //
        // An abstract and arbitrary value that will be used by fetch

        _(self.data).isObject() || die('Collection implementation missing required field `data`');

        ///// models :: Models
        //
        // A collection of models by URI that supports intelligent
        // bulk update and relationships.

        _(self.models).isObject() || die('Collection implementation missing required field `models`');
        
        ///// fetch :: {...} -> Promise Collection
        //
        // For effective combinators, `fetch` exposes the
        // functional core of a collection. Any of the fields of
        // this collection can be overridden by the arguments

        implementation.fetch || die('Collection implementation missing required field `fetchModels`');
        self.fetch = function(options) {
            options = _({}).extend({ name: self.name, data: self.data, debug: self.debug}, options);
            return implementation.fetch(options);
        }

        ///// create :: * -> Promise Model
        //
        // Creates a new model in this collection; provided by the
        // implementation. The model will retain all added relationships
        // and subresources.

        self.create = implementation.create || die('Collection implementation missing required field `create`');
        

        // Derived surface functions & fluent combinators
        // ----------------------------------------------

        
        ///// withFields :: {...} -> Model
        //
        // The "master" combinator for overwriting fields of the Model constructor
        
        self.withFields = function(implementationFields) {
            var newFields = _({}).extend(implementation, implementationFields);

            return Collection( _({}).extend(newFields, {
                fetch: function(options) {
                    return self.fetch( _({}).extend({ name: newFields.name, uri: newFields.uri }, options) );
                }
            }))
                                           
        };
        
        
        ///// relatedCollection :: String -> Collection
        //
        // The collection reached by following the link implied by the
        // provided attribute.

        self.relatedCollection = function(attr) { 
            var rel = self.relationships[attr] || die('No known relationship for ' + self.name + ' via attribute ' + attr);
            return rel.link.resolve(self).withFields({ name:  self.name + '.' + attr });
        };
        
       
        ///// overlayData :: Observable {*} -> Collection
        //
        // A Collection with current data overlayed with that provided.
        // Generally intended to express additional filters.
        
        self.overlayData = function(additionalData) { 
            var combinedData = _({}).extend(self.data, additionalData);
            return self.withFields({ data: combinedData });
        };

        
        ///// overlayRelationships :: Relationships -> Collection
        //
        // This collection with additional relationships 

        self.overlayRelationships = function(additionalRelationships) {
            var combinedRelationships = _({}).extend(self.relationships, additionalRelationships);

            return self.withFields({
                models: _(self.models).mapValues(function(model) { return model.overlayRelationships(additionalRelationships); }),
                relationships: combinedRelationships 
            });
        };
                                 
        
        ///// overlayRelated :: ({String:Collection} | [String]) -> Collection
        //
        // A collection like this one but where each model will have its
        // attributes populated according to its relationships using the
        // provided collections.

        self.overlayRelated = function(relations) {

            var overlayedCollections = {};
            
            if ( _(relations).isArray() ) {
                _(relations).each(function(attribute) { 
                    overlayedCollections[attribute] = self.relatedCollection(attribute);
                });
            } else {
                overlayedCollections = relations
            }

            return self.withFields({
                models: _(self.models).mapValues(function(model) {
                    return model.overlayRelated(overlayedCollections); 
                }),

                create: function(args) {
                    return self.create(args)
                        .then(function(createdModel) {
                            return when.resolve(createdModel.overlayRelated(overlayedCollections));
                        });
                }
            });
        };
    };

    return Collection;
});
