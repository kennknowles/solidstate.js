/* jshint -W070 */
/* jshint -W064 */
/* jshint -W025 */
/* jshint -W055 */
/* jshint -W030 */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'contracts-js',
    'underscore',
    'URIjs',
    'when'
], function(Backbone, contracts, _, URI, when) {
    'use strict';
    
    contracts.enabled(false);

    var C = contracts,
        die = function(msg) { throw new Error(msg); };

    _.mixin({ 
        mapValues: function (input, mapper) {
            return _.reduce(input, function (obj, v, k) {
                obj[k] = mapper(v, k, input);
                return obj;
            }, {});
        }
    });

    ///// Promise a
    //
    // then      :: a   -> Promise b
    // otherwise :: Any -> Promise c

    var Promise = function(contents) { 
        return C.object({
            then:      C.fun(contents, function() { return Promise(C.Any); }),
            otherwise: C.fun(C.Any, function() { return Promise(C.Any) })
        });
    };

    var CollectionBackend = C.object({
        fetch: C.fun(C.object({ uri: C.Str, name: C.opt(C.Str), debug: C.opt(C.Str), data: C.opt(C.object({})) }),
                     Promise(C.Any))
    });
    
    // Secret value that indicates something should not bother to fetch but immediately
    // resolve its promise to an empty collection / missing model
    var NOFETCH = "zoetropic.NOFETCH";

    // Secret value where the errors that do not belong on an attribute go
    var GLOBAL_ERRORS = '__all__';

    // Really poor/basic function to make things JSON-friendly accordin to their own toJSON methods.
    var toJValue = function(value) { return JSON.parse(JSON.stringify(value)); };

    

    
    // Random Tastypie support code
    var adjustTastypieError = function(err) {
        // Sometimes it is a dictionary keyed by class name, with a list, other times, just a one-element dict with {"error": <some string>}
        if ( _( _(err).values()[0] ).isString() ) {
            var errs = {};
            errs[GLOBAL_ERRORS] = _(err).values();
            return errs;
        } else {
            return _(err).values()[0];
        }
    };

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


    ///// LocalModel
    // 
    // A model that exists only in memory

    var LocalModel = function(args) {
        if (!(this instanceof LocalModel)) return new LocalModel(args);
        var self = this;
        args = args || {};
            
        self.uri = args.uri || ('fake:' + Math.random(1000).toString());
        self.name = args.name || "(anonymous zoetropic.LocalModel)";
        self.debug = args.debug || false;
        self.attributes = args.attributes || {};
        self.errors = args.errors || {};

        self.relationships = args.relationships || {};

        self.fetch = function(options) { return when.resolve(Model(self)); };

        self.save = function(attributes, options) { 
            var newAttributes = attributes || {};
            return when.resolve(Model(self).withFields({ attributes: newAttributes })); 
        };

        Object.freeze(self);

        return Model(self);
    };

        
    ///// RemoteModel
    //
    // A model that is fetched from the provided URI

    var RemoteModel = function(args) {
        if (!(this instanceof RemoteModel)) return new RemoteModel(args);

        var self = this;
        
        self.uri = args.uri;
        self.name = args.name;
        self.debug = args.debug || false;
        self.relationships = args.relationships || {};

        self.attributes = args.attributes || {};
        self.errors = args.errors || {};

        // Dependency Injection
        var BB = args.Backbone || Backbone;
        var BBModelClass = BB.Model.extend({ url: self.uri });

        var fetchWithSelf = function(self, options) {
            if (self.debug) console.log( (options && options.name) || self.name, '-->');
            var doneFetching = when.defer();
            var bbModel = new BBModelClass();

            bbModel.fetch({ 
                success: function(model, response, options) { 
                    doneFetching.resolve(Model(self).withFields({
                        attributes: model.attributes
                    }))
                },
                error: function(model, xhr, options) {
                    doneFetching.reject(); // TODO: errors
                }
            });

            return doneFetching.promise;
        };

        var saveWithSelf = function(self, attributes, options) {
            if (self.debug) console.log( (options && options.name) || self.name, '==>', attributes);
            var doneSaving = when.defer();
            
            var bbModel = new BBModelClass(attributes);

            bbModel.save({}, { 
                success: function(model, response, options) {
                    // Errors?
                    doneSaving.resolve(self); 
                },

                error: function(model, xhr, options) { 
                    var err = JSON.parse(xhr.responseText);
                    doneSaving.reject(adjustTastypieError(err));
                }
            });

            return doneSaving.promise;
        };
        
        self.fetch = function(options) { return fetchWithSelf(self, options); }

        self.save = function(attributes, options) { return saveWithSelf(self, attributes, options); }
        
        return Model(self);
    };


    ///// Collection
    //
    // A wrapper that performs "kick typing" on the implementation and
    // then augments it with fluent combinators.

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
            options = _({}).extend({ name: self.name, data: self.data, debug: self.data}, options);
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

    ////// LocalCollection <: Collection
    //
    // A stateless collection backend that always returns the models provided
    // upon construction.

    var LocalCollectionBackend = C.guard(C.fun(C.Any, CollectionBackend), function(args) {
        if (!(this instanceof LocalCollectionBackend)) return new LocalCollectionBackend(args);

        var self = this;

        self.models = (args && args.models) || {};

        self.fetch = function(args) {
            var uri  = args.uri || ('fake:' + Math.random(1000).toString());
            var name = args.name || '(anonymous zoetropic.LocalCollectionBackend.fetch)';
            var data = args.data || {};
            
            return when.resolve(self.models);
        }

        self.create = function(modelArgs) { return when.resolve(LocalModel(modelArgs)); };

        return self;
    });


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

            if (_(data).any(function(v) { return v === NOFETCH; })) {
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

            options = _({}).extend(defaults, options)

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
            backend: LocalCollectionBackend()
        });
    }

    ///// Link = { resolve: Collection -> Collection }
    //
    // The simplest sort of link is a URI, a pointer. However, even a
    // URI may be relative, hence takes a "source" location as an
    // implicit input. And much more complex links arise in
    // efficiently moving from a _set_ of fetched models to another
    // set of fetched models. Hence, a link is a function from a
    // Collection to another Collection.
    
    var Link = function(implementation) {
        if (!(this instanceof Link)) return new Link(implementation);

        var self = this;

        self.resolve = implementation.resolve || die('Link implementation missing required field `resolve`');

        return self;
    };

    ///// LinkToCollection :: Collection -> Link
    //
    // A constant link that ignores its input and returns the provided destination collection
    
    var LinkToCollection = function(destination) {
        (destination && _(destination).has('models')) || die('Collection provided to `LinkToCollection` missing required field `models`:' + destination);

        return Link({
            resolve: function(sourceCollection) {
                return destination;
            }
        });
    };

    ///// FilterLink :: { String: Model -> String|Number } -> (Link -> Link)
    //
    // The same as the input link, but adds filters based on a dictionary
    // of input functions. It combines the values from all the models
    // into a single filter.
    
    var FilterLink = function(filters) {
        filters || die('Missing required arg `filters` for FilterLink');

        return function(link) {
            link    || die('Missing required arg `link` for FilterLink');

            return Link({ 
                resolve: function(sourceCollection) {
                    var target = link.resolve(sourceCollection);
                    
                    var targetData = {};
                    _(filters).each(function(fn, key) {
                        var vals = _.chain(sourceCollection.models)
                            .values()
                            .map(fn)
                            .filter(function(v) { return _(v).isString() || _(v).isNumber(); }) 
                            .uniq()
                            .value()
                            .sort();
                        
                        if ( _(vals).isEmpty() ) vals = NOFETCH;
                            
                        targetData[key] = vals;
                    });
                        
                    // And... danger / hardcoding for tastypie for now (can actually be easily expressed in the client code, but verbose)
                    targetData.limit = 0;
                    
                    return target.overlayData(targetData);
                }
            });
        };
    };
        
        // FromOneFilterLink :: {from:String, to: String, transform: * -> *} -> (Link -> Link)
        //
    // Creates a filter on the target's `to` attribute by transforming the source's `from` attribute.
    //
    var FromOneFilterLink = function(args) {
        var from      = args.from      || 'id',
            transform = args.transform || function(x) { return x; },
            to        = args.to;

        var filters = {};
        filters[to] = function(model) { return transform(model.attributes[from]); };
        
        return FilterLink(filters);
    };
    
    // UrlLink :: {from:String} -> (Link -> Link)
    //
    // Uses the `from` attribute of each model in the source collection
    // as the URL for a model in the destination collection. Currently
    // hard-coded to Tastypie/Rails style URLs where the ID is the final
    // non-empty segment of the path, so querystring do not get too large.
    var UrlLink = function(args) {
        return FromOneFilterLink({
            from:      args.from || die('No attribute provided for UrlLink'),
            to:        'id__in',
            transform: function(uri) { 
                if (!uri) return uri; // Preserve null and undefined
                
                if (!_(uri).isString()) throw new Error('UrlLink given a property `' + args.from + '` that is not a string!');
                
                // If it ends in a slash, grab the second-to-last segment for now...
                if ( uri[uri.length - 1] === '/' )
                    return URI(uri).segment(-2);
                else
                    return URI(uri).segment(-1);
            }
        });
    };

    ////// Reference = Model -> Collection -> (Model | [Model])
    //
    // A reference complements a Link. Since the link is from collection to
    // collection, the Reference knows how get the proper value out of the 
    // destination collection and how to put it back. It may refer
    // to any piece of the model.
    //
    // A `Reference` is essentially the _dereference_ spec. It may eventually
    // have more useful methods.
    //
    var Reference = function(impl) {
        return impl;
    };
    

    ////// ToOneReference <: Reference
    //
    // The `field` in the model directly references the Url of the destination.
    
    var ToOneReference = function(args) {
        var attribute = args.from || die('Missing required args `from` for `ToOneReference`');

        return function(model, destCollection) {
            var v = model.attributes[attribute];
            return v ? destCollection.models[v] : v; 
        };
    };

    
    ///// ToManyReference <: Reference
    //
    // The `field` in the model is an array of Urls in the destination collection
    
    var ToManyReference = function(args) {
        var attribute = args.from || die('Missing required arg `from` for ToManyReference`');
        
        return function(model, destCollection) {
            var vs = model.attributes[attribute];

            var referenced = _(vs).map(function(v) { return destCollection.models[v]; });
            
            if ( _(referenced).any(function(r) { return _(r).isUndefined(); }) )
                return undefined;

            return referenced;
        };
    };

    ///// FilterReference <: Reference
    //
    // A filter reference is a "virtual" reference, not actually present on the model, but implicit
    // by filtering the target collection according to some predicate of the model.
    
    var FilterReference = function(filter) {
        return function(sourceModel, destCollection) {
            _(destCollection).has('models') || die('Collection passed to FilterReference missing `models`:' + destCollection);

            return _.chain(destCollection.models)
                .values()
                .filter(function(m) { return filter(sourceModel, m); })
                .value();
        };
    };

    ///// JoinReference <: Reference
    //
    // A FilterReference where the `from` attribute and `to` attribute must match exactly.
    
    var JoinReference = function(args) {
        var from = args.from || die('Missing required argument `from` in JoinReference'),
            to   = args.to   || die('Missing required argument `to` in JoinReference');

        return FilterReference(function(source, destination) { 
            _(source).has('attributes') || die('Model `source` passed to JoinReference missing attributes:' + source + '('+source+')');
            _(destination).has('attributes') || die('Model `destination` passed to JoinReference missing attributes:' + destination +'('+destination+')');

            return source.attributes[from] === destination.attributes[to]; 
        });
    };

    // Relationship
    //
    // A `Link` for getting from one collection to another, and a `Reference` for pulling out individual models... is a complete Relationship
    //
    // Relationship = {
    //   link  :: Link
    //   deref :: Reference
    // }

    
    ///// Api
    //
    // TODO: combinators to add collections and relationships

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

    ///// LocalApi <: Api
    //
    // Just in-memory, must have its collections provided

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
        
    ///// RemoteApi <: Api
    //
    // An Api that can be discovered via a HATEOS-style fetch from a root Url.

    var RemoteApi = function(args) {
        if (!(this instanceof RemoteApi)) return new RemoteApi(args);

        var self = this;

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

        var BBModelClass = Backbone.Model.extend({ url: self.uri });

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


    // Module Exports
    // ==============

    return {
        // Interfaces
        Model: Model,
        Collection: Collection,
        Link: Link,
        Reference: Reference,
        Api: Api,

        // Models
        LocalModel: LocalModel,
        RemoteModel: RemoteModel,

        // Collections
        LocalCollection: LocalCollection,
        RemoteCollection: RemoteCollection,

        // Backends
        LocalCollectionBackend: LocalCollectionBackend,

        // Links
        LinkToCollection: LinkToCollection,
        FilterLink: FilterLink,
        FromOneFilterLink: FromOneFilterLink,
        UrlLink: UrlLink,

        // References
        ToOneReference: ToOneReference,
        ToManyReference: ToManyReference,
        FilterReference: FilterReference,
        JoinReference: JoinReference,

        // Apis
        RemoteApi: RemoteApi,
        LocalApi: LocalApi,

        // Misc, probably "private"
        NOFETCH: NOFETCH
    };
});
