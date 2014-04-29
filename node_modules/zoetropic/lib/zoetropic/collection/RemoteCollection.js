if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'URIjs',
    'when',
    './CollectionForBackend',
    '../model/RemoteModel',
    '../misc'
], function(Backbone, _, URI, when, CollectionForBackend, RemoteModel, misc) {
    'use strict';

    var die = misc.die;

    ///// RemoteCollectionBackend
    //
    // The backend for a Collection zoetrope is just a function to fetch and a function to save

    var RemoteCollectionBackend = function(args) {
        if (!(this instanceof RemoteCollectionBackend)) return new RemoteCollectionBackend(args);

        var self = this;
        args = args || {};
        var BB = args.Backbone || Backbone;

        ///// fetch :: {...} -> Promise {URI: Model}
        //
        // A promise that resolves to the models retrieved by URI

        self.fetch = function(args) {
            var uri   = args.uri   || die('Missing required arg `uri` for RemoteCollectionBackend.fetch');
            var name  = args.name  || '(anonymous zoetropic.RemoteCollectionBackend.fetch)';
            var debug = args.debug || false;
            var data  = args.data  || {};

            if (debug) console.log(name, '-->', uri, '?', data);
            
            // The special value NOFETCH is used to indicate with certainty that the result
            // of the fetch will be empty, so we should elide hitting the network. This occurs
            // somewhat often during automatic dependency propagation and is no problem.

            if (_(data).any(function(v) { return v === misc.NOFETCH; })) {
                if (debug) console.log(name, '<--', uri, '(NOFETCH)');
                return when.resolve([]);
            }
            
            // In order to be simple and stateless, we create a new Backbone Collection 
            // for each operation and perform just a single fetch, and we convert the 
            // Backbone callback style to a promise.
            
            var doneFetching = when.defer();
            
            var BBCollectionClass = BB.Collection.extend({ 
                url: uri, 
                parse: function(response) {
                    this.metadata = response.meta;
                    return response.objects; 
                } 
            });

            var bbCollection = new BBCollectionClass();
            bbCollection.fetch({ 
                traditional: true,
                data: data,
                error: function() { doneFetching.reject(); },

                success: function(collection, response) { 
                    if (debug) console.log(name, '<--', '(' + _(collection.models).size() + ' results)');

                    var fetchedResult = {
                        models: {},
                        metadata: collection.metadata
                    };

                    _(collection.models).each(function(bbModel) {
                        var uri = bbModel.get('resource_uri'); 
                        fetchedResult.models[uri] = RemoteModel({ 
                            debug: debug,
                            uri: uri, 
                            name: name + '[' + uri + ']',
                            attributes: bbModel.attributes,
                            Backbone: BB
                        });
                    });

                    doneFetching.resolve(fetchedResult);
                }
            });

            return doneFetching.promise;
        };

        ///// create :: {...} -> Promise Model
        
        self.create = function(args) { 
            var uri   = args.uri   || die('Missing required arg `uri` for RemoteCollectionBackend.fetch');
            var name  = args.name  || '(anonymous zoetropic.RemoteCollectionBackend.fetch)';
            var debug = args.debug || false;

            var doneCreating = when.defer();
            
            var payload = toJValue(LocalModel({ attributes: args.attributes }))
            if (debug) console.log(name, '==>', payload);
            
            var BBCollectionClass = BB.Collection.extend({ url: uri, parse: function(response) { return response.objects; } });
            var bbCollection = new BBCollectionClass();
            bbCollection.create(payload, {
                wait: true,
                success: function(newModel, response, options) { 
                    if (debug) console.log(name, '<==', newModel);

                    var createdModel = RemoteModel({ 
                        debug: debug,
                        uri: newModel.get('resource_uri'),
                        name: name + '[' + uri + ']',
                        attributes: newModel.attributes,
                        Backbone: BB
                    });

                    doneCreating.resolve(createdModel);
                },
                error: function(model, xhr, options) {
                    var err = JSON.parse(xhr.responseText);
                    var fixedErr = adjustTastypieError(err);
                    doneCreating.reject(fixedErr);
                }
            });
            
            return doneCreating.promise;
        }

        return self;
    };


    ///// RemoteCollection
    //
    // A collection fetched over HTTP from its URI (which is thus a URL)
    // and which saves & creates new models via PUT and POST.

    var RemoteCollection = function(args) {
        args = args || {};
        return CollectionForBackend({
            uri: args.uri,
            name: args.name || '(anonymous zoetropic.RemoteCollection)',
            debug: args.debug || false,
            data: args.data || {},
            models: args.models || {},
            metadata: args.metadata || {},
            relationships: args.relationships || {},
            backend: RemoteCollectionBackend({ Backbone: args.Backbone })
        });
    };

    //
    // Module Exports
    //
    return RemoteCollection;
});
