/* jshint -W070 */
/* jshint -W064 */
/* jshint -W025 */
/* jshint -W030 */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    //'contracts-js',
    'knockout',
    'underscore',
    'URIjs',
    'when',
], function(Backbone, /*contracts,*/ ko, _, URI, when) {
    'use strict';
    
    //contracts.enabled(false);

    // Alias extremely common knockout functions.
    // Trust me, this actually improves readability.
    var o = ko.observable,
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
    
    // Models
    //
    // An observable dictionary with the property that writing the whole dictionary
    // actually writes the *attributes* of each item in the dictionary, (so that
    // subscriptions to the models are maintained)
    //
    // args :: {
    //   models        :: String -> Model
    //   relationships :: String -> Relationship
    // }
    var Models = function(args) {
        args = args || {};

        var relationships = args.relationships || function(attr) { return undefined; };
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
                        nextModels[uri] = model.withRelationships(relationships);
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
        //
        // Underscore maintainers have rejected implementing proper map for objects, so do it mutatey-like

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
    //   fetch      :: () -> ()
    //   save       :: () -> ()
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
    //   when :: (String, () -> ()) -> ()
    // }

    var Model = function(args) {
        if ( !(this instanceof Model) ) return new Model(args);

        var self = this;


        ///// attributes :: Attributes
        //
        // If the implementation passes in some attributes that are any sort of observable,
        // then it will be used, otherwise some fresh attributes are created.

        self.attributes = ko.isObservable(args.attributes) ? args.attributes : Attributes({ attributes: args.attributes });

        
        ///// attributeErrors :: {String: [String]}
        //
        // A mapping from attribute name to messages about validation problems with that attribute.
        // There is a special key __all__ that should have all of those and also global errors.

        self.attributeErrors = args.attributeErrors || o({});

        
        ///// relationships :: String -> Relationship
        //
        // A function that maps each attribute to the Relationship
        // between collections for that attribute.

        self.relationships = args.relationships || function(attribute) { return undefined; };


        ///// fetch :: () -> Self
        //
        // Returns this collection after firing off a fetch request via the backend.
        // While the fetch is in progress, sets the state to 'fetching', after which
        // it will be restored to 'ready'.

        self.fetch = function() { 
            var doneFetching = args.fetch(); 

            var priorState = self.state.peek();

            when(doneFetching)
                .then(function(attributes) {
                    self.attributes(attributes);
                    self.state('ready');
                })
                .otherwise(function(error) {
                    console.error(error);
                    self.state(priorState);
                })

            return self; 
        };

        
        // save :: () -> Self
        //
        // Return this collection after firing of a save request via the backend.
        // While the save is in progress, sets self.state to "saving", after which
        // it will be restored to "ready".

        self.save = function() { 
            var doneSaving = args.save(self.attributes); 
            
            when(doneSaving)
                .then(function() {
                    self.state('ready');
                })
                .otherwise(function(attributeErrors) {
                    self.attributeErrors(attributeErrors);
                    self.state('ready');
                });

            return self; 
        };


        ///// state :: State ("initial" | "fetching" | "ready")
        //
        // If the thing passed in looks like it is already an observable
        // state, with a `reaches` attribute, then it will be used directly,
        // otherwise the value will be assumed to be an initial state.

        self.state = (ko.isObservable(args.state) && _(args.state).has('reaches')) ? args.state : State(args.state || "initial");


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
            var justThisModelCollection = new Collection({ 
                name: self.name,
                state: self.state, 
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
            console.log(u(coll.data));

            var onlyModel = c(function() {
                return _(coll.models()).values()[0];
            });

            var impl = {
                name: coll.name,
                debug: self.debug,
                url: self.attributes()[attr],
                relationships: coll.relationships,
                state: c(function() { 
                    if (coll.state !== 'ready') return coll.state();
                    var model = onlyModel();
                    if (model) return model.state();
                    return 'error';
                }),
                fetch: function() {
                    var model = onlyModel();
                    if (model) 
                        model.fetch();
                    else
                        coll.fetch();
                },
                save: function() {
                    var model = onlyModel();
                    if (model) model.save();
                },
                attributes: c({
                    read: function() {
                        var model = onlyModel();

                        if (!model)
                            return {};
                        else
                            return model.attributes();
                    },
                    write: function(newAttributes) {
                        var model = onlyModel();

                        if (!model) 
                            return;
                        else
                            models.attributes(newAttributes);
                    }
                })
            }

            return new Model(impl);
        }


        ///// toJSON :: Self -> JSON
        // 
        // Converts the Model to a JSON-friendly value for POST, PUT, etc.

        self.toJSON = function() {
            var result = {};
            _(u(self.attributes)).each(function(value, key) { result[key] = u(value); });
            return result;
        };

        
        ///// withState :: State -> Model
        //
        // Overlays a state on top of this model's state

        self.withState = function(state) {
            return Model( _({}).extend(args, {
                state: c(function() { return state() === 'ready' ? self.state() : state(); })
            }));
        };


        ///// withAttributes :: Attributes -> Model
        //
        // Overlays the provided attributes in the observable.
        // Reads & writes will be appropriately directly to
        // the current attributes and the overlayed attributes.
        
        self.withAttributes = function(overlayedAttributes) {
            return Model( _({}).extend(args, {
                attributes: c({
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
                })
            }));
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

        
        ///// withRelationships :: (String -> Relationship) -> Model
        //
        // Overlays the provided relationship function to this model.

        self.withRelationships = function(additionalRelationships) {
            return Model( _({}).extend(args, {
                relationships: function(attr) { return additionalRelationships(attr) || self.relationships(attr); }
            }));
        };

        
        ///// withName :: String -> Model
        //
        // Replaces the current name.

        self.withName = function(name) {
            return Model( _({}).extend(args, {
                name: name
            }));
        };

        
        // toString :: () -> String
        //
        // Just some sort of friendly-ish string

        self.toString = function() { return 'Model()'; };

        return self;
    };


    ///// LocalModelBackend
    //
    // A ModelBackend that only has the attributes passed in to its constructor,
    // but can have `fetch` and `save` easily overridden for mocking out.

    var LocalModelBackend = function(args) {
        if (!(this instanceof LocalModelBackend)) return new LocalModelBackend(args);

        var self = this;

        args = args || {};
        
        self.name = args.name || "(unknown)";
        self.attributes = args.attributes || {};
        self.uri = args.uri || ('fake:' + Math.random(1000).toString()); // A fake uri also so through a few .withNames, we know a link worked, etc.
        self.debug = args.debug || false;
        self.state = o('ready');

        self.fetch = function(data) { return args.fetch ? args.fetch() : when.resolve(self.attributes); };
        self.save = function(model) { return args.save ? args.save(model) : when.resolve(); };

        self.attributeErrors = o(args.attributeErrors || {});
        self.relationships = args.relationships || function(attr) { return undefined; };

        self.attributes = Attributes({ attributes: args.attributes });

        self.toString = function() { return 'LocalModelBackend()'; };
        
        return self;
    };

    // Convenience wrapper
    var LocalModel = function(args) { return Model(LocalModelBackend(args)); };
    
   
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
        var url = c(function() { return u(args.url); });
        self.state = o( _(args).has('state') ? u(args.state) : 'initial' );
        self.name = args.name || "(unknown)";
        self.debug = args.debug || false;
        self.relationships = args.relationships || function(attr) { return undefined; };
        self.attributeErrors = o({});

        var attributes = o({});

        // Dependency Injection
        var BB = args.Backbone || Backbone;

        //  Set up a private Backbone.Model to handle HTTP, etc.
        var bbModel = new (BB.Model.extend({ url: url }))();
        
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
        
        // This will be mutated to correspond to the latest response; any other response will be ignored.
        var nonce = null;
        function newNonce() { nonce = Math.random(); return nonce; }
        
        self.save = function() { 
            var myNonce = newNonce();
            self.state("saving");
            if (self.debug) console.log(self.name, '==>', bbModel.attributes, '(', self.attributes(), ')');
            bbModel.save({}, { 
                success: function() { 
                    if (nonce === myNonce) {
                        self.attributeErrors({});
                        self.state('ready');
                    } 
                },

                error: function(model, xhr, options) { 
                    if (nonce === myNonce) {
                        // Note that it is pretty much a free-for-all here, so I just assume that a 400 error comes with some dict...
                        var err = JSON.parse(xhr.responseText);
                        self.attributeErrors(adjustTastypieError(err));
                        self.state('ready');
                    }
                }
            });
            return self; // Just to be "fluent"
        };
        
        self.fetch = function() {
            var myNonce = newNonce();
            self.state("fetching");
            if (self.debug) console.log(self.name, '-->', url());
            bbModel.fetch({ 
                success: function(model, response) { 
                    if (nonce === myNonce) {
                        var changedAttributes = model.changedAttributes();
                        if (self.debug) console.log(self.name, '<--', url(), changedAttributes);
                        self.attributes(changedAttributes);
                        self.state('ready');
                    }
                }
            });
            return new Model(self); // Just to be "fluent"
        };
        
        self.toString = function() { return 'RemoteModel'; };

        return new Model(self);
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

        self.name = args.name || '(unknown new model)';

        self.create = args.create || die('Missing required arg `create` for `NewModel`');

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

        self.fetch = function() { 
            if (createdModel())
                return createdModel().fetch(); 
            else
                return self;
        };

        self.save = function() { 
            if (initializationState() === 'ready') {
                createdModel().save();

            } else if (initializationState() === 'initial') {

                // Call the `create` function provided to the constructor
                var createResult = self.create({
                    attributes: initialModel.attributes(),
                    debug: initialModel.debug,
                    name: self.name
                });
                initializationState('saving');

                // It can return a promise or something already a value.
                // If it does not return a promise, it must raise an exception
                // to indicate the failure, so `when` will simulate a promise
                // rejection
                when(createResult)
                    .then(function(actuallyCreatedModel) {
                        createdModel(actuallyCreatedModel);
                        initializationState('ready');
                     })
                    .otherwise(function(creationErrors) {
                        attributeErrors(creationErrors);
                        initializationState('initial');
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

    var Collection = function(args) {
        if (!(this instanceof Collection)) return new Collection(args);

        var self = this;

        args = _({}).extend(args);

        ///// name :: String
        //
        // For debugging, etc

        self.name = args.name;

        ///// uri :: String
        //
        // A URI for this collection that can be a URL or other.
        // It is not validated, but simply used to keep track of
        // some notion of identity.

        self.uri = args.uri;

        ///// relationships :: String -> Relationship | undefined
        //
        // For each attribute of the models in the collection, there may 
        // be a relationship defined or no. It is a function rather 
        // than a dictionary to allow more implementation strategies.
        
        self.relationships = args.relationships;

        ///// data :: Observable {String: *}
        //
        // An observable mostly intended for use in passing a dictionary of
        // querystring information for remote collections. It is actually
        // simply uninterpreted by the Collection class, but passed to
        // the underlying `fetch` implementation.

        self.data = w(args.data || {});
        
        ///// state :: State ("initial" | "fetching" | "ready")
        //
        // If the thing passed in looks like it is already an observable
        // state, with a `reaches` attribute, then it will be used directly,
        // otherwise the value will be assumed to be an initial state.

        self.state = (ko.isObservable(args.state) && _(args.state).has('reaches')) ? args.state : State(args.state || "initial");

        ///// models :: Models
        //
        // A collection of models by URI that supports intelligent
        // bulk update and relationships.

        self.models = Models({ 
            relationships: self.relationships,
            models: args.models
        });

        ///// newModel :: * -> Model
        //
        // Creates a new model in this collection; provided by the
        // implementation. The model will retain all added relationships
        // and subresources.
        
        self.newModel = function(modelArgs) { 
            modelArgs = modelArgs || {};
            modelArgs.attributes = modelArgs.attributes || o({});

            return NewModel({
                debug: self.debug,
                attributes: modelArgs.attributes,
                create: args.create || die ('Collection backend has no `create` method: ' + args)
            }).withRelationships(self.relationships);
        };
        
        ///// relatedCollection :: String -> Collection
        //
        // The collection reached by following the link implied by the
        // provided attribute.

        self.relatedCollection = function(attr) { 
            var rel = self.relationships(attr) || die('No known relationship for ' + self.name + ' via attribute ' + attr);
            return self.relationships(attr).link.resolve(self); 
        };

        ///// fetch :: () -> ()
        //
        // Utilizes the implementation's underlying (pure) `fetch` method
        // to perform a mutating fetch that will set the state to "fetching"
        // while underway and then mutate `models` appropriately.
        //
        // Once fetched, this will re-fetch whenever the `data` changes.

        self.fetch = function() { 
            var modelsPromise = args.fetch( _({}).extend(self.data()) ); 

            when(modelsPromise, 
                 function(modelsByUri) {
                     self.models(modelsByUri);
                     self.state('ready');
                 },
                 function(err) {
                     console.error(err);
                     self.state('ready');
                 });
            
            return self; 
        };
        self.data.subscribe(function() { if (self.state() !== "initial") self.fetch(); });

        // Fluent Combinators
        // ------------------

        ///// withData :: Observable {*} -> Collection
        //
        // Returns a new collection exactly like this one but with `data` augmented with the
        // provided data. **Note** that this extends the current data, it does not replace it.
        
        self.withData = function(additionalData) { 
            return Collection(_(args).extend({
                data: c(function() { return _({}).extend(self.data(), u(additionalData)); }),
            }));
        };

        ///// withRelationships :: (String -> Relationship | undefined) -> Collection
        //
        // A collection with additional relationships.

        self.withRelationships = function(additionalRelationships) {
            return Collection(_(args).extend({
                relationships: function(attr) { return additionalRelationships(attr) || self.relationships(attr); },
                models: self.models(),
            }));
        };
                                 
        
        ///// withSubresourcesFrom :: {String:Collection} -> Collection
        //
        // A collection like this one but where each model will have its
        // attributes populated according to its relationships using the
        // provided collections.

        self.withSubresourcesFrom = function(subresourceCollections) {

            var augmentedModels = c(function() {
                var _models = {};
             
                _(self.models()).each(function(model, uri) {
                    _models[uri] = model.withSubresourcesFrom(subresourceCollections);
                });

                return _models;
            });

            var augmentedState = c(function() {
                var m = _(augmentedModels()).find(function(m) { return m.state() !== "ready"; });
                if ( m ) 
                    return m.state();
                else
                    return self.state();
            });
            
            return Collection(_({}).extend(args, {
                state: augmentedState,

                models: augmentedModels,

                create: function(modelArgs) {
                    var m = LocalModel(modelArgs);
                    var augmentedM = m.withSubresourcesFrom(subresourceCollections);
                    augmentedM.attributes(modelArgs.attributes);
                    return args.create(_({}).extend(modelArgs, {
                        attributes: m.attributes()
                    }));
                },
            }));
        };
    
        ///// withState :: State -> Collection
        //
        // This collection with a new notion of its state.

        self.withState = function(state) {
            return Collection(_({}).extend(args, {
                state: state
            }));
        }

        ///// withName :: String -> Collection
        //
        // This collection with a new name
        
        self.withName = function(name) {
            return Collection(_({}).extend(args, {
                name: name
            }));
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
            var newUrl = c(function() {
                var parsedUrl = URI(u(self.url));
                var newParam = _({}).extend( parsedUrl.query(true), u(additionalParam));

                return parsedUrl.query(newParam).toString();
            });

            return Collection( _({}).extend(args, {
                url: newUrl,
            }));
        };
    };

    ///// LocalCollection
    //
    // All in memory

    var LocalCollection = function(args) {
        return Collection(LocalCollectionBackend(args));
    }

    ////// LocalCollectionBackend
    //
    // A stateless collection backend that always returns the models provided
    // upon construction.

    var LocalCollectionBackend = function(args) {
        if (!(this instanceof LocalCollectionBackend)) return new LocalCollectionBackend(args);

        var self = this;

        args = args || {};

        self.uri = args.uri || ('fake:' + Math.random(1000).toString()); // A fake uri also so through a few .withNames, we know a link worked, etc.
        self.name = args.name || 'LocalCollection({uri: '+self.uri+')';
        self.debug = args.debug || false;
        self.relationships = args.relationships || function(attr) { return undefined; };

        self.state = o('ready');

        self.models = Models({ 
            relationships: self.relationships,
            models: _.chain(u(args.models)).map(function(model, key) { return [key, model.withName(self.name+'['+key+']')]; }).object().value()
        });

        ///// fetch :: () -> Promise {URI:Model}
        //
        // Always immediately resolves with the models provided by the constructor.
        // (Note that in order to mutate the models, self.models() can be mutated)

        self.fetch = args.fetch || function() { return when.resolve(self.models()); };

        
        ///// create :: args -> Promise Model
        //
        // Always immediately returns a LocalModel with the 
        // given args. The args are really just debug, name, attributes.

        self.create = function(modelArgs) {
            return when.resolve(LocalModel(modelArgs));
        }
        
        return self;
    };
    

    ///// RemoteCollection
    //
    // A collection fetched over HTTP from its URI (which is thus a URL)
    // and which saves & creates new models via PUT and POST.

    var RemoteCollection = function(args) {
        return Collection(RemoteCollectionBackend(args));
    }

    ///// RemoteCollectionBackend
    //
    // A collection backend which fetches models from a provided URL.
    
    var RemoteCollectionBackend = function(args) {
        var self = {};
        
        self.url = w(args.url);
        self.name = args.name || "(unknown)";
        self.debug = args.debug || false;
        self.relationships = args.relationships || function(thisColl, attr) { return undefined; };

        self.state = ko.observable("initial");
        self.models = Models(args.models || {});
        var BB = args.Backbone || Backbone; // For swapping out network library if desired, and for testing

        // A private `Backbone.Collection` for dealing with HTTP/jQuery
        var BBCollectionClass = BB.Collection.extend({ 
            url: self.url,
            parse: function(response) { return response.objects; }
        });

        // An ss.Model for an existing model fetching via the collection
        var modelInThisCollection = function(args) {
            return RemoteModel({ 
                debug: self.debug,
                url: args.uri, 
                name: self.name + '[' + args.uri + ']',
                state: 'ready',
                attributes: args.attributes,
                relationships: self.relationships,
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
                    // No nonce needed because the collection's state does not change

                    var createdModel = modelInThisCollection({ 
                        uri: newModel.get('resource_uri'), // Requires tastypie always_return_data = True; could/should fallback on Location header
                        attributes: newModel.attributes 
                    });

                    updateModels([newModel], { extend: true });
                    doneCreating.resolve(createdModel);
                },
                error: function(model, xhr, options) {
                    var err = JSON.parse(xhr.responseText);
                    doneCreating.reject(adjustTastypieError(err));
                }
            });
            
            return doneCreating.promise;
        }

        
        ///// fetch :: {String: *} -> Promise {URI:Model}
        //
        // A promise that resolves with the models that correspond to the
        // provided data.
    
        self.fetch = function(data) {
            if (self.debug) console.log(self.name, '-->', self.url(), '?', u(data)); //URI().query(self.data()).query());
            
            // The special value NOFETCH is used to indicate with certainty that the result
            // of the fetch will be empty, so we should elide hitting the network. This occurs
            // somewhat often during automatic dependency propagation and is no problem.

            if (_(data).any(function(v) { return v === NOFETCH; })) {
                if (self.debug) console.log(self.name, '<--', self.url(), '(not bothering)');
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

        self.url = w(args.url);
        self.state = o("initial");
        self.debug = args.debug || false;
        self.collections = Collections({ debug: self.debug, relationships: args.relationships });
        self.name = args.name || 'solidstate.RemoteApi';

        // The actual API metadata endpoint (a la Tastypie) is implemented as a Backbone model
        // where each attribute is a resource endpoint
        var bbModel = new (Backbone.Model.extend({ url: self.url }))();

        var updateCollections = function(attributes) {
            if (!attributes) return; // changedAttributes returns false, not {}, when nothing has changed

            var additionalCollections = {};
            _(attributes).each(function(metadata, name) {
                additionalCollections[name] = RemoteCollection({ 
                    name: name,
                    debug: self.debug,
                    url: metadata.list_endpoint,
                    schema_url: metadata.schema,
                });
            });

            self.collections(additionalCollections);
        };

        var nonce = null;
        var newNonce = function() { nonce = Math.random(); return nonce; };

        self.fetch = function() {
            self.state("fetching");
            if (self.debug) console.log(self.name, '-->', u(self.url));
            var myNonce = newNonce();
            bbModel.fetch({
                success: function(model, response) { 
                    if (nonce === myNonce) {
                        if (self.debug) console.log(self.name, '<--', u(self.url));
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
