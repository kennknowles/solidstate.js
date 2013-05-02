/* jshint -W070 */
/* jshint -W064 */
/* jshint -W025 */
/* jshint -W055 */
/* jshint -W030 */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'contracts-js',
    'knockout',
    'underscore',
    'URIjs',
    'when'
], function(Backbone, contracts, ko, _, URI, when) {
    'use strict';
    
    contracts.enabled(false);

    // Alias extremely common knockout functions.
    // Trust me, this actually improves readability.
    var C = contracts,
        o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); },
        die = function(msg) { throw new Error(msg); };

    _.mixin({ 
        mapValues: function (input, mapper) {
            return _.reduce(input, function (obj, v, k) {
                obj[k] = mapper(v, k, input);
                return obj;
            }, {});
        }
    });
    
    // Secret value that indicates something should not bother to fetch
    var NOFETCH = "solidstate.NOFETCH";

    // Really poor/basic serialization
    var toJValue = function(value) { return JSON.parse(JSON.stringify(value)); };
    
    // Random Tastypie support code
    var adjustTastypieError = function(err) {
        // Sometimes it is a dictionary keyed by class name, with a list, other times, just a one-element dict with {"error": <some string>}
        if ( _(_(err).values()[0]).isString() ) {
            return {'__all__': _(err).values()};
        } else {
            return _(err).values()[0];
        }
    };

    // type observableLike = a | ko.observable a
    
    var i = C.guard(C.Num, 3);
    
    ///// Attributes
    //
    // An observable dictionary with the property that writing the whole dictionary
    // actually writes individually to each attribute.
    //
    // args :: {
    //   attributes :: String ->
    // }
    var Attributes = function(args) {
        args = args || {};
        var makeAttribute = args.makeAttribute || function(key, value) { return ko.observable(value); };

        var actualAttributes = o({});

        var wrappedAttributes = c({
            read: function() {
                return actualAttributes();
            },
            write: function(_newAttributes) {
                var keysChanged = false;
                var nextAttributes = _(actualAttributes.peek()).clone();
                var newAttributes = u(_newAttributes);

                _(newAttributes).each(function(value, key) {
                    if (_(nextAttributes).has(key)) {
                        nextAttributes[key](u(value));
                    } else {
                        nextAttributes[key] = makeAttribute(key, u(value));
                        keysChanged = true;
                    }
                });
                
                // Note that there is currently no way to remove an attribute (because that is a weird thing to do and the semantics aren't clean)

                if (keysChanged)
                    actualAttributes(nextAttributes);
            }
        });

        if ( args.attributes ) {
            wrappedAttributes( args.attributes );
        }

        return wrappedAttributes;
    };


    ///// Models
    //
    // An observable dictionary with the property that writing the whole dictionary
    // actually writes the *attributes* of each item in the dictionary, (so that
    // subscriptions to the models are maintained)
    
    var Models = function(args) {
        args = args || {};

        var actualModels = o({});

        var wrappedModels = c({
            read: function() {
                return actualModels();
            },
            write: function(_newModels) {
                var keysChanged = false;
                var nextModels = _(actualModels.peek()).clone();
                var newModels = u(_newModels);

                _(newModels).each(function(model, uri) {
                    if (_(nextModels).has(uri)) {
                        nextModels[uri].attributes(model.attributes);
                    } else {
                        nextModels[uri] = model;
                        keysChanged = true;
                    }
                });
                
                // Note that there is currently no way to remove an attribute (because that is a weird thing to do and the semantics aren't clean)

                if (keysChanged)
                    actualModels(nextModels);
            }
        });

        if ( args.models ) {
            wrappedModels( args.models );
        }
        
        return wrappedModels;
    };


    ///// Collections
    //
    //

    var Collections = function(args) {
        args = args || {};

        var actualCollections = o({});
        var debug = args.debug || false;
        
        var linkToNamedCollection = function(name, attr) {
            return new Link({
                resolve: function(src) {
                    var dst = actualCollections()[name] || die('Reference-by-name to unknown collection: ' + name);
                    
                    var resolved = LinkToCollection(dst).resolve(src);
                    if (attr)
                        resolved = resolved.withName(src.name + '.' + attr);

                    return resolved;
                }
            });
        };

        // Relationships default to UrlLink and ToOneReference

        var relationships = {}

        _(args.relationships).each(function(relationshipsByDest, sourceName) {
            _(relationshipsByDest).each(function(relationshipParams, attr) {
                relationships[sourceName] = relationships[sourceName] || {};

                var linkTransform = relationshipParams.link || UrlLink({from: attr});

                var link = linkTransform(linkToNamedCollection(relationshipParams.collection, attr));
                _(link).has('resolve') || die('Missing required method `resolve` for Link from `' + sourceName + '.' + attr + 
                                              '` to `' + relationshipParams.collection + '`:\n' + link);

                relationships[sourceName][attr] = {
                    collection: relationshipParams.collection,
                    link: link,
                    deref: relationshipParams.deref || ToOneReference({from: attr})
                }
            });
        });
       
        ///// wrappedCollections
        //
        // The returned value; a computed observable that builds the collections
        // monotonically and exposes `relationships` and `linkToNamedCollection`

        var wrappedCollections = c({
            read: function() { return actualCollections(); },
            write: function(additionalCollections) {
                if (!additionalCollections) return;

                var nextCollections = _(actualCollections()).clone();
                var collectionsDidChange = false;
                
                _(additionalCollections).each(function(collection, name) {
                    if ( !_(nextCollections).has(name) ) {
                        if (debug) console.log(' - ', name);
                        nextCollections[name] = collection.withName(name).withRelationships(function(attr) { return relationships[name][attr]; })
                    }
                    collectionsDidChange = true;
                });

                if (collectionsDidChange)
                    actualCollections(nextCollections);
            }
        });
        
        // Set the initial collections if provided
        if (args.collections)
            wrappedCollections(args.collections);

        wrappedCollections.linkToNamedCollection = linkToNamedCollection;
        wrappedCollections.relationships = relationships;

        return wrappedCollections;
    };
    
    //
    var transformed = function(underlyingObservable, args) {
        return c({
            read: function() { return args.read ? args.read(underlyingObservable()) : underlyingObservable(); },
            write: function(v) { return args.write ? underlyingObservable(args.write(v)) : underlyingObservable(v); }
        });
    };

    var State = function(underlyingObservable) {
        var self = w( underlyingObservable || ko.observable('initial') );

        var stateDeferreds = {};
        var resolveStateDeferred = function() {
            var state = self.peek();

            if ( _(stateDeferreds).has(state) ) {
                stateDeferreds[state].resolve();
                delete stateDeferreds[state];
            }
        };

        self.reaches = function(goalState) {
            if ( !_(stateDeferreds).has(goalState) ) {
                stateDeferreds[goalState] = when.defer();
            }
            var promise = stateDeferreds[goalState].promise;
            resolveStateDeferred();
            return promise;
        };

        self.subscribe(function() {
            resolveStateDeferred();
        });

        return self;
    }

    // interface Model =
    // {
    //   state           :: observable ("intial" | "ready" | "fetching" | "saving")  // read only
    //   attributes      :: observable {String: observable *}
    //   attributeErrors :: observable { String -> observable [String] } // for validation or backend errors, etc
    //   attr            :: String -> observable // Returns an observable that will read/write the attribute ONLY if present
    //
    //   fetch      :: () -> () // A wrapper on the passed-in fetch (which returns a promise) that will always write the state to "fetching" then "ready"
    //   save       :: () -> () // A wrapper on the passed-in save (which returns a promise) that will always write the state to "saving" then "ready"
    //
    //   relationships     :: String -> Relationship
    // }
    //
    // The state transitions thusly, with any network request
    // causing any response to a previous request to be ignored
    //
    // *          --[ fetch   ]--> "fetching"
    // *          --[ save    ]--> "saving"
    // "fetching" --[ success ]--> "ready"
    // "saving"   --[ success ]--> "ready"
    //
    // Most of the time, you should write code as dependent observables of the state.
    // but there is also a single 'when' function that will call back exactly once
    // the next time a particular state appears (NOT a particular event!)

    // Implementation wrapper with fluent interface ::
    // {
    //   ... any fields from implementation are copied over ...
    //   withState             :: observableLike ("ready"|"fetching"|...) -> Model    // takes the provided state unless it is "ready" then takes current
    //   withAttributes        :: observableLike {String: observableLike *} -> Model  // Overlays those attributes
    //   withSubresourcesFrom  :: {String: Collection} -> Model                       // Plugs in models from the collection using know relationships or sensible defaults
    //
    //   relatedModel      :: String -> Model       // Just looks up by URL
    //   relatedCollection :: String -> Collection  // Looks up via relationships
    //
    // }

    var Model = function(implementation) {
        if ( !(this instanceof Model) ) return new Model(implementation);

        var self = this;

        ///// name :: String
        //
        // A name used in debugging messages
        
        self.name = implementation.name || die('Model implementation missing mandatory field `name`');


        ///// state :: State ("initial" | "fetching" | "ready")
        //
        // Uses the passed-in state or creates its own. It is mandatory
        // that the state have a `reaches` method that returns a Promise ().

        self.state = implementation.state || die('Model implementation missing mandatory field `state`');


        ///// attributes :: Attributes
        //
        // If the implementation passes in some attributes that are any sort of observable,
        // then it will be used, otherwise some fresh attributes are created.

        self.attributes = implementation.attributes || die('Model implementation missing mandatory field `attributes`');

        
        ///// attributeErrors :: {String: [String]}
        //
        // A mapping from attribute name to messages about validation problems with that attribute.
        // There is a special key __all__ that should have all of those and also global errors.

        self.attributeErrors = implementation.attributeErrors || die('Model implementation missing mandatory field `attributeErrors`');

        
        ///// relationships :: String -> Relationship
        //
        // A function that maps each attribute to the Relationship
        // between collections for that attribute.

        self.relationships = implementation.relationships || function(attribute) { return undefined; };

        
        ///// fetchAttributes :: () -> Promise Attributes
        //
        // A promise that resolves to the current models attributes

        self.fetchAttributes = implementation.fetchAttributes || die('Model implementation missing required field `fetchAttributes`');


        ///// saveAttributes :: Attributes -> Promise ()
        //
        // Saves the attributes for this model to whatever backend
        
        self.saveAttributes = implementation.saveAttributes || die('Model implementation missing required field `saveAttributes`');


        // Derived & Fluent Combinators
        // ----------------------------

        
        ///// with :: overrides -> Model
        //
        // The "master" combinator for overwriting fields of the Collection constructor
        
        self.withFields = function(implementationFields) {
            return Model( _({}).extend(implementation, implementationFields) );
        };
        

        ///// withRelationships :: (String -> Relationship) -> Model
        //
        // Overlays the provided relationship function to this model.

        self.withRelationships = function(additionalRelationships) {
            return self.withFields({ relationships: function(attr) { return additionalRelationships(attr) || self.relationships(attr); } });
        };

        
        ///// withName :: String -> Model
        //
        // Replaces the current name.

        self.withName = function(name) {
            return self.withFields({ name: name });
        };
        

        ///// withState :: State -> Model
        //
        // Overlays a state on top of this model's state

        self.withState = function(state) {
            return self.withFields({
                state: c({
                    read: function() { return state() === 'ready' ? self.state() : state(); },
                    write: function(newValue) { self.state(newValue); }
                })
            });
        };



        ///// fetch :: () -> Self
        //
        // Returns this model after firing off a fetch reques
        // While the fetch is in progress, sets the state to 'fetching', after which
        // it will be restored to 'ready' unless another request intervenes.

        var nonce = null;
        var newNonce = function() { nonce = Math.random(); return nonce; };
        self.fetch = function() { 
            if (self.debug) console.log(self.name, '-->', u(self.uri));

            var myNonce = newNonce();
            var doneFetching = implementation.fetchAttributes(); 

            var priorState = self.state.peek();

            when(doneFetching)
                .then(function(attributes) {
                    if (nonce !== myNonce) return;
                    self.attributes(attributes);
                    self.state('ready');
                })
                .otherwise(function(error) {
                    if (nonce !== myNonce) return;
                    console.error(error.stack);
                    self.state(priorState);
                })

            return self; 
        };

        
        ///// save :: () -> Self
        //
        // Saves the model's attributes.

        self.save = function() { 
            var myNonce = newNonce();
            var doneSaving = implementation.saveAttributes(self.attributes); 
            
            when(doneSaving)
                .then(function() {
                    if (nonce !== myNonce) return;
                    self.state('ready');
                })
                .otherwise(function(attributeErrors) {
                    if (nonce !== myNonce) return;
                    self.attributeErrors(attributeErrors);
                    self.state('ready');
                });

            return self; 
        };


        ///// attr :: String -> Observable *
        //
        // Returns the observable state of the named attribute. If it
        // does not exist, the observable will return undefined, but if
        // it ever comes into being then the value of the observable will
        // update appropriately.

        self.attr = function(field) {
            return c({
                read: function() {
                    var attrs = self.attributes();
                    return _(attrs).has(field) ? attrs[field]() : undefined;
                },
                write: function(v) {
                    var attrs = self.attributes.peek();
                    if ( _(attrs).has(field) )
                        attrs[field](v);
                    else
                        die('Illegal write to (nonexistant) proxied attribute `' + field + '`');
                }
            });
        };

        
        ///// relatedCollection :: String -> Collection
        //
        // The Collection related via the provided attribute
        // to just this model.

        self.relatedCollection = function(attr) { 
            var justThisModelCollection = Collection({ 
                uri: 'fake:uri',
                name: self.name,
                state: self.state,
                data: o({}),
                create: function(creationArgs) { },
                fetchModels: function(data) { },
                relationships: self.relationships,
                models: c(function() { return [self]; })
            });

            var dst = self.relationships(attr).link.resolve(justThisModelCollection);
            return dst;
        };

        
        ///// relatedModel :: String -> Model
        //
        // The Model related via the given attribute.

        self.relatedModel = function(attr) {
            var coll = self.relatedCollection(attr);

            var onlyModel = c(function() {
                return _(coll.models()).values()[0];
            });

            // Wrap each of the bits of the other model into
            // a model implementation
            var modelImplementation = {
                name: coll.name,

                debug: self.debug,

                url: self.attributes()[attr],

                relationships: coll.relationships,

                state: State(c(function() { 
                    if (coll.state !== 'ready') return coll.state();
                    var model = onlyModel();
                    if (model) return model.state();
                    return 'error';
                }).extend({throttle: 1})),

                fetchAttributes: function() {
                    // If the collection has not been fetched, then
                    // we can fetch it and return the attributes of
                    // the model when ready
                    if (onlyModel()) {
                        return onlyModel().fetchAttributes();
                    } else {
                        coll.fetch();
                        ko.monitor({s: coll.state});
                        return coll.state.reaches('ready').then(function() {
                            return when.resolve(onlyModel().attributes());
                        });
                    }
                },

                saveAttributes: function(attributes) {
                    if (onlyModel())
                        return onlyModel.saveAttributes(attributes);
                },

                attributes: Attributes(), // Should be written by the wrapper :-/

                attributeErrors: o({})
            };

            return Model(modelImplementation)
        }


        ///// toJSON :: Self -> JSON
        // 
        // Converts the Model to a JSON-friendly value for POST, PUT, etc.

        self.toJSON = function() {
            var result = {};
            _(u(self.attributes)).each(function(value, key) { result[key] = u(value); });
            return result;
        };

        
        ///// withAttributes :: Attributes -> Model
        //
        // Overlays the provided attributes in the observable.
        // Reads & writes will be appropriately directly to
        // the current attributes and the overlayed attributes.
        
        self.withAttributes = function(overlayedAttributes) {
            var augmentedAttributes = c({
                read: function() {
                    var underlyingAttributesNow = self.attributes();
                    var overlayedAttributesNow = u(overlayedAttributes);
                    
                    return _({}).extend(underlyingAttributesNow, overlayedAttributesNow);
                },
                
                write: function(updatedAttributes) { 
                    var underlyingAttributesNow = self.attributes();
                    var overlayedAttributesNow = overlayedAttributes();
                    var updatedAttributesNow = u(updatedAttributes); // Attributes handles this for us, but due to the pick/omit we have to do it here too
                    
                    var overlayedKeys = _(overlayedAttributesNow).keys();
                    
                    overlayedAttributes( _(updatedAttributesNow).pick(overlayedKeys) );
                    
                    // We should never again touch attributes hidden by the overlay; in order for them
                    // not to be erased they must be set here as well.
                    self.attributes( _({}).extend(_(underlyingAttributesNow).pick(overlayedKeys),
                                                  _(updatedAttributesNow).omit(overlayedKeys)) );
                }
            });

            return self.withFields({ attributes: augmentedAttributes });
        };
        

        ///// withSubresourcesFrom :: {String: Collection} -> Model
        //
        // A model where the given attributes have their values
        // overlayed from the corresponding collections according
        // to the relationships.

        self.withSubresourcesFrom = function(subresourceCollections) {
            var overlayedAttributeDict = {};

            var overlayedAttributes = Attributes({
                // The initial values of the attributes will be ignored, because
                // all of them will cause a call to `makeAttribute` which sets up the proxying,
                // so any dictionary with the right keys is fine
                attributes: subresourceCollections,

                makeAttribute: function(field, value) {
                    // A new attribute should never be possible, so the only time this is called
                    // is on initialization, when the value can be ignored because it will be proxied.
                    var relationship = self.relationships(field) || { deref: ToOneReference({from: field}) };

                    // This observable will write to the underlying attribute properly whether it already existed or not
                    var overlayedAttribute = relationship.deref(self, subresourceCollections[field]);

                    // Set the underlying attribute immediately
                    return overlayedAttribute;
                }
            });

            var augmentedSelf = self.withAttributes(overlayedAttributes);

            var augmentedState = c(function() {
                for (var field in subresourceCollections) {
                    if ( !u(self.attributes()[field]) ) 
                        continue;

                    var val = augmentedSelf.attributes()[field]();

                    if ( !val )
                        return "fetching";

                    if ( _(val).has('state') && (val.state() !== 'ready') ) 
                        return val.state();

                    if ( _(val).isArray() ) {
                        for (var i in val) {
                            if ( _(val[i]).has('state') && (val[i].state() !== 'ready') )
                                return val[i].state();
                        }
                    }
                }
                return "ready";
            });

            return augmentedSelf.withState(augmentedState);
        };

        
        // toString :: () -> String
        //
        // Just some sort of friendly-ish string

        self.toString = function() { return 'Model()'; };

        return self;
    };

    ///// modelForBackend
    //
    // Builds a model for a backend with the remainder of the necessary fields

    var modelForBackend = function(args) {
        var implementation = {}
        
        var backend = args.backend || die('Missing required arg `backend` for ModelForBackend');

        implementation.name = args.name;
        implementation.uri = args.uri;
        implementation.debug = args.debug || false;

        implementation.fetchAttributes = backend.fetchAttributes;
        implementation.saveAttributes = backend.saveAttributes;

        implementation.state = State(args.state || 'initial');

        implementation.attributes = Attributes({ attributes: args.attributes });

        implementation.attributeErrors = o({});

        return Model(implementation);
    }


    ///// LocalModelBackend
    //
    // A ModelBackend that only has the attributes passed in to its constructor.

    var LocalModelBackend = function(args) {
        if (!(this instanceof LocalModelBackend)) return new LocalModelBackend(args);

        var self = this;
        
        self.fetchAttributes = function(data) { return when.resolve(args.attributes); };
        self.saveAttributes = function(model) { return when.resolve(); };

        return self;
    };


    ///// LocalModel
    // 
    // creates a Model from the args for a backend and some args for the model

    var LocalModel = function(args) { 
        args = args || {};
        return modelForBackend({
            uri: args.uri || ('fake:' + Math.random(1000).toString()),
            name: args.name || "(unknown)",
            debug: args.debug || false,
            state: 'ready',
            attributes: args.attributes,
            backend: LocalModelBackend(args)
        });
    };
    
   
    ///// BBWriteThroughObservable
    //
    // An observable that is bound exactly to an attribute of a Backbone.Model
    // such that writes propagate in both directions.

    var BBWriteThroughObservable = function(args) {
        var underlyingObservable = o();
        var bbModel = args.bbModel;
        var attribute = args.attribute;
        
        underlyingObservable.subscribe(function(newValue) {
            bbModel.set(attribute, newValue, { silent: true });
        });

        underlyingObservable(args.value);

        return underlyingObservable;
    };

    // Model constructor from url, data, attributes
    //
    // args ::
    // {
    //   url                :: String | ko.observable String
    //   attributes         :: {String: ??} // initial attributes
    //   relationships      :: (Collection, String) -> Collection
    // }
    var RemoteModelBackend = function(args) {
        var self = {};
        
        // Begins in 'ready' state with no attributes
        self.uri = c(function() { return u(args.uri); });
        self.state = o( _(args).has('state') ? u(args.state) : 'initial' );
        self.name = args.name || "(unknown)";
        self.debug = args.debug || false;
        self.relationships = args.relationships || function(attr) { return undefined; };
        self.attributeErrors = o({});

        var attributes = o({});

        // Dependency Injection
        var BB = args.Backbone || Backbone;

        //  Set up a private Backbone.Model to handle HTTP, etc.
        var bbModel = new (BB.Model.extend({ url: self.uri }))();
        
        self.attributes = Attributes({
            attributes: args.attributes,
            makeAttribute: function(attribute, value) {
                return BBWriteThroughObservable({ 
                    bbModel: bbModel, 
                    attribute: attribute,
                    debug: self.debug,
                    value: value
                });
            }
        });

        var bbModelClass = BB.Model.extend({ url: self.uri });
        
        // This will be mutated to correspond to the latest response; any other response will be ignored.
        var nonce = null;
        var newNonce = function() { nonce = Math.random(); return nonce; }
        
        self.saveAttributes = function(attributes) { 
            if (self.debug) console.log(self.name, '==>', attributes);

            var doneSaving = when.defer();

            var bbModel = new bbModelClass(attributes);

            bbModel.save({}, { 
                success: function() { doneSaving.resolve(); },

                error: function(model, xhr, options) { 
                    var err = JSON.parse(xhr.responseText);
                    doneSaving.reject(adjustTastypieError(err));
                }
            });

            return doneSaving.promise;
        };
        
        self.fetchAttributes = function() {
            var doneFetching = when.defer();

            var bbModel = new bbModelClass();

            bbModel.fetch({ 
                success: function(model, response) { 
                    doneFetching.resolve(model.attributes);
                }
            });

            return doneFetching.promise;
        };
        
        return self;
    };

    ///// NewModel
    //
    // A Model that has not been saved yet. It takes as parameters the attributes
    // for a local model and a function to create the new model. The model behaves
    // exactly as a LocalModel until the `create` succeeds, after which it behaves
    // as the returned Model (which will generally be a RemoteModel in practice).
    //
    // Current has a permanent (tiny) proxy overhead

    var NewModel = function(args) {
        var self = {};

        self.name = args.name || '(anonymous NewModel)';

        self.create = args.create || die('Missing required arg `create` for `NewModel`');

        self.relationships = args.relationships || function(attr) { return undefined; };

        // This state marches from initial -> saving -> ready
        var initializationState = State('initial');

        // Use an initial local model until first save, when we pass the gathered data on
        var initialModel = LocalModel({
            name: self.name,
            debug: args.debug,
            attributes: args.attributes,
        });

        var attributeErrors = o({});

        // This changes one before initializationState, so the internal bits that depend on it fire before the
        // external world gets a state change (depending on attributes() before checking state() means client is out of luck!)
        var createdModel = o(null);

        self.state = State(c(function() { return initializationState() === 'ready' ? createdModel().state() : initializationState(); }));
        
        self.attributeErrors = c(function() { return createdModel() ? createdModel().attributeErrors() : attributeErrors(); });
       
        self.attributes = c({
            read: function() { return createdModel() ? createdModel().attributes() : initialModel.attributes(); },
            write: function(attrs) { return createdModel() ? createdModel().attributes(attrs) : initialModel.attributes(attrs); }
        });
        
        self.relatedCollection = function(attr) {
            if (createdModel())
                return createdModel().relatedCollection(attr);
        };
        
        self.withRelationships = function(additionalRelationships) {
            return NewModel( _({}).extend(args, {
                relationships: function(attr) { return additionalRelationships(attr) || self.relationships(attr); }
            }));
        };

        self.fetchAttributes = function() { 
            if (createdModel())
                return createdModel().fetchAttributes(); 
            else
                return initialModel.fetchAttributes();
        };

        self.saveAttributes = function(attributes) { 
            if (initializationState() === 'ready') {
                return createdModel().saveAttributes(attributes);

            } else if (initializationState() === 'initial') {

                // Call the `create` function provided to the constructor
                var doneCreating = self.create({
                    attributes: initialModel.attributes(),
                    debug: initialModel.debug,
                    name: self.name
                });
                initializationState('saving');

                // It can return a promise or something already a value.
                // If it does not return a promise, it must raise an exception
                // to indicate the failure, so `when` will simulate a promise
                // rejection
                return when(doneCreating)
                    .then(function(actuallyCreatedModel) {
                        createdModel(actuallyCreatedModel);
                        initializationState('ready');
                        return when.resolve();
                     })
                    .otherwise(function(creationErrors) {
                        attributeErrors(creationErrors);
                        initializationState('initial');
                        return when.reject();
                    });
            } 
            return self;
        };

        return Model(self);
    };
    
    var RemoteModel = function(args) { return Model(RemoteModelBackend(args)); };

    ///// CollectionBackend
    //
    // I know it seems silly, but there *is* an interface for just the
    // methods that make up a collection, minus the fluent interface and
    // state.
    //
    // {
    //   fetch         :: data -> Promise {URI:Model}
    //   newModel      :: {String:*} -> Model
    // }

    ///// Collection
    //
    // A reactive/stateful collection of models by URI, with
    // a state machine indicating its... state.
    //
    // {
    //   state  :: State ("initial" | "ready" | "fetching" | "saving")
    //   models :: Models                              
    //
    //   fetch    :: () -> ()
    //   newModel :: {String:??} -> Model
    //   relationships      :: String -> Relationship
    //
    //   withRelatedSubresources :: [String] -> Collection
    //   withSubresourcesFrom    :: {String: Collection} -> Collection
    //   withData                 :: (data | ko.observable data) -> Collection 
    //   withRelationships        :: ( (Collection, String) -> Collection ) -> Collection
    //   withName                 :: String -> Collection
    //
    //   relatedCollection        :: String -> Collection
    // }
    //
    // The state transitions thusly, with any network request
    // causing any response to a previous request to be ignored
    //
    // *          --[ fetch   ]--> "fetching"
    // *          --[ create  ]--> "saving"
    // "fetching" --[ change  ]--> "fetching" // any change in input observables should trigger re-fetch unless state === "initial"
    // "saving"   --[ change  ]--> "fetching" 
    // "fetching" --[ success ]--> "ready"
    // "saving"   --[ success ]--> "ready"


    ///// Collection
    //
    // This is just the constructor for the fluent interface; it has no logic.
    // Required args are all the basic methods of a collection.

    var Collection = function(implementation) {
        if (!(this instanceof Collection)) return new Collection(implementation);

        var self = this;

        ///// name :: String
        //
        // For debugging, etc

        self.name = implementation.name || die('Collection implementation missing required field `name`.');


        ///// uri :: String
        //
        // A URI for this collection that can be a URL or other.
        // It is not validated, but simply used to keep track of
        // some notion of identity.

        self.uri = implementation.uri || die('Collection implementation missing required field `uri`.');


        ///// relationships :: String -> Relationship | undefined
        //
        // For each attribute of the models in the collection, there may 
        // be a relationship defined or no. It is a function rather 
        // than a dictionary to allow more implementation strategies.
        
        self.relationships = implementation.relationships || die('Collection implementation missing required field `relationships`.');


        ///// data :: Observable {String: *}
        //
        // An observable mostly intended for use in passing a dictionary of
        // querystring information for remote collections. It is actually
        // simply uninterpreted by the Collection class, but passed to
        // the underlying `fetch` implementation.

        self.data = implementation.data || die('Collection implementation missing required field `data`');

        
        ///// state :: State ("initial" | "fetching" | "ready")
        //
        // A state may be passed in via the args, in which case it will
        // take precedence over the collection's state. Use with care.
        //
        // The state *must* be writable.

        self.state = implementation.state || die('Collection implementation missing required field `state`');

        
        ///// models :: Models
        //
        // A collection of models by URI that supports intelligent
        // bulk update and relationships.

        self.models = implementation.models || die('Collection implementation missing required field `models`');


        ///// create :: * -> Promise Model
        //
        // Creates a new model in this collection; provided by the
        // implementation. The model will retain all added relationships
        // and subresources.

        self.create = implementation.create || die('Collection implementation missing required field `create`');
        
        
        ///// relatedCollection :: String -> Collection
        //
        // The collection reached by following the link implied by the
        // provided attribute.

        self.relatedCollection = function(attr) { 
            var rel = self.relationships(attr) || die('No known relationship for ' + self.name + ' via attribute ' + attr);
            return self.relationships(attr).link.resolve(self).withName(self.name + '.' + attr);
        };
        
       
        ///// fetchModels :: {:String} -> Promise {URI:Model}
        //
        // For effective combinators, `fetchModels` exposes the
        // functional core of a collection.

        self.fetchModels = implementation.fetchModels || die('Collection implementation missing required field `fetchModels`');

        
        // Derived surface functions & fluent combinators
        // ----------------------------------------------

        ///// fetch :: () -> Collection
        //
        // Calls `fetchModels` and while the promise is resolving sets
        // state to "fetching"
        
        var nonce = null;
        var newNonce = function() { nonce = Math.random(); return nonce; };
        self.fetch = function() {
            var data = _({}).extend(self.data());
            var myNonce = newNonce();
            var modelsPromise = self.fetchModels(data);

            self.state('fetching');

            when(modelsPromise)
                .then(function(modelsByUri) {
                    if (nonce !== myNonce) return;
                    self.models(modelsByUri);
                    self.state('ready');
                })
                .otherwise(function(err) {
                    if (nonce !== myNonce) return;
                    self.state('ready');
                });
            
            return self; 
        };
        self.data.subscribe(function() { if (self.state() !== "initial") self.fetch(); });

        
        ////// newModel :: creationArgs -> Model
        //
        // Returns a model that will `create` upon the
        // first save.

        self.newModel = function(modelArgs) { 
            modelArgs = modelArgs || {};
            modelArgs.attributes = modelArgs.attributes || o({});

            return NewModel({
                debug: self.debug,
                attributes: modelArgs.attributes,
                create: function(createArgs) {
                    var doneCreating = implementation.create(createArgs);

                    return when(doneCreating)
                        .then(function(createdModel) {
                            var update = {};
                            update[u(createdModel.uri)] = createdModel;
                            return when.resolve(createdModel.withRelationships(self.relationships)); 
                        });
                }
            }).withRelationships(self.relationships);
        };
        

        
        ///// with :: overrides -> Collection
        //
        // The "master" combinator for overwriting fields of the Collection constructor
        
        self.withFields = function(implementationFields) {
            return Collection( _({}).extend(implementation, implementationFields) );
        }


        ///// withData :: Observable {*} -> Collection
        //
        // A Collection with independent Models and new data but the same backend.
        
        self.withData = function(additionalData) { 
            var combinedData = c(function() { return _({}).extend(self.data(), u(additionalData)); });

            return self.withFields({ data: combinedData });
        };

        
        ///// withState :: State -> Collection
        //
        // This collection with a new notion of its state.

        self.withState = function(state) {
            return self.withFields({ state: state });
        }

        
        ///// withRelationships :: (String -> Relationship | undefined) -> Collection
        //
        // This collection with additional relationships & the same models

        self.withRelationships = function(additionalRelationships) {
            var combinedRelationships = function(attr) { return additionalRelationships(attr) || self.relationships(attr); };

            return self.withFields({
                models: c({
                    write: function(newModels) { self.models(newModels); },
                    read: function() {
                        return _(self.models()).mapValues(function(model) { return model.withRelationships(combinedRelationships); });
                    }
                }),
                relationships: combinedRelationships 
            });
        };
                                 
        
        ///// withSubresourcesFrom :: {String:Collection} -> Collection
        //
        // A collection like this one but where each model will have its
        // attributes populated according to its relationships using the
        // provided collections.

        self.withSubresourcesFrom = function(subresourceCollections) {

            var augmentedModels = c(function() {
                return _(self.models()).mapValues(function(model) { 
                    return model.withSubresourcesFrom(subresourceCollections); 
                })
            });

            var augmentedState = c({
                read: function() {
                    var m = _(augmentedModels()).find(function(m) { return m.state() !== "ready"; });
                    if ( m ) 
                        return m.state();
                    else
                        return self.state();
                },
                write: function(newValue) {
                    self.state(newValue);
                }
            });

            var augmentedCreate = function(modelArgs) {
                var m = LocalModel(modelArgs);
                var augmentedM = m.withSubresourcesFrom(subresourceCollections);
                augmentedM.attributes(modelArgs.attributes);
                return self.create(_({}).extend(modelArgs, {
                    attributes: m.attributes()
                }));
            };
            
            return self.withFields({
                state: augmentedState,
                models: augmentedModels,
                create: augmentedCreate
            });
        };
    

        ///// withName :: String -> Collection
        //
        // This collection with a new name
        
        self.withName = function(name) {
            return self.withFields({ name: name });
        };


        ///// withRelatedSubresources :: (String, ...) -> Collection
        //
        // This collection with the named attributes automatically
        // filled in with the related collections.

        self.withRelatedSubresources = function() {
            var attrs = arguments;
            var colls = {};
            _(attrs).each(function(attr) { colls[attr] = self.relatedCollection(attr).fetch(); });

            return self.withSubresourcesFrom(colls);
        };

        
        ///// withParam :: {String: *} -> Collection
        //
        // Adds a querystring parameter to the URL

        self.withParam = function(additionalParam) {
            var newURI = c(function() {
                var parsedURI = URI(u(self.uri));
                var newParam = _({}).extend( parsedURI.query(true), u(additionalParam));

                return parsedURI.query(newParam).toString();
            });

            return self.withFields({ uri: newURI });
        };
    };


    ///// collectionForBackend :: {backend:CollectionBackend, ...} -> Collection
    //
    // Converts a pure backend

    var collectionForBackend = function(args) {
        var implementation = {};

        var backend = args.backend || die('Missing required arg `backend` for CollectionForBackend');

        /////  create :: data -> Promise Model
        //
        // Delegates creation to the backend

        implementation.create = backend.create;


        ///// fetchModels :: data -> Promise {URI:Model}
        //
        // Delegates fetching the backend

        implementation.fetchModels = backend.fetchModels;

        
        ///// name, uri, debug, relationships
        //
        // Various simple parameters provided from outside
        
        implementation.uri = args.uri;
        implementation.name = args.name;
        implementation.debug = args.debug;
        implementation.relationships = args.relationships;
        implementation.data = w(args.data);
        
        ///// State
        //
        // Starts "initial"

        implementation.state = State(args.state || 'initial');
        
        ///// Models
        //
        // Models are entirely pedestrian

        implementation.models = Models({ 
            models: _.chain(u(args.models)).map(function(model, key) { return [key, model.withName(implementation.name+'['+key+']')]; }).object().value()
        });


        return Collection(implementation);
    };
    
    
    ////// LocalCollectionBackend <: CollectionBackend
    //
    // A stateless collection backend that always returns the models provided
    // upon construction.

    var LocalCollectionBackend = function(args) {
        if (!(this instanceof LocalCollectionBackend)) return new LocalCollectionBackend(args);

        var self = this;

        args = args || {};

        self.fetchModels = function(data) { return when.resolve(args.models); };
        self.create = function(modelArgs) { return when.resolve(LocalModel(modelArgs)); }

        return self;
    };

    
    ///// LocalCollection
    //
    // All in memory, built from its backend.

    var LocalCollection = function(args) {
        args = args || {};
        var uri = args.uri || ('fake:' + Math.random(1000).toString());
        var name = args.name || 'LocalCollection({uri:'+uri+'})';

        return collectionForBackend({
            uri: uri,
            name: name,
            data: args.data || {},
            state: 'ready',
            relationships: args.relationships || function(attr) { return undefined; },
            models: args.models,
            backend: LocalCollectionBackend(args)
        });
    };


    ///// RemoteCollection
    //
    // A collection fetched over HTTP from its URI (which is thus a URL)
    // and which saves & creates new models via PUT and POST.

    var RemoteCollection = function(args) {
        return collectionForBackend({
            name: args.name,
            uri: args.uri,
            data: args.data,
            state: 'initial',
            relationships: args.relationships || function(attr) { return undefined; },
            models: args.models,
            backend: RemoteCollectionBackend(args)
        });
    }

    ///// RemoteCollectionBackend
    //
    // A collection backend which fetches models from a provided URL.
    
    var RemoteCollectionBackend = function(args) {
        var self = {};
        
        self.uri = args.uri;
        self.name = args.name || "(unknown)";
        self.debug = args.debug || false;
        self.relationships = args.relationships || function(thisColl, attr) { return undefined; }; // TODO: backend should not have relationships

        var BB = args.Backbone || Backbone; // For swapping out network library if desired, and for testing

        // A private `Backbone.Collection` for dealing with HTTP/jQuery
        var BBCollectionClass = BB.Collection.extend({ 
            url: self.uri,
            parse: function(response) { return response.objects; }
        });

        // An ss.Model for an existing model fetching via the collection
        var modelInThisCollection = function(args) {
            return RemoteModel({ 
                debug: self.debug,
                uri: args.uri, 
                name: self.name + '[' + args.uri + ']',
                state: 'ready',
                attributes: args.attributes,
                Backbone: BB
            });
        };
        
        ///// create :: args -> Promise Model
        //
        // Given the arguments for creating a LocalModel, returns a promise
        // for what that model's attributes will result in when persisted to
        // the server.
        //
        // The args are really just debug, name, attributes.

        self.create = function(args) { 
            var doneCreating = when.defer();
            
            var payload = toJValue(LocalModel(args));
            if (self.debug) console.log(self.name, '==>', payload);
            
            // In order to be stateless, we have a fresh Backbone Collection for each operation
            var bbCollection = new BBCollectionClass();
            var bbModel = bbCollection.create(payload, {
                wait: true,
                success: function(newModel, response, options) { 
                    if (self.debug) console.log(self.name, '<==', newModel);

                    var createdModel = modelInThisCollection({ 
                        uri: newModel.get('resource_uri'), // Requires tastypie always_return_data = True; could/should fallback on Location header
                        attributes: newModel.attributes 
                    });

                    doneCreating.resolve(createdModel);
                },
                error: function(model, xhr, options) {
                    var err = JSON.parse(xhr.responseText);
                    doneCreating.reject(adjustTastypieError(err));
                }
            });
            
            return doneCreating.promise;
        }

        
        ///// fetchModels :: {String: *} -> Promise {URI:Model}
        //
        // A promise that resolves with the models that correspond to the
        // provided data.
    
        self.fetchModels = function(data) {
            if (self.debug) console.log(self.name, '-->', u(self.uri), '?', u(data)); //URI().query(self.data()).query());
            
            // The special value NOFETCH is used to indicate with certainty that the result
            // of the fetch will be empty, so we should elide hitting the network. This occurs
            // somewhat often during automatic dependency propagation and is no problem.

            if (_(data).any(function(v) { return v === NOFETCH; })) {
                if (self.debug) console.log(self.name, '<--', u(self.uri), '(not bothering)');
                return when.resolve({});// Equivalent to having fetched instantaneously and gotten no results
            }
            
            // In order to be simple and stateless, we create a new Backbone Collection 
            // for each operation and perform just a single fetch, and we convert the 
            // Backbone callback style to a promise.
            
            var doneFetching = when.defer();
            
            var bbCollection = new BBCollectionClass();
            bbCollection.fetch({ 
                traditional: true,
                data: data,
                success: function(collection, response) { 
                    if (self.debug) console.log(self.name, '<--', '(' + _(collection.models).size() + ' results)');
                    
                    var newModels = {};
                
                    _(collection.models).each(function(bbModel) {
                        var uri = bbModel.get('resource_uri'); // Without this, we don't actually have a "Model" per se
                        newModels[uri] = modelInThisCollection({
                            uri: uri,
                            attributes: bbModel.attributes
                        });
                    });

                    doneFetching.resolve(newModels);
                },

                error: function() {
                    doneFetching.reject();
                }
            });
            
            return doneFetching.promise;
        };

        
        
        return self;
    };

    // Link = { resolve: Collection -> Collection }
    //
    // The simplest sort of link is a URI, a pointer. However, even a
    // URI may be relative, hence takes a "source" location as an
    // implicit input. And much more complex links arise in
    // efficiently moving from a _set_ of fetched models to another
    // set of fetched models. Hence, a link is a function from a
    // Collection to another Collection.
    //
    var Link = function(implementation) {
        var self = _({}).extend(implementation);

        self.filtered = function(filters) { return FilterLink(filters, self); };

        return self;
    };

    // LinkToCollection :: Collection -> Link
    //
    // A constant link that ignores its input and returns the provided destination collection
    //
    var LinkToCollection = function(destination) {
        (destination && _(destination).has('models')) || die('Collection provided to `LinkToCollection` missing required field `models`:' + destination);

        return new Link({
            resolve: function(sourceCollection) {
                return destination;
            }
        });
    };

    // FilterLink :: { String: Model -> String|Number } -> (Link -> Link)
    //
    // The same as the input link, but adds filters based on a dictionary
    // of input functions. It combines the values from all the models
    // into a single filter.
    //
    var FilterLink = function(filters) {
        filters || die('Missing required arg `filters` for FilterLink');

        return function(link) {
            link    || die('Missing required arg `link` for FilterLink');

            return new Link({ 
                resolve: function(sourceCollection) {
                    var target = link.resolve(sourceCollection);
                    
                    var targetData = c(function() {
                        var data = {};
                        _(filters).each(function(fn, key) {
                            var vals = _.chain(sourceCollection.models())
                                .values()
                                .map(u)
                                .map(fn)
                                .filter(function(v) { return _(v).isString() || _(v).isNumber(); }) 
                                .uniq()
                                .value()
                                .sort();
                            
                            if ( _(vals).isEmpty() ) vals = NOFETCH;
                            
                            data[key] = vals;
                        });
                        
                        // And... danger / hardcoding for tastypie for now (can actually be easily expressed in the client code, but verbose)
                        data.limit = 0;
                        
                        return data;
                    }).extend({throttle: 1});
                    
                    return target.withData(targetData);
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
        filters[to] = function(model) { return transform(u(model.attributes()[from])); };
        
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

    // Reference = Model -> Collection -> ko.observable
    //
    // A reference complements a Link. Since the link is from collection to
    // collection, the Reference knows how get the proper value out of the 
    // destination collection and how to put it back. It may refer
    // to any piece of the model.
    //
    // A `Reference` is essentially the read/write _dereference_ spec. It may eventually
    // have more useful methods.
    //
    var Reference = function(impl) {
        return impl;
    };
    
    // ToOne / ToMany attributes are low-level building blocks for most common-cases
    //
    // These are observables from which one reads/writes objects, but the underlying observable
    // experiences this as reads/writes or URIs.
    //
    // While it is simplest to have these always transform their values, there are wacky cases:
    // 1. When a Model is written that is not in the collection. In this case, it is added.
    // 2. When a URI is written instead of a Model. This may be an accident, or may be because
    //    we were just "lucky" to already have a Model in place. To try to catch the accidental
    //    cases, the writing of a URI will fail if the URI is not found in the destination
    //    collection.
    
    var ToOne = function(underlyingObservable) {
       return function(collection) {
           (collection && _(collection).has('models')) || die('Collection passed to `ToOne` missing required `models` attribute:' + collection);

           return transformed(underlyingObservable, {
               read: function(v) { 
                   return v ? u(collection.models()[v]) : v; 
               },

               write: function(v) { 
                   if (!v) return v;

                   if (_(v).isString()) {
                       if ( !_(collection.models).has(v) ) die('Model with URI ' + v +
                                                               ' was not found in ' + collection.name +
                                                               ' - this probably indicates an accidental writing of a URI when you need to write a Model');
                       
                       return v;
                   }

                   var resource_uri = v.attributes().resource_uri();

                   if ( ! _( u(collection.models()) ).has(resource_uri) ) {
                       var update = {};
                       update[resource_uri] = v;
                       collection.models(update);
                   }

                   return resource_uri;
               }
           });
       };
    };

    var ToMany = function(underlyingObservable) {
        return function(collection) {
            return transformed(underlyingObservable, {
                read: function(vs) { 
                    if (!vs) return vs;
                    
                    var results = _(vs).map(function(v) { return u(collection.models()[v]); });
                    
                    if ( _(results).any(function(r) { return _(r).isUndefined(); }) )
                        return undefined;

                    return results;
                },
                write: function(vs) { 
                    if (!vs) return vs;

                    return _(vs).map(function(v) {
                        if (_(v).isString()) {
                            if ( !_(collection.models).has(v) ) die('Model with URI ' + v +
                                                                    ' was not found in ' + collection.name +
                                                                    ' - this probably indicates an accidental writing of a URI when you need to write a Model');
                            
                            return v;
                        }

                        var resource_uri = v.attributes().resource_uri();
                        
                        if ( ! _( u(collection.models()) ).has(resource_uri) ) {
                            var update = {};
                            update[resource_uri] = v;
                            collection.models(update);
                        }
                        
                        return resource_uri;
                    });
                }
            });
        };
    };

    // ToOneReference
    //
    // The `field` in the model directly references the Url of the
    // destination.
    //
    var ToOneReference = function(args) {
        var field = args.from || die('Missing required args `from` for `ToOneReference`');

        return function(model, destCollection) {
            return ToOne(model.attr(field))(destCollection);
        };
    };
    
    // ToManyReference
    //
    // The `field` in the model is an array of Urls in the destination collection
    //
    var ToManyReference = function(args) {
        var field = args.from || die('Missing required arg `from` for ToManyReference`');
        
        return function(model, destCollection) {
            return ToMany(model.attr(field))(destCollection);
        };
    };

    // FilterReference
    //
    // A filter reference is a "virtual" reference, not actually present on the model, but implicit
    // by filtering the target collection according to some predicate of the model.
    //
    var FilterReference = function(filter) {
        return function(sourceModel, destCollection) {
            _(destCollection).has('models') || die('Collection passed to FilterReference missing `models`:' + destCollection);

            return c(function() {
                return _.chain(destCollection.models())
                    .values()
                    .filter(function(m) { return filter(sourceModel, m); })
                    .value();
            });
        };
    };

    // JoinReference
    //
    // A FilterReference where the `from` attribute and `to` attribute must match exactly.
    //
    var JoinReference = function(args) {
        var from = args.from || die('Missing required argument `from` in solidstate.JoinReference'),
            to   = args.to   || die('Missing required argument `to` in solidstate.JoinReference');

        return FilterReference(function(source, destination) { 
            _(source).has('attributes') || die('Model `source` passed to JoinReference missing attributes:' + source + '('+ui(source)+')');
            _(destination).has('attributes') || die('Model `destination` passed to JoinReference missing attributes:' + destination +'('+u(destination)+')');

            return u(source.attributes()[from]) === u(destination.attributes()[to]); 
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
    
    // Interface Api =
    // {
    //   url         :: ko.observable String
    //   state       :: ko.observable ("initial" | "fetching" | "ready")
    //   collections :: ko.observable {String: Collection}
    //
    //   relatedCollection :: (String, String, Collection) -> Collection  // Keyed on source name, attribute name, and taking particular src collection too
    //
    //   fetch :: () -> ()
    // }
    //
    // And the state machine transitions thusly:
    //
    // *        --[ fetch   ]--> fetching
    // fetching --[ success ]--> ready

    var Api = function(impl) {
        var self = _(this).extend(impl);

        self.fetch = function() { impl.fetch(); return self; };

        self.state = State(impl.state);
    };

    ///// LocalApi
    //
    // Just in-memory, must have its collections provided

    var LocalApi = function(args) {
        var self = {};

        self.debug = args.debug || false;
        self.name = args.name || 'solidstate.RemoteApi';
        self.fetch = args.fetch || function() { return self; };
        self.state = o('ready');
        self.collections = Collections({
            debug: self.debug,
            collections: args.collections || {},
            relationships: args.relationships || {}
        });

        return new Api(self);
    };
        
    // Api constructor from url
    //
    // args ::
    // {
    //   url           :: observableLike String
    //   relationships :: {String: {String: {                         // Keyed on src coll name and attribute
    //                                        "collection": String,   // This param is for the Api; the rest are passed on to Relationship
    //                                        "type":String, 
    //                                        "key":String,
    //                                        "keyType":String, 
    //                                        "reverseField":String 
    //                                       }}}   
    // }
    var RemoteApi = function(args) {
        var self = {};

        self.uri = args.uri || die('Missing required argument `uri` for RemoteApi');
        self.state = o("initial");
        self.debug = args.debug || false;
        self.collections = Collections({ debug: self.debug, relationships: args.relationships });
        self.name = args.name || 'solidstate.RemoteApi';

        // The actual API metadata endpoint (a la Tastypie) is implemented as a Backbone model
        // where each attribute is a resource endpoint
        var bbModel = new (Backbone.Model.extend({ url: self.uri }))();

        var updateCollections = function(attributes) {
            if (!attributes) return; // changedAttributes returns false, not {}, when nothing has changed

            var additionalCollections = {};
            _(attributes).each(function(metadata, name) {
                additionalCollections[name] = RemoteCollection({ 
                    name: name,
                    debug: self.debug,
                    uri: metadata.list_endpoint,
                    schema_url: metadata.schema,
                });
            });

            self.collections(additionalCollections);
        };

        var nonce = null;
        var newNonce = function() { nonce = Math.random(); return nonce; };

        self.fetch = function() {
            self.state("fetching");
            if (self.debug) console.log(self.name, '-->', u(self.uri));
            var myNonce = newNonce();
            bbModel.fetch({
                success: function(model, response) { 
                    if (nonce === myNonce) {
                        if (self.debug) console.log(self.name, '<--', u(self.uri));
                        updateCollections(model.changedAttributes());
                        self.state('ready'); 
                    } 
                }
            });

            return self;
        };

        var api = new Api(self);
        return api;
    };

    //
    // AMD Module
    //
    return {
        // Interfaces
        Model: Model,
        Collection: Collection,
        Link: Link,
        Reference: Reference,
        Api: Api,

        // Model Backends
        LocalModelBackend: LocalModelBackend,

        // Model shortcuts
        LocalModel: LocalModel,
        NewModel: NewModel,
        RemoteModel: RemoteModel,

        // Collection Backends
        LocalCollectionBackend: LocalCollectionBackend,
        RemoteCollectionBackend: RemoteCollectionBackend,

        // Collection shortcuts
        LocalCollection: LocalCollection,
        RemoteCollection: RemoteCollection,

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

        // Helpers
        Attributes: Attributes,
        Models: Models,
        Collections: Collections,
        State: State,

        // Misc, probably "private"
        NOFETCH: NOFETCH,
        BBWriteThroughObservable: BBWriteThroughObservable
    };
});
