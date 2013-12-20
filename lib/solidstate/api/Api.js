if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'knockout',
    'underscore',
    '../link/Link',
    '../link/UrlLink',
    '../link/LinkToCollection',
    '../reference/ToOneReference',
], function(ko, _, Link, UrlLink, LinkToCollection, ToOneReference) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); };

    ///// Api (interface)
    //
    // A root of the remote Api that contains the collections and relationships 
    // between them. Explicitly designed to support dynamic remote apis.

    var Api = function(implementation) {
        if (!(this instanceof Api)) return new Api(implementation);

        var self = _(this).extend(implementation);

        self.uri || die('Api implementation missing required field `uri`');
        self.fetch || die('Api implementation missing required field `fetch`');
        _(self.collections).isObject() || die('Api implementation missing required field `collections');
        self.state || die('Api implementation missing required field `state`');

        // Combinators
        // -----------

        ///// withFields :: overrides -> Collection
        //
        // The "master" combinator for overwriting fields of the Api constructor
        
        self.withFields = function(implementationFields) {
            return Api( _({}).extend(implementation, implementationFields) );
        }

        ///// overlayRelationships :: {String: {String: Relationship}} -> Api
        //
        // Adds relationships to all the collections in this api, by name,
        // and by attribute.
        
        self.overlayRelationships = function(additionalRelationships) {
            var newSelf = self.withFields({
                relationships: additionalRelationships,

                fetch: function() {
                    self.fetch();
                    return newSelf;
                },

                collections: c(function() {

                    var newCollections = {};

                    var constructedRelationships = _(additionalRelationships).mapValues(function(relationshipsForCollection, sourceName) {
                        return _(relationshipsForCollection).mapValues(function(relationshipDescriptor, attribute) {
                            
                            var linkToDestination = Link({
                                resolve: function(src) {
                                    var dst = newCollections[relationshipDescriptor.collection] || die('Reference to unknown collection: ' + relationshipDescriptor.collection);
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
                    
                    _(u(self.collections)).each(function(collection, name) {
                        newCollections[name] = collection.withRelationships(constructedRelationships[name]);
                    });

                    return newCollections;
                })
            });

            return newSelf;
        };

        return self;
    };

    return Api;
});
