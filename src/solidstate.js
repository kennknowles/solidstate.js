/* jshint -W064 */
/* jshint -W030 */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    //'contracts-js',
    'knockout',
    'underscore',
    'URIjs',
    'when',
    'zoetropic'
], function(/*contracts,*/ ko, _, URI, when, z) {
    'use strict';
    
    //contracts.enabled(false);

    // Alias extremely common knockout functions.
    // Trust me, this actually improves readability.
    var //C = contracts,
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

    //var i = C.guard(C.Num, 3);
    
    ///// Attributes
    //
    // An observable dictionary with the property that writing the whole dictionary
    // actually writes individually to each attribute.
    //
    // As this is not a dependent observable but a mutable cell, it will _peek_
    // at args.attributes to initalize itself
    //
    // args :: {
    //   attributes :: String -> Observable
    //   makeAttribute :: (Key, Value) -> Observable
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
                var newAttributes = _newAttributes.peek ? _newAttributes.peek() : _newAttributes;

                _(newAttributes).each(function(value, key) {
                    value = (value && value.peek) 
                        ? value.peek() 
                        : value;

                    if (_(nextAttributes).has(key)) {
                        nextAttributes[key](value);
                    } else {
                        nextAttributes[key] = makeAttribute(key, value);
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
    // A dictionary of collections by name with the property that writing to a collection
    // that is already in there is ignored.

    var Collections = function(args) {
        args = args || {};

        var actualCollections = o({});
        var debug = args.debug || false;
        
        ///// wrappedCollections
        //
        // The returned value; a computed observable that builds the collections monotonically

        var wrappedCollections = c({
            read: function() { return actualCollections(); },
            write: function(additionalCollections) {
                if (!additionalCollections) return;

                var nextCollections = _(actualCollections()).clone();
                var collectionsDidChange = false;
                
                _(additionalCollections).each(function(collection, name) {
                    if ( !_(nextCollections).has(name) ) {
                        if (debug) console.log(' - ', name);
                        nextCollections[name] = collection;
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
        var nextDeferreds = {};
        
        var resolveStateDeferred = function() {
            var state = self.peek();

            if ( _(stateDeferreds).has(state) ) {
                stateDeferreds[state].resolve();
                delete stateDeferreds[state];
            }
        };

        var resolveNextDeferred = function() {
            var state = self.peek();
            
            if ( _(nextDeferreds).has(state) ) {
                nextDeferred[state].resolve();
                delete nextDeferred[state];
            }
            _(nextDeferreds).each(function(deferred) {
                deferred.reject(state);
            });
            nextDeferreds = {};
        }

        ///// next :: String -> Promise ()
        //
        // A promise that resolves only if the very next state matches, otherwise rejects

        self.next = function(goalState) {
            if ( !_(nextDeferreds).has(goalState) ) {
                nextDeferreds[goalState] = when.defer();
            }
            var promise = nextDeferreds[goalState].promise;
            resolveNextDeferred();
            return promise;
        };

        ///// reaches :: String -> Promise ()
        //
        // A promise that resolves when this state machine arrives 
        // the state passed in.

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
            resolveNextDeferred();
        });

        ///// readOnly
        //
        // A version of this observable that cannot be written

        self.readOnly = c(function() {
            return self();
        });
        self.readOnly.reaches = self.reaches;
        self.readOnly.next = self.next;

        return self;
    }


    ///// Model
    //
    // A wrapper for any Model implementation that performs a little
    // kick typing (hence defining the minimal interface) before adding fluent combinators.
    
    var Model = function(implementation) {
        if ( !(this instanceof Model) ) return new Model(implementation);

        var self = this;

        ///// name :: String
        //
        // A name used in debugging messages
        
        self.name = implementation.name || '(anonymous solidstate.Model)';


        ///// state :: State ("initial" | "fetching" | "ready")
        //
        // Uses the passed-in state or creates its own. It is mandatory
        // that the state have a `reaches` method that returns a Promise ().

        self.state = implementation.state || die('Model implementation missing mandatory field `state`');

        ///// stateExplanation
        //
        // An explanation for why the state is unready, useful since often it is due to overlays, etc

        self.stateExplanation = implementation.stateExplanation || o('No reason given');

        ///// attributes :: Attributes
        //
        // If the implementation passes in some attributes that are any sort of observable,
        // then it will be used, otherwise some fresh attributes are created.

        self.attributes = implementation.attributes || die('Model implementation missing mandatory field `attributes`');

        
        ///// errors :: {String: [String]}
        //
        // A mapping from attribute name to messages about validation problems with that attribute.
        // There is a special key __all__ that should have all of those and also global errors.

        self.errors = implementation.errors || die('Model implementation missing mandatory field `errors`');

        
        ///// relationships :: String -> Relationship
        //
        // A function that maps each attribute to the Relationship
        // between collections for that attribute.

        self.relationships = implementation.relationships || die('Model implementation missing mandatory field `relationships`');

        
        ///// fetch :: () -> Model
        //
        // Save the model to the backend (probably asynchronously by changing the state, but not necessarily)

        self.fetch = implementation.fetch || die('Model implementation missing required field `fetch`');


        ///// save :: Attributes -> Promise ()
        //
        // Saves the attributes (probably asynchronously by changing the state, but not necessarily)
        
        self.save = implementation.save || die('Model implementation missing required field `save`');


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
            return self.withFields({ relationships: _({}).extend(self.relationships, additionalRelationships) });
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
                fetch: function(data) { },
                relationships: self.relationships,
                withFields: function(newFields) { },
                models: c(function() { return [self]; })
            });

            return justThisModelCollection.relatedCollection(attr);
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

                fetch: function(options) {
                    // If the collection has not been fetched, then
                    // we can fetch it and return the attributes of
                    // the model when ready
                    if (onlyModel()) {
                        onlyModel().fetch(options);
                    } else {
                        coll.fetch(options);
                    }

                    return Model(modelImplementation);
                },

                save: function() {
                    if (onlyModel())
                        return onlyModel().save();
                },

                attributes: c({
                    read: function() {
                        return onlyModel() ? onlyModel().attributes() : {};
                    },
                    write: function(newAttrs) {
                        if ( onlyModel() ) onlyModel().attributes(newAttrs);
                    }
                }),

                errors: o({})
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
        

        ///// overlayRelated :: {String: Collection} -> Model
        //
        // A model where the given attributes have their values
        // overlayed from the corresponding collections according
        // to the relationships.

        self.overlayRelated = function(subresourceCollections) {
            var overlayedAttributeDict = {};

            var overlayedAttributes = Attributes({
                // The initial values of the attributes will be ignored, because
                // all of them will cause a call to `makeAttribute` which sets up the proxying,
                // so any dictionary with the right keys is fine
                attributes: subresourceCollections,

                makeAttribute: function(field, value) {
                    // A new attribute should never be possible, so the only time this is called
                    // is on initialization, when the value can be ignored because it will be proxied.
                    var relationship = self.relationships[field] || { deref: ToOneReference({from: field}) };

                    // This observable will write to the underlying attribute properly whether it already existed or not
                    var overlayedAttribute = relationship.deref(self, subresourceCollections[field]);

                    // Set the underlying attribute immediately
                    return overlayedAttribute;
                }
            });

            var augmentedSelf = self.withAttributes(overlayedAttributes);

            var augmentedStateWithExplanation = c(function() {
                for (var field in subresourceCollections) {
                    if ( !u(self.attributes()[field]) ) 
                        continue;

                    var val = augmentedSelf.attributes()[field]();

                    if ( !val )
                        return ["fetching", 'Thus far missing subresource ' + self.name + '.' + field + ', for ' + u(self.attributes()[field])];

                    if ( _(val).has('state') && (val.state() !== 'ready') ) 
                        return [val.state(), self.name + '.' + field + ' has state ' + val.state() + ':\n\t' + val.stateExplanation()];

                    if ( _(val).isArray() ) {
                        for (var i in val) {
                            if ( _(val[i]).has('state') && (val[i].state() !== 'ready') )
                                return [val[i].state(), self.name + '.' + field + ' has state ' + val[i].state() + ':\n\t' + val[i].stateExplanation()];
                        }
                    }
                }
                return [self.state(), 'All subresource fetched; ' + self.stateExplanation()];
            });

            var augmentedStateExplanation = c(function() { return augmentedStateWithExplanation()[1]; });
            var augmentedState = State(c(function() { return augmentedStateWithExplanation()[0]; }));

            return augmentedSelf.withFields({ state: augmentedState, stateExplanation: augmentedStateExplanation });
        };
        self.withSubresourcesFrom = self.overlayRelated;
        
        // toString :: () -> String
        //
        // Just some sort of friendly-ish string

        self.toString = function() { return 'Model()'; };

        return self;
    };

    ///// ModelForZoetrope
    //
    // Builds a model that "mutates" appropriately according to the
    // frames of a zoetrope (a sequence of immutable values)

    var ModelForZoetrope = function(args) {
        if (!(this instanceof ModelForZoetrope)) return new ModelForZoetrope(args);
        
        args = args || {};
        var self = this;
        var zoetrope = args.zoetrope || die('Missing mandatory argument `zoetrope` for `ModelForZoetrope`');

        ///// name, uri, debug
        //
        // These debugging and core fields are just copied from the zoetrope.
        
        self.name = zoetrope.name;
        self.uri = zoetrope.uri;
        self.debug = zoetrope.debug || false;

        ///// relationships :: Relationships
        //
        // This must be passed in

        self.relationships = _(args.relationships).isObject() ? args.relationships : die('Missing mandatory argument `relationships` for ModelForZoetrope');

        ///// state :: State 
        //
        // Public: observable
        // Private: mutable observable
        //
        // Considered "initial" until having fetched at least once.

        var initial = true;
        var mutableState = State(args.state || 'initial');
        self.state = mutableState.readOnly;
        self.state.reaches('ready').then(function() { initial = false; });
        self.stateExplanation = o('Actual state of ModelForZoetrope');

        ///// attributes :: Attributes
        //
        // Public: mutable observable

        self.attributes = Attributes({ attributes: zoetrope.attributes });
        
        ////// errors :: observable {...}
        //
        // Public: observable
        // Private: mutable observable
        //
        // An observable dictionary of errors keys on attribute.
        
        var mutableErrors = o({});
        self.errors = c(function() { return mutableErrors(); });
        

        // Nonces that both fetch & save use
        var nonce = null;
        var newNonce = function() { nonce = Math.random(); return nonce; };

        ///// fetch :: () -> Model
        //
        // Returns this model after firing off a fetch request.  While the fetch is in progress, 
        // sets the state to 'fetching', after which it will be restored to 'ready' 
        // unless another request intervenes.

        self.fetch = function(options) { 
            var myNonce = newNonce();
            var doneFetching = zoetrope.fetch({ name: (options && options.name) || self.name });

            mutableState('fetching');
            
            // TODO: probably use the new zoetrope from here out, since
            // then NewModel can be just a ModelForZoetrope for a sufficiently
            // intelligent Zoetrope
            when(doneFetching)
                .then(function(newZoetrope) {
                    if (nonce !== myNonce) return;
                    self.attributes(newZoetrope.attributes); 
                    mutableErrors(newZoetrope.errors);
                    mutableState('ready');
                })
                .otherwise(function(newZoetrope) {
                    if (nonce !== myNonce) return;
                    mutableErrors(newZoetrope.errors);
                    mutableState(initial ? 'initial' : 'ready');
                })

            return Model(self);
        };


        ///// save :: () -> Model
        //
        // Saves the model's attributes; updates only the
        // errors upon a failure, so as not to overwrite
        // the input values from the user.

        self.save = function() { 
            mutableState('saving');
            var myNonce = newNonce();
            var zoetropeDoneSaving = zoetrope.save( _(self.attributes()).mapValues(function(obs) { return obs(); }) ); 
            
            return when(zoetropeDoneSaving)
                .otherwise(function(zoetropeErrors) {
                    if (nonce !== myNonce) return;
                    mutableErrors(zoetropeErrors);
                    mutableState(initial ? 'initial' : 'ready');
                    return when.reject(zoetropeErrors);
                })
                .then(function(newZoetrope) {
                    if (nonce !== myNonce) return;
                    // Do not overwrite local attributes... but should assert they equal what we want  self.attributes(newZoetrope.attributes);
                    // Errors should cause the promise to reject // mutableErrors(newZoetrope.errors);
                    mutableState('ready');
                    return when.resolve(Model(self));
                })
                .otherwise(function(exception) {
                    console.error(exception, exception.stack);
                    return when.reject(exception);
                });
        };

        return Model(self);
    }


    ///// LocalModel
    // 
    // A model that exists only locally

    var LocalModel = function(args) {
        args = args || {};
        return ModelForZoetrope({
            state: 'ready',
            relationships: args.relationships || {},
            zoetrope: z.LocalModel({
                uri: args.uri || ('fake:' + Math.random(1000).toString()),
                name: args.name || "(anonymous solidstate.LocalModel)",
                debug: args.debug || false,
                attributes: args.attributes
            })
        });
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

        self.relationships = args.relationships || {};

        // This state marches from initial -> saving -> ready
        var initializationState = State('initial');

        // Use an initial local model until first save, when we pass the gathered data on
        var initialModel = LocalModel({
            name: self.name,
            debug: args.debug,
            attributes: args.attributes,
        });

        var errors = o({});

        // This changes one before initializationState, so the internal bits that depend on it fire before the
        // external world gets a state change (depending on attributes() before checking state() means client is out of luck!)
        var createdModel = o(null);

        self.state = State(c(function() { 
            // Seems to be a bug where initializationState is 'ready' when the createdModel is not yet
            return ((initializationState() === 'ready') && createdModel()) ? createdModel().state() : initializationState(); 
        }));

        self.stateExplanation = c(function() {
            if ((initializationState() !== 'ready') || !createdModel())
                return 'NewModel ' + self.name + ' not yet successfully initialized; ' + initialModel.stateExplanation();
            else
                return 'NewModel ' + self.name + ' initialized; ' + createdModel().stateExplanation();
        });
        
        self.errors = c(function() { return createdModel() ? createdModel().errors() : errors(); });
       
        self.attributes = c({
            read: function() { return createdModel() ? createdModel().attributes() : initialModel.attributes(); },
            write: function(attrs) { return createdModel() ? createdModel().attributes(attrs) : initialModel.attributes(attrs); }
        });
        
        self.fetch = function(options) { 
            if (createdModel()) {
                createdModel().fetch(options); 
                return Model(self);
            } else {
                initialModel.fetch(options);
                return Model(self);
            }
        };

        self.save = function(options) { 
            if (createdModel() && (initializationState() === 'ready')) {
                return createdModel().save(options).then(function() {
                    return when.resolve(Model(self));
                })
                
            } else if (initializationState() === 'initial') {

                initializationState('saving');

                return self
                    .create({
                        attributes: initialModel.attributes(),
                        debug: initialModel.debug,
                        name: self.name
                    })
                    .otherwise(function(creationErrors) {
                        errors(creationErrors);
                        initializationState('initial');
                        return when.reject(creationErrors);
                    })
                    .then(function(actuallyCreatedModel) {
                        createdModel(actuallyCreatedModel);
                        errors({});
                        initializationState('ready');
                        return when.resolve(Model(self));
                    })
            } 
        };
        
        return Model(self);
    };
    
    var RemoteModel = function(args) { 
        return ModelForZoetrope({
            relationships: args.relationships || {},
            zoetrope: z.RemoteModel({
                uri: args.uri,
                name: args.name,
                debug: args.debug
            })
        });
    };

    ///// Collection (fluent interface)
    //
    // An interface wrapper that does some basic "kick typing" and then
    // adds fluent combinators.
    //
    // name   :: String
    // uri    :: String
    // state  :: State
    // models :: Models
    // fetch  :: () -> Self

    var Collection = function(implementation) {
        if (!(this instanceof Collection)) return new Collection(implementation);

        var self = this;

        // For debug loggign
        self.implementation = implementation;
        
        ///// uri :: String
        //
        // A URI for this collection that can be a URL or other.
        // It is not validated, but simply used to keep track of
        // some notion of identity.

        self.uri = implementation.uri || die('Collection implementation missing required field `uri`.');

        ///// name :: String
        //
        // For debugging, etc

        self.name = implementation.name || '(anonymous solidstate.Collection)';
        
        ///// models :: Models
        //
        // A collection of models by URI that supports intelligent
        // bulk update and relationships.

        self.models = _(implementation.models).isObject() ? implementation.models : die('Collection implementation missing required field `models`');

        ///// state :: State ("initial" | "fetching" | "ready")
        //
        // A state may be passed in via the args, in which case it will
        // take precedence over the collection's state. Use with care.
        //
        // The state *must* be writable. Why?

        self.state = implementation.state || die('Collection implementation missing required field `state`');
        
        ///// stateExplanation
        //
        // An explanation for why the state is unready, useful since often it is due to overlays, etc

        self.stateExplanation = implementation.stateExplanation || o('No reason given');

        ///// create :: * -> Promise Model
        //
        // Creates a new model in this collection; provided by the
        // implementation. The model will retain all added relationships
        // and subresources.

        self.create = implementation.create || die('Collection implementation missing required field `create`');
        
        ///// fetch :: () -> Collection
        //
        // Fetches the models from the server

        self.fetch = implementation.fetch || die('Collection implementation missing required field `fetch`');
        
        ///// withFields :: overrides -> Collection
        //
        // The "master" combinator for overwriting fields of the Collection constructor.
        // This must be implemented by the implementation, and cannot be created here,
        // as it is how a _new_ and independent copy of this collection
        // with different parameters is created.
        
        self.withFields = implementation.withFields || die('Collection implementation missing required field `withFields`');

        // TODO: Separate extending the data and replacing it. For LocalCollection it does not matter,
        // while for RemoteCollection the intend is always to derive the collection from this one, so extending
        // is really the only reasonable move. (If semantically a collection is seen as a set with no
        // intrinsic "universal" set when the filters are removed)
        self.withData = function(data) { return _(implementation).has('withData') ? implementation.withData(data) : implementation.withFields({ data: data }) };

        // Overlayed Fields and Combinators
        // ================================

        ///// relationships :: {String: Relationship}
        //
        // For each attribute of the models in the collection, there may 
        // be a relationship defined or no. It is a function rather 
        // than a dictionary to allow more implementation strategies.
        
        self.relationships = implementation.relationships || {};
        
        ///// relatedCollection :: String -> Collection
        //
        // The collection reached by following the link implied by the
        // provided attribute.

        self.relatedCollection = function(attr) { 
            var rel = self.relationships[attr] || die('No known relationship for ' + self.name + ' via attribute ' + attr);
            var coll = rel.link.resolve(self).withFields({ name: self.name + '.' + attr });
            return coll;
        };
        
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
                    var doneCreating = self.create(createArgs);

                    return when(doneCreating)
                        .then(function(createdModel) {
                            var update = {};
                            update[u(createdModel.uri)] = createdModel;
                            return when.resolve(createdModel.withRelationships(self.relationships)); 
                        });
                }
            }).withRelationships(self.relationships);
        };
        
        ///// overlayState :: State -> Collection
        //
        // This collection with a new notion of state overlayed.

        self.overlayState = function(state) {
            return Collection( _({}).extend(implementation, { state: state }) );
        }
        self.withState = self.overlayState; // backwards compat; deprecated
        
        ///// overlayRelationships :: {String: Relationship} -> Collection
        //
        // This collection with additional relationships & the same models. Each
        // required field of Collection is delegated to the underlying implementation.

        self.overlayRelationships = function(additionalRelationships) {
            var combinedRelationships = _({}).extend(self.relationships, additionalRelationships);

            var newSelf = Collection(_({}).extend(implementation, {

                relationships: combinedRelationships,

                fetch: function() { self.fetch(); return newSelf; },

                create: function(createArgs) {
                    return self.create(createArgs).then(function(createdModel) {
                        return when.resolve(createdModel.withRelationships(combinedRelationships));
                    });
                },

                models: c({
                    write: function(newModels) { self.models(newModels); },
                    read: function() {
                        return _(self.models()).mapValues(function(model) { 
                            return model.withRelationships(combinedRelationships); 
                        });
                    }
                }),
                
                withFields: function(modifiedFields) {
                    return Collection(implementation.withFields(modifiedFields)).overlayRelationships(additionalRelationships);
                },

                withData: function(additionalData) {
                    return Collection(implementation.withData(additionalData)).overlayRelationships(additionalRelationships);
                }
            }));

            return newSelf
        };
        self.withRelationships = self.overlayRelationships; // deprecated alias
                                 
        
        ///// overlayRelated :: ([String] | {String:Collection}) -> Collection
        //
        // A collection like this one but where each model will have its
        // attributes populated according to its relationships using the
        // provided collections.

        self.overlayRelated = function(relations) {
            var overlayedCollections = {};

            if ( _(relations).isObject() ) {
                overlayedCollections = relations
            } else {
                _(arguments).each(function(attribute) { 
                    overlayedCollections[attribute] = self.relatedCollection(attribute).fetch();
                });
            }

            var augmentedModels = c(function() {
                return _(self.models()).mapValues(function(model) { 
                    return model.overlayRelated(overlayedCollections); 
                })
            });

            var augmentedStateWithExplanation = c(function() {
                var m = _(augmentedModels()).find(function(m) { return m.state() !== "ready"; });
                if ( m ) 
                    return [m.state(), self.name + ' waiting for model: ' + m.stateExplanation()];
                else
                    return [self.state(), 'All models ready for ' + self.name];
            });

            var augmentedState = State(c({
                read: function() { return augmentedStateWithExplanation()[0]; },
                write: function(newValue) {
                    self.state(newValue);
                }
            }));
            
            var augmentedStateExplanation = c(function() { return augmentedStateWithExplanation()[1]; });

            var augmentedCreate = function(modelArgs) {
                var m = LocalModel(modelArgs);
                var augmentedM = m.withSubresourcesFrom(overlayedCollections);
                augmentedM.attributes(modelArgs.attributes);

                return self
                    .create(_({}).extend(modelArgs, {
                        attributes: m.attributes()
                    }))
                    .then(function(createdModel) {
                        return when.resolve(createdModel.overlayRelated(overlayedCollections));
                    });
            };
            
            var newSelf = Collection( _({}).extend(implementation, {
                state: augmentedState,
                stateExplanation: augmentedStateExplanation,
                models: augmentedModels,
                create: augmentedCreate,
                fetch: function() { self.fetch(); return newSelf; }
            }));

            return newSelf;
        };
        self.withSubresourcesFrom = self.overlayRelated;

        self.withName = function(name) { return self.withFields({ name: name }); };

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
        self.withRelatedSubresources = self.overlayRelated; // deprecated alias
        
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


    ///// CollectionForZoetrope <: Collection
    //
    // Animates the frames of a zoetrope.Collection into
    // a state-machine based observable solidstate.Collection

    var CollectionForZoetrope = function(args) {
        if (!(this instanceof CollectionForZoetrope)) return new CollectionForZoetrope(args);

        args = args || {};
        var self = this;
        var zoetrope = args.zoetrope || die('Missing required arg `zoetrope` for CollectionForZoetrope');
        self.zoetrope = zoetrope;
        
        ///// name, uri, debug, relationships
        //
        // Various simple parameters provided from outside
        
        self.uri = zoetrope.uri;
        self.name = args.name || zoetrope.name;
        self.debug = args.debug || true;
        self.relationships = args.relationships || {};
        self.data = w(args.data);

        ///// state :: State 
        //
        // Public: observable
        // Private: mutable observable
        //
        // Considered "initial" until having fetched at least once.

        var mutableState = State(args.state || 'initial');
        var initial = mutableState.peek() === 'initial';
        self.state = mutableState.readOnly;
        
        ///// Models
        //
        // Models are entirely pedestrian; zoetropic.Models must be wrapped

        self.models = Models();
        var updateModels = function(zModels) {
            self.models(
                _(zModels).mapValues(function(model, key) { 
                    var name = self.name + '[' + key + ']';

                    return ModelForZoetrope({
                        name: name,
                        state: 'ready',
                        relationships: self.relationships,
                        zoetrope: model.withFields({ name: name })
                    });
                })
            );
        }
        updateModels(zoetrope.models);

        /////  create :: {...} -> Promise Model
        //
        // Given argument for a LocalModel, returns a promise
        // for a saved model with the same attributes

        self.create = function(args) {
            var doneCreating = zoetrope.create({
                debug: args.debug,
                attributes: _(args.attributes).mapValues(u),
            });

            return when(doneCreating)
                .then(function(modelZoetrope) {
                    return when.resolve(ModelForZoetrope({
                        state: 'ready',
                        relationships: self.relationships,
                        zoetrope: modelZoetrope
                    }));
                })
                .otherwise(function(err) {
                    return when.reject(err);
                });
        }


        ///// fetch :: {...} -> Collection
        //
        // Calls `fetch` and while the promise is resolving sets
        // state to "fetching"
        
        var nonce = null;
        var newNonce = function() { nonce = Math.random(); return nonce; };

        self.fetch = function(options) {
            var name = (options && options.name) || self.name;

            var combinedData = _({}).extend(self.data());

            if ( _.chain(combinedData).values().any(function(v) { return v === NOFETCH; }).value() ) {
                initial = false;
                return;
            }

            var myNonce = newNonce();
            var doneFetching = zoetrope.fetch({ data: combinedData });

            mutableState('fetching');

            when(doneFetching)
                .then(function(newZCollection) {
                    if (nonce !== myNonce) return;
                    zoetrope = newZCollection;
                    updateModels(newZCollection.models);
                    mutableState('ready');
                    initial = false;
                })
                .otherwise(function(err) {
                    if (nonce !== myNonce) return;
                    console.error(err.stack);
                    mutableState(initial ? 'initial' : 'ready');
                });
            
            return Collection(self);
        };
        self.data.subscribe(function() { 
            if (!initial) self.fetch(); 
        });

        
        ///// relationships :: {String: Relationship}
        //
        // Currently does NOT wrap the zoetrope's relationships, because
        // while the link is easy the deref is not, without assuming things
        // about the modelWraps the zoetrope's relationships
        
        self.relationships = args.attributes || {};

            /*
              !!!! NOTE !!!!!

            var zRelationship = zoetrope.relationships(attribute);

            return Relationship({
                link: function(src) { 
                    return CollectionForZoetrope({
                        zoetrope: zRelationship.link.resolve(zoetrope)
                        // And some other args...
                    });
                },

                deref: function(srcModel, destCollection) { 
                    // Need to assume & expose things about srcModel and destCollection
                    // and even then the semantics are not clear to me yet
                }
            });
            */
        
        ///// withData :: Observable {*} -> CollectionForZoetrope
        //
        // A Collection with independent Models and new data but the same backend implementation.
        
        self.withData = function(additionalData) { 
            var combinedData = c(function() { return _({}).extend(self.data(), u(additionalData)); });
            var next = CollectionForZoetrope( _({}).extend(args, { data: combinedData }) )
            return next;
        };
        
        ///// withName :: String -> Collection
        //
        // This collection with a new name
        
        self.withFields = function(additionalFields) {
            var newFields = _({
                uri: self.uri,
                name: self.name,
                data: self.data,
                debug: self.debug,
                state: self.state(),
            }).extend(additionalFields);

            return CollectionForZoetrope(_({}).extend(newFields, {
                zoetrope: zoetrope.withFields({
                    uri: newFields.uri,
                    data: newFields.data,
                    name: newFields.name,
                    debug: newFields.debug,
                })
            }));
        };
        
        return Collection(self);
    };
    
    
    ///// LocalCollection
    //
    // All in memory

    var LocalCollection = function(args) {
        if (!(this instanceof LocalCollection)) return new LocalCollection(args);

        args = args || {};
        var uri = args.uri || ('fake:' + Math.random(1000).toString());
        var name = args.name || '(anonymous solidstate.LocalCollection with uri '+uri+')';

        return CollectionForZoetrope({
            state: 'ready',
            debug: args.debug,
            relationships: args.relationships || {},
            data: args.data,
            zoetrope: z.LocalCollection({
                uri: uri,
                name: name,
                debug: args.debug,
                data: args.data || {},
                models: args.models,
            })
        });
    };


    ///// RemoteCollection
    //
    // A collection fetched over HTTP from its URI (which is thus a URL)
    // and which saves & creates new models via PUT and POST.

    var RemoteCollection = function(args) {
        args = args || {};

        var name = args.name || '(anonymous solidstate.RemoteCollection)';

        var zoetropicRemoteCollection = z.RemoteCollection({
            uri: args.uri,
            data: args.data,
            name: name + '[.zoetrope]',
            debug: args.debug,
            Backbone: args.Backbone
        });
        
        return CollectionForZoetrope({
            uri: args.uri,
            zoetrope: zoetropicRemoteCollection,

            name: name,
            data: args.data || {},
            debug: args.debug || false,
            state: 'initial',
            relationships: args.relationships || {},
            models: args.models
        });
    }

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
                    
                    return target.withFields({ data: targetData });
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
                
                if (!_(uri).isString()) throw new Error('UrlLink given a property `' + args.from + '` that is not a string:', uri);
                
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


    ///// Relationship
    //
    // A `Link` for getting from one collection to another, and a `Reference` for pulling out individual models... is a complete Relationship

    var Relationship = function(implementation) {
        if (!(this instanceof Relationship)) return new Relationship(implementation);

        var self = this;
        
        self.link = implementation.link || die('Relationship missing required field `link`');
        self.deref = implementation.link || die('Relationship missing required field `deref`');

        return self;
    };

    
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


    ///// ApiForZoetrope <: Api
    //
    // Wraps a zoetrope.Api into a solidstate.Api by taking
    // each snapshot of the zoetrope and mutating the solidstate
    // version appropriately.

    var ApiForZoetrope = function(args) {
        if (!(this instanceof ApiForZoetrope)) return new ApiForZoetrope(args);
        
        var self = this;
        var zoetrope = args.zoetrope || die('Missing required args `zoetrope` for ApiForZoetrope');

        ///// uri, debug, ...
        //
        // Attributes that just come right off the zoetrope
        
        self.uri = zoetrope.uri;
        self.debug = args.debug || zoetrope.debug;

        ///// state :: State 
        //
        // Public: observable
        // Private: mutable observable
        //
        // Considered "initial" until having fetched at least once.

        var initial = true;
        var mutableState = State(args.state || 'initial');
        self.state = mutableState.readOnly;
        self.state.reaches('ready').then(function() { initial = false; });

        ///// collections: Collections
        //
        // Public: observable
        // Private: mutable observable
        //
        // A dictionary of collections by name. It may be initialized with the
        // arguments passed in, and it will also be augmented with all collections
        // from the zoetrope, current and future.

        var mutableCollections = Collections({ debug: self.debug, collections: args.collections });
        var updateCollections = function(zCollections) {
            mutableCollections( 
                _(zCollections).mapValues(function(zCollection, name) {
                    return CollectionForZoetrope({ 
                        name: name, 
                        debug: self.debug, 
                        zoetrope: zCollection 
                    });
                })
            );
        };
        self.collections = c(function() { return mutableCollections(); });

        ///// fetch :: () -> Api
        //
        // Fetches collections information from the zoetrope. Sets
        // state to "fetching" while that is in progress.
        
        var nonce = null;
        var newNonce = function() { nonce = Math.random(); return nonce; };

        self.fetch = function() {
            var myNonce = newNonce();
            var doneFetching = zoetrope.fetch({ name: self.name });
            mutableState("fetching");

            when(doneFetching)
                .then(function(newZApi) {
                    if (nonce !== myNonce) return;

                    updateCollections(newZApi.collections);
                    mutableState('ready'); 
                })
                .otherwise(function(err) {
                    console.error(err.stack);
                    mutableState(initial ? 'initial' : 'ready');
                });
            
            return Api(self);
        };

        return Api(self);
    };
      

    ///// LocalApi
    //
    // Just in-memory, must have its collections provided

    var LocalApi = function(args) {
        return ApiForZoetrope({
            state: 'ready',
            collections: args.collections,
            zoetrope: z.LocalApi({
                uri: args.uri,
                name: args.name,
                debug: args.debug
            })
        });
    };

    ///// RemoteApi
    //
    // An api that lies across an AJAX request and returns metadata about each
    // of its collections

    var RemoteApi = function(args) {
        return ApiForZoetrope({
            state: 'initial',
            debug: args.debug,
            zoetrope: z.RemoteApi(args)
        });
    };


    // Module Exports
    // --------------

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
        NewModel: NewModel,

        // Collections
        CollectionForZoetrope: CollectionForZoetrope,
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
    };
});
