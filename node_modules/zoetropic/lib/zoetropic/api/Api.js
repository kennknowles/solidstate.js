if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'URIjs',
    'when',
    '../link/Link',
    '../link/LinkToCollection',
    '../misc'
], function(Backbone, _, URI, when, Link, LinkToCollection, misc) {
    'use strict';

    var die = misc.die;
    
    var Api = function(implementation) {
        if (!(this instanceof Api)) return new Api(implementation);

        var self = _(this).extend(implementation);

        self.uri || die('Api implementation missing required field `uri`');
        self.debug || false;
        self.name || '(anonymous zoetropic.Api)';

        ///// collections :: {String: Collection}
        //
        // A dictionary of collections by name.

        _(self.collections).isObject() || die('Api implementation missing required field `collections`');

        ///// fetch :: () -> Promise Api
        //
        // Returns a promise for the API with collections (and their schemas?) fetched from the server

        self.fetch || die('Api implementation missing required method `fetch`');


        // Combinators
        // -----------
        
        ///// withFields :: {...} -> Model
        //
        // The "master" combinator for overwriting fields of the Api constructor
        
        self.withFields = function(implementationFields) {
            return Api( _({}).extend(implementation, implementationFields) );
        };
        

        ///// overlayCollections :: {String: Collection} -> Api
        //
        // This Api with some more collections

        self.overlayCollections = function(additionalCollections) {
            return self.withFields({ collections: _({}).extend(self.collections, additionalCollections) });
        };
        
        
        ///// overlayRelationships :: {String: {String: Relationship}} -> Api
        //
        // This api with additional relationships, which are indexed by collection name then attribute.
        // Differs from the Collection.overlayRelationships in that they are passed as a dictionary.
        // This is really just a hack to make it easy to toss in a configuration JSON independent
        // of the particular Api implementation.
        //
        // The implementation looks slightly confusing because it is key that the collections
        // each have the relationships overlayed in such a way that their related collections
        // also have the overlay, so local mutation is used to create this recursion.

        self.overlayRelationships = function(additionalRelationships) {

            var newCollections = {};

            var constructedRelationships = _(additionalRelationships).mapValues(function(relationshipsForCollection, sourceName) {
                return _(relationshipsForCollection).mapValues(function(relationshipDescriptor, attribute) {

                    var linkToDestination = Link({
                        resolve: function(src) {
                            var dst = newCollections[relationshipDescriptor.collection] || die('Reference to unknown collection:' + name);
                            return LinkToCollection(dst).resolve(src).withFields({ name: src.name + '.' + attribute });
                        }
                    });

                    // Default to a UrlLink/ToOneReference so that { collection: 'name' } immedately works.
                    var deref = relationshipDescriptor.deref || ToOneReference({from: attribute});
                    var linkTransform = relationshipDescriptor.link || UrlLink({from: attribute});
                    
                    // Kick type the resulting link
                    var link = linkTransform(linkToDestination);
                    _(link).has('resolve') || die('Missing required method `resolve` for Link from `' + sourceName + '.' + attr +
                                                  '` to `' + relationshipDescriptor.collection + '`:\n' + link);
                    return {
                        collection: relationshipDescriptor.collection,
                        link: link,
                        deref: deref
                    };
                });
            });

            _(self.collections).each(function(collection, name) {
                newCollections[name] = collection.overlayRelationships(constructedRelationships[name]);
            });

            return self.withFields({
                collections: newCollections,

                fetch: function(options) { 
                    return self.fetch(options).then(function(newSelf) {
                        return when.resolve(newSelf.overlayRelationships(additionalRelationships));
                    });
                }
            });
        };

        Object.freeze(self);
        
        return self;
    };

    return Api;
});

