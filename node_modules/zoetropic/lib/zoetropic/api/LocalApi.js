if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'underscore',
    'when',
    './Api',
    '../collection/Collection',
    '../link/UrlLink',
    '../reference/ToOneReference',
    '../misc'
], function(_, when, Api, Collection, UrlLink, ToOneReference, misc) {
    'use strict';

    var die = misc.die;
    
    var LocalApi = function(args) {
        if (!(this instanceof LocalApi)) return new LocalApi(args);

        var self = this;

        self.uri = args.uri || ('fake:' + Math.random());
        self.debug = args.debug || false;
        self.name = args.name || '(anonymous zoetropic.LocalApi)';
        self.fetch = args.fetch || function(options) { return when.resolve(Api(self)); };
        self.collections = args.collections || {};
        self.relationships = _(args.relationships || {}).mapValues(function(relationshipsForCollection) {
            return _(relationshipsForCollection).mapValues(function(relationship, attribute) {
                return {
                    collection: relationship.collection,
                    link: relationship.link || UrlLink({from: attribute}),
                    deref: relationship.deref || ToOneReference({from: attribute})
                };
            });
        });

        return Api(self).overlayRelationships(self.relationships);
    };

    return LocalApi;
});

