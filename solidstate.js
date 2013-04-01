"use strict";
define([ 
    'jquery',
    'underscore',
    'backbone', 
    'knockout',
    'URIjs',
], function($, _, Backbone, ko, URI) {

    // Alias extremely common knockout functions.
    // Trust me, this actually improves readability.
    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v) },
        die = function(msg) { throw new Error(msg); };
    
    // Secret value that indicates something should not bother to fetch
    var NOFETCH = "solidstate.NOFETCH";

    var when = function(thingWithState, goalState, callback) {
        if (thingWithState.state.peek() === goalState) {
            callback();
        } else {
            var subscription = thingWithState.state.subscribe(function() {
                if (thingWithState.state.peek() === goalState) {
                    subscription.dispose();
                    callback();
                }
            });
        }
    };

    // Really poor/basic serialization
    var toJValue = function(value) { return JSON.parse(JSON.stringify(value)) };

    // Random Tastypie support code
    var adjustTastypieError = function(err) {
        // Sometimes it is a dictionary keyed by class name, with a list, other times, just a one-element dict with {"error": <some string>}
        if ( _(_(err).values()[0]).isString() ) {
            return {'__all__': _(err).values()}
        } else {
            return _(err).values()[0];
        }
    }

    // type observableLike = a | ko.observable a

    // utility Attributes, a dictionary where setting the whole dictionary actually hits each observable,
    // and extension is easy, as well as overlay.
    // In particular it DOES NOT unwrap observable attributes when they are added, since they
    // may be wacky computed observables.

    // args :: {
    //   attributes :: String ->
    // }
    var Attributes = function(args) {
        args = args || {};
        var self = {};
        var makeAttribute = args.makeAttribute || function(key, value) { return ko.observable(value); };

        var actualAttributes = o({})

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
    }

    // interface Model =
    // {
    //   state           :: observable ("intial" | "ready" | "fetching" | "saving")  // read only
    //   attributes      :: observable {String: observable *}
    //   attributeErrors :: observable { String -> observable [String] } // for validation or backend errors, etc
    //
    //   fetch      :: () -> ()
    //   save       :: () -> ()
    //
    //   relationships     :: (String, Collection) -> Collection
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
    //   withAttributes        :: observableLike {String: observableLike ??} -> Model  // Overlays those attributes
    //   withSubresourcesFrom :: {String: Collection} -> Model                      // Plugs in models from the collection for URLs, else state is "fetching"
    //
    //   relatedModel      :: String -> Model       // Just looks up by URL
    //   relatedCollection :: String -> Collection  // Looks up via relationships
    //
    //   when :: (String, () -> ()) -> ()
    // }
    var Model = function(implementation) {
        var self = _(this).extend(implementation);

        if ( typeof self.attributeErrors === 'undefined' ) self.attributeErrors = o({});

        if ( typeof self.attributes === 'undefined' ) self.attributes = o({});

        self.fetch = function() { implementation.fetch(); return self; };

        self.save = function() { implementation.save(); return self; };

        self.relatedCollection = function(attr) { 
            var justThisModelCollection = new Collection({ 
                state: self.state, 
                models: c(function() { return [self]; })
            });
            return self.relationships(justThisModelCollection, attr); 
        };

        self.toJSON = function() {
            var result = {};
            _(u(self.attributes)).each(function(value, key) { result[key] = u(value); });
            return result;
        };

        self.when = function(goalState, callback) {
            when(self, goalState, callback);
            return self; // just to be fluent
        };

        self.withState = function(state) {
            var impl = _({}).extend(self, {
                state: c(function() { return state() === 'ready' ? self.state() : state() })
            });

            return new Model(impl);
        };
        
        self.withAttributes = function(overlayedAttributes) {
            var impl = _({}).extend(self, {
                attributes: c({
                    read: function() {
                        var underlyingAttributesNow = self.attributes();
                        var overlayedAttributesNow = u(overlayedAttributes);

                        return _({}).extend(underlyingAttributesNow, overlayedAttributesNow);
                    },
                    
                    write: function(updatedAttributes) { 
                        var underlyingAttributesNow = self.attributes();
                        var overlayedAttributesNow = overlayedAttributes();
                        var overlayedKeys = _(overlayedAttributesNow).keys();
                        
                        overlayedAttributes( _(updatedAttributes).pick(overlayedKeys) );

                        // We should never again touch attributes hidden by the overlay; in order for them
                        // not to be erased they must be set here as well.
                        self.attributes( _({}).extend(_(underlyingAttributesNow).pick(overlayedKeys),
                                                      _(updatedAttributes).omit(overlayedKeys)) );
                    }
                })
            });

            return new Model(impl);
        };
        
        // Plugs in for the subresources
        self.withSubresourcesFrom = function(subresourceCollections) {
            var augmentedAttributes = c({
                write: function(_updatedAttributes) {
                    var updatedAttributes = _(_updatedAttributes).clone();

                    for (var field in updatedAttributes) {
                        if ( ! _(updatedAttributes[field]).isString() ) {
                            if ( _(subresourceCollections).has(field) ) {
                                updatedAttributes[field] = updatedAttributes[field].resource_uri;
                            }
                        }
                    }
                    
                    // Note that this does not properly go through the individual observables.... don't use it?
                    self.attributes(updatedAttributes); // Avoid writing the obj to underlying as that would screw it up
                },
                read: function() {
                    var underlyingAttributes = self.attributes();
                    var overlayedAttributes = {};

                    _(subresourceCollections).each(function(subcoll, field) {
                        // Force the attribute to exist, so it can be properly proxied
                        if ( !_(self.attributes()).has(field) ) {
                            var newAttr = {};
                            newAttr[field] = o(undefined);
                            self.attributes(newAttr); // Now this only extends anyhow _(underlyingAttributes).extend(newAttr) );
                        }

                        var underlyingAttribute = self.attributes()[field];

                        if ( typeof underlyingAttribute === 'undefined' ) {
                            console.log('WARNING: attempt to link to subresource via undefined attribute', field);
                            return;
                        }

                        overlayedAttributes[field] = c({
                            read: function() {
                                var subcoll = subresourceCollections[field];
                                var models = _(subcoll).has('models') ? u(subcoll.models) : u(subcoll);
                                var val = underlyingAttribute();

                                if ( _(val).isString() || _(val).isNumber() ) {
                                    var found = models[val];
                                    if ( !found ) {
                                        return undefined;
                                    } else if ( _(found).has('state') && (u(found.state) !== 'ready') ) {
                                        return null; // Note that we *could* return the unready thing...
                                    } else {
                                        return found;
                                    }
                                } else if ( _(val).isArray() ) {
                                    var newVal = [];
                                    for (var i in val) {
                                        var found = models[val[i]];
                                        if ( found ) 
                                            newVal.push(found)
                                        else
                                            return null;
                                    }
                                    return newVal;
                                }
                            },

                            write: function(model) {

                                // Supports writing raw values, too, at user's risk
                                if ( _(model).isString() || _(model).isNumber() || _(model).isNull() ) {
                                    underlyingAttribute(model);
                                } else {
                                    underlyingAttribute(model.attributes().resource_uri()); // TODO: make resource_uri configured not hardcoded
                                }
                            }
                        });
                    });
                    return overlayedAttributes;
                }
            });
                
            var withAttrs = self.withAttributes(augmentedAttributes);

            return withAttrs.withState(c(function() {
                for (var field in subresourceCollections) {
                    if ( !self.attributes()[field]() ) 
                        return 'ready';

                    var val = withAttrs.attributes()[field]()

                    if ( !val )
                        return "fetching";

                    if ( _(val).has('state') && (val.state() !== 'ready') ) 
                        return val.state();

                    if ( _(val).isArray() ) {
                        for (var i in val) {
                            if ( _(val[i]).has('state') && (val[i].state() !== 'ready') )
                                return val[i].state();
                        }
                        return 'ready';
                    }

                    return "ready";
                }
            }));

            
        }

        self.toString = function() { return 'Model()'; };

        return self;
    }

    // Model constructor from just a dictionary of attributes that just stores them
    // for mocking/testing/etc, it will also accept `fetch`, `state`, and `save` callbacks,
    // to which it will pass itself.
    var LocalModel = function(args) {
        var self = {};

        args = args || {};
        
        self.name = args.name || "(unknown)";
        self.debug = args.debug || false;
        self.state = o('ready');
        self.relationships = args.relationships || function(thisColl, attr) { return null; };
        self.fetch = function() { if (args.fetch) args.fetch(self); return self; };
        self.save = function() { if (args.save) args.save(self); return self; };
        self.attributeErrors = o(args.attributeErrors || {});

        self.attributes = Attributes({ attributes: args.attributes });

        return new Model(self);
    }

    var BBWriteThroughObservable = function(args) {
        var underlyingObservable = o();
        var bbModel = args.bbModel;
        var attribute = args.attribute;
        
        underlyingObservable.subscribe(function(newValue) {
            bbModel.set(attribute, newValue, { silent: true });
        });

        underlyingObservable(args.value);

        return underlyingObservable;
    }
    
    // Model constructor from url, data, attributes
    //
    // args ::
    // {
    //   url                :: String | ko.observable String
    //   attributes         :: {String: ??} // initial attributes
    //   relationships      :: (Collection, String) -> Collection
    // }
    var RemoteModel = function(args) {
        var self = {};
        
        // Begins in 'ready' state with no attributes
        var url = c(function() { return u(args.url); });
        self.state = o( _(args).has('state') ? u(args.state) : 'initial' );
        self.name = args.name || "(unknown)";
        self.debug = args.debug || false;
        self.relationships = args.relationships || function(thisColl, attr) { return null; };
        self.attributeErrors = o({});

        var attributes = o({});

        // Dependency Injection
        var BB = args.Backbone || Backbone;
        
        self.relatedModel = function(attr) {
            var justThisModelCollection = new Collection({ 
                state: self.state, 
                models: c(function() {
                    var models = {};
                    models[url] = self;
                    return models; 
                })
            });
            
            return RemoteModel({
                name: self.name + '.' + attr,
                url: self.attributes()[attr],
                debug: self.debug,
                relationships: self.relationships(justThisModelCollection, attr).relationships
            });
        }
        
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
        })
        
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
                        if (self.debug) console.log(self.name, '<--', url(), changedAttributes)
                        self.attributes(changedAttributes);
                        self.state('ready');
                    }
                }
            });
            return new Model(self); // Just to be "fluent"
        };
        
        self.toString = function() { return 'RemoteModel'; };

        return new Model(self);
    }

    // A model that has not been saved yet. It need not be a REST backend, but anything where
    // save() must occur and then we'll get a real Model back.
    //
    // Current has a permanent (tiny) proxy overhead
    var NewModel = function(args) {
        var self = {},
            create = args.create;

        // This state marches from initial -> saving -> ready
        var initializationState = o('initial');

        // Use an initial local model until first save, when we pass the gathered data on
        var initialModel = LocalModel({
            name: args.name,
            debug: args.debug,
            attributes: args.attributes,
        })

        var attributeErrors = o({});

        // This changes one before initializationState, so the internal bits that depend on it fire before the
        // external world gets a state change (depending on attributes() before checking state() means client is out of luck!)
        var createdModel = o(null)
        
        self.state = c(function() { return initializationState() === 'ready' ? createdModel().state() : initializationState() });
        
        self.attributeErrors = c(function() { return createdModel() ? createdModel().attributeErrors() : attributeErrors() });
       
        self.attributes = c({
            read: function() { return createdModel() ? createdModel().attributes() : initialModel.attributes() },
            write: function(attrs) { createdModel() ? createdModel().attributes(attrs) : initialModel.attributes(attrs) }
        });
        
        self.relatedCollection = function(model, attr) {
            if (createdModel())
                return createdModel().relatedCollection(model, attr);
        }

        self.fetch = function() { 
            if (createdModel())
                createdModel().fetch(); 
            return self;
        }

        self.save = function() { 
            if (initializationState() === 'initial') {
                var createResult = create({
                    attributes: initialModel.attributes(),
                    debug: initialModel.debug,
                    name: initialModel.name
                });
                initializationState('saving');

                // Note: this leaks - once it becomes ready or error the other can never happen, but
                // I don't really want to expose subscriptions explicitly; thinking about the right move
                when(createResult, 'ready', function() {
                    createdModel(createResult.model());
                    initializationState('ready');
                });
                when(createResult, 'error', function() {
                    attributeErrors(createResult.attributeErrors());
                    initializationState('error');
                    initializationState('initial');
                });
            } else if (initializationState() === 'ready') {
                createdModel().save()
            }
            return self;
        }

        return new Model(self);
    };
                                                   
    // Interface Collection =
    // {
    //   state  :: ko.observable ("initial" | "ready" | "fetching" | "saving") // read only
    //   models :: ko.observable {String: Model}                              // keyed on model URI
    //
    //   fetch    :: () -> ()
    //   newModel :: {String:??} -> ()  // input is attributes for a new Model
    //
    //   relationships      :: (Collection, String) -> Collection
    // }

    // Implementation wrapper with fluent interface
    //
    // {
    //   withRelatedSubresources :: [String] -> Collection
    //   withSubresourcesFrom    :: {String: Collection} -> Collection
    //   withRelationships        :: ( (Collection, String) -> Collection ) -> Collection
    //
    //   // only available if the underlying collection provides it
    //   withData                 :: ({String:??} | ko.observable {String:??}) -> Collection 
    //   withName                 :: String -> Collection
    //   relatedCollection :: String -> Collection   // Passes in self to the above
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

    var Collection = function(implementation) {
        var self = _(this).extend(implementation);
        
        self.relatedCollection = function(attr) { return self.relationships(self, attr); }

        self.fetch = function() { implementation.fetch(); return self };

        self.when = function(goalState, callback) {
            when(self, goalState, callback);
            return self; // just to be fluent
        }

        //self.withData = function(data) { return new Collection(implementation.withData(data)); }
        //self.withName = function(name) { return new Collection(implementation.withName(name)); }

        self.withRelationships = function(additionalRelationships) {
            var impl = _({}).extend(self, {
                relationships: function(coll, attr) { return additionalRelationships(coll, attr) || self.relationships(coll, attr); }
            });
            
            return new Collection(impl);
        }
        
        self.withSubresourcesFrom = function(subresourceCollections) {

            var augmentedModels = c(function() {
                var _models = {};
                
                _(self.models()).each(function(model, uri) {
                    _models[uri] = model.withSubresourcesFrom(subresourceCollections);
                });

                return _models;
            });
            
            var impl = _({}).extend(self, {
                state: c(function() {
                    var m = _(augmentedModels()).find(function(m) { return m.state() !== "ready"; });
                    if ( m ) 
                        return m.state()
                    else
                        return self.state();
                }),

                newModel: function(args) {
                    return self.newModel(args).withSubresourcesFrom(subresourceCollections);
                },
                
                models: augmentedModels
            });

            return new Collection(impl);
        }

        self.withRelatedSubresources = function() {
            var attrs = arguments;
            var colls = {};
            _(attrs).each(function(attr) { colls[attr] = self.relatedCollection(attr).fetch(); });

            return self.withSubresourcesFrom(colls);
        }
    };
    
    // Collection constructor for remote collections
    //
    // args ::
    // {
    //   url                :: observableLike String
    //   data               :: observableLike {String:??} 
    //   name               :: String // just for debugging
    // }
    var RemoteCollection = function(args) {
        var self = {};
        
        self.url = w(args.url);
        self.data = w(args.data || {});
        self.name = args.name || "(unknown)";
        self.debug = args.debug || false;
        self.relationships = args.relationships || function(thisColl, attr) { return null; };

        self.state = ko.observable("initial");
        self.models = ko.observable({});
        var BB = args.Backbone || Backbone; // For swapping out network library if desired, and for testing
        
        // A private `Backbone.Collection` for dealing with HTTP/jQuery
        var bbCollectionClass = BB.Collection.extend({ 
            url: self.url,
            parse: function(response) { return response.objects; }
        });
        var bbCollection = new bbCollectionClass();

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
        
        // Because of the simplified state machine, we only have to subscribe to 'reset'
        // TODO: Never remove a model, but force client code to filter & sort and let
        // this just be a monotonic knowledge base.
        var updateModels = function(receivedModels, options) {
            if (self.debug) console.log(self.name, '<--', '(' + _(receivedModels).size() + ' results)');

            var next_models = _(self.models.peek()).clone();
            var models_changed = false;
            
            // Adjust any existing models, add new ones
            _(receivedModels).each(function(bbModel) {
                var uri = bbModel.get('resource_uri'); // Without this, we don't actually have a "Model" per se
                
                if ( _(next_models).has(uri) ) {
                    next_models[uri].attributes(bbModel.attributes);
                } else {
                    models_changed = true;
                    next_models[uri] = modelInThisCollection({ 
                        uri: uri, 
                        attributes: bbModel.attributes,
                    });
                }
            });
            
            // Remove any non-present models
            if ( !(options && options.extend) ) {
                _.chain(next_models).keys().difference(bbCollection.pluck('resource_uri')).each(function(uri) {
                    delete next_models[uri];
                    models_changed = true;
                });
            }
            
            // Mutate the dict if it has changed
            if (models_changed) {
                self.models(next_models);
            }
        }
    
        // This will be mutated to correspond to the latest response; any other response will be ignored.
        var nonce = null;
        function newNonce() { nonce = Math.random(); return nonce; }
        
        self.newModel = function(args) { 
            args = args || {};
            args.attributes = args.attributes || o({});

            return NewModel({
                debug: self.debug,
                attributes: args.attributes,
                create: function(args) { 
                    var modelHoldingPen = {
                        state: o('saving'),
                        model: o(null),
                        attributeErrors: o({})
                    }

                    // Will trigger an "add" hence `updateModels` once the server responds happily
                    var payload = toJValue(LocalModel(args));
                    if (self.debug) console.log(self.name, '==>', payload);

                    var bbModel = bbCollection.create(payload, {
                        wait: true,
                        success: function(newModel, response, options) { 
                            // No nonce needed because the collection's state does not change
                            var createdModel = modelInThisCollection({ 
                                uri: newModel.get('resource_uri'), // Requires tastypie always_return_data = True; could/should fallback on Location header
                                attributes: newModel.attributes 
                            });

                            updateModels([newModel], { extend: true });
                            modelHoldingPen.model(createdModel);
                            modelHoldingPen.state('ready'); 
                        },
                        error: function(model, xhr, options) {
                            var err = JSON.parse(xhr.responseText);
                            modelHoldingPen.attributeErrors(adjustTastypieError(err));
                            modelHoldingPen.state('error');
                        }
                    });
                    
                    return modelHoldingPen;
                }
            });
        };
        
        self.fetch = function() {
            if (self.debug) console.log(self.name, '-->', self.url(), '?', $.param(self.data(), true));

            var _data = _({}).extend(self.data());
            if (_(_data).any(function(v) { return v === NOFETCH; })) {
                if (self.debug) console.log(self.name, '<--', self.url(), '(not bothering)');
                self.state("ready"); // Equivalent to having fetched instantaneously and gotten no results
                return self;
            }

            self.state('fetching');
            var myNonce = newNonce();
            bbCollection.fetch({ 
                traditional: true,
                data: _data,
                success: function(collection, response) { 
                    if (nonce === myNonce) {
                        updateModels(collection.models);
                        self.state('ready'); 
                    }
                }
            });
            
            return self; // Just to be "fluent"
        };
        self.data.subscribe(function() { if (self.state() !== "initial") self.fetch(); });

        //
        // Special fluent method for remote collections
        //
        self.withData = function(additionalData) { 
            return RemoteCollection({
                name: self.name,
                debug: self.debug,
                url: self.url,
                data: c(function() { return _({}).extend(self.data(), u(additionalData)); }),
                relationships: self.relationships
            });
        };

        self.withParam = function(additionalParam) {
            var newUrl = c(function() {
                var parsedUrl = URI(u(self.url));
                var newParam = _({}).extend( _(parsedUrl.param()).omit(""), u(additionalParam))
                var protocolPrefix = parsedUrl.attr('protocol') ? (parsedUrl.attr('protocol') + '://') : '';

                return protocolPrefix + parsedUrl.attr('path') + '?' + $.param(newParam, true);
            });

            return RemoteCollection({
                name: self.name,
                debug: self.debug,
                url: newUrl,
                data: self.data,
                relationships: self.relationships
            });
        };
        
        self.withName = function(name) { 
            return RemoteCollection({
                name: name,
                debug: self.debug,
                url: self.url,
                data: self.data,
                relationships: self.relationships
            });
        };

        return new Collection(self);
    }

    // The "bulk" version of a URI, which links one model to another.
    // This is a construct at a lower level than a Join, that tells
    // how exactly to efficiently fetch the other end of a relationship.
    //
    // interface CollectionLink {
    //   link :: src:Collection -> target:Collection -> dst:Collection
    // }
    var CollectionLink = function(impl) {
        var self = _(this).extend(impl);
    };

    // FilterLink contructor, based on adding querystring to dest, with args :: {
    //   withData :: {String: Model -> String|Number}  // A dictionary of how to build the filter
    // } 
    var FilterLink = function(args) {
        var self = {};

        var withData = args.withData || die('No withData provided to FilterLink');

        self.link = function(source, target) {
            // Build a compacted and uniq'd set of a data to minimize jitter
            var targetData = c(function() {
                var data = {};
                _(withData).each(function(fn, key) {
                    var vals = _.chain(source.models())
                        .values()
                        .map(fn)
                        .filter(function(v) { return _(v).isString() || _(v).isNumber(); }) 
                        .uniq()
                        .value()
                        .sort();

                    if ( _(vals).isEmpty() ) vals = NOFETCH;

                    data[key] = vals
                });

                // And... danger / hardcoding for tastypie for now (can actually be easily expressed in the client code, but verbose)
                data['limit'] = 0;

                return data;
            }).extend({throttle: 1});

            return target.withData(targetData);
        }

        return new CollectionLink(self);
    }

    // Another very common case is building a filter on the other end from the source object
    var FromOneFilterLink = function(args) {
        var from      = args.from      || 'id',
            transform = args.transform || function(x) { return x; },
            to        = args.to;

        var withData = {};
        withData[to] = function(model) { return transform(u(model.attributes()[from])); };
        
        return FilterLink({ withData: withData })
    }
    
    // Of which the most most common case is a direct URL in the source object,
    // but we must do a bulk operation and we don't yet support tastypie-esque multiget,
    // so the assumption, to default to small(er) querystrings, is that the id
    // can be parsed out of the Url as the last component, and filtered via id__in
    var DirectUrlLink = function(args) {
        return FromOneFilterLink({
            from:      args.from || dir('No attribute provided for a DirectUrlLink'),
            transform: function(uri) { return uri ? URI(uri).segment(-1) : undefined; },
            to:        'id__in'
        });
    }

    // Sometimes there is an array of Urls... then actually FromOneFilterLink is not
    // suitable and you need a ToManyFilterLink
    var MultiUrlLink = function(args) {
        // TODO (so far they are all better expressed as FromOne for smaller urls
    }
    
    // The dual to a CollectionLink, which does the multiget, is the bit that
    // extracts just the right value from the resulting collection.
    // (These two are generally closely related, but it is helpful to separate
    // the concepts and then generate them from the same spec)
    // This part I don't have a good name for, so I call a Dereference
    //
    // interface Dereference = {
    //   deref :: src:Model -> dst:Collection -> Model or [Model] // if it was "to many"
    // }
    var Dereference = function(implementation) {
        var self = _(this).extend(implementation);

        // ...
    }

    // A common case is that some attribute is exactly the Url to extract from the collection (or dictionary, special case)
    var DirectDeref = function(args) {
        var self = {},
            from = args.from || die('Required argument `from` not provided to DirectUrlDeref');
        
        self.deref = function(source, destination) {
            var to = u(source.attributes()[from]);

            if ( destination instanceof Collection ) {
                return destination.models()[to]
            } else {
                return destination[to];
            }
        }

        return new Dereference(self);
    }

    // Another common case is that there is no attribute in the source, but anything matching a certain filter should go in
    // i.e. a join, and likely a filter related to that of the query for the multiget!
    var FilterDeref = function(args) {
        var self   = {},
            filter = args.filter || die('Missing required arg `filter` for FilterDeref')

        self.deref = function(source, destination) {
            var dest = destination instanceof Collection ? u(destination.models) : u(destination);

            return _.chain(dest)
                .filter(function(m) { return filter(source, m); })
                .value();
        }

        return new Dereference(self);
    };

    // Special case is easy
    var JoinToManyDeref = function(args) {
        var from = args.from || die('Missing required argument `from` in solidstate.JoinToManyDeref'),
            to   = args.to   || die('Missing required argument `to` in solidstate.JoinToManyDeref');

        return FilterDeref({
            filter: function(source, destination) { return u(source.attributes()[from]) === u(destination.attributes()[to]); }
        })
    };

    // Put them together, and you've got a relationship (but you can customize a relationship that is not built from them)
    //
    // interface Relationship = {
    //   link  :: src:Collection -> dst:Collection -> Collection
    //   deref :: src:Model      -> dst:Collection -> Model or [Model] as appropriate
    // }
    var Relationship = function(impl) {
        var self = _(this).extend(impl);
    };
    
    // So common!
    var Rel = function(args) {
        var self = {
            link: args.link.link,  // args.link is a constructed CollectionLink object
            deref: args.deref.deref // args.deref is a constructed Dereference object
        };

        return new Relationship(self);
    }
    
    
    // JoinRelationship constructor with args ::
    // {
    //   type     :: ("toOne" | "toMany" | "fromOne" | "fromMany")  // how the two collections get linked up
    //
    //   key           :: String                     // What field from the src to gather up
    //   keyType      :: ("id" | "uri" | function)  // Modification to the extracted keys to get
    //   reverseField :: String                     // Querystring field on a derived collection that will receive the keys
    // }
    var JoinRelationship = function(args) {
        var self = {};

        self.type = args.type || "toOne"; 
        self.reverseField = args.reverseField || 'id__in';
        self.data = w(args.data || {});
        
        // To minimize specification for the most efficient and common case, the default depends on self.type
        self.keyType = args.keyType || ( ((self.type === "toOne")||(self.type === "toMany")) ? "uri" : "id" );
        self.key = args.key || ( ((self.type === "toOne")||(self.type === "toMany")) ? "resource_uri" : "id" ); // The attribute on the source collection

        self.link = function(sourceCollection, destCollection) {
            // This should cut off computation if the actual related items has not changed
            var relatedKeys = c(function() { 
                var attrs = _.chain(sourceCollection.models()).values().map(function(m) { return u(m.attributes()[self.key]); });

                if ( self.type === "toMany" ) {
                    attrs = attrs.flatten();
                } else if ( (self.type === "toOne") || (self.type === "fromMany") ) {
                    // Nothing
                } else {
                    throw ("Invalid relationship type: " + self.type)
                }

                // Hard-codey way of avoiding null and other problems
                attrs = attrs.filter(function(v) { return _(v).isString() || _(v).isNumber(); }) 

                if ( self.keyType === 'id' ) {
                    // Nothing
                } else if ( self.keyType === 'uri' ) {
                    attrs = _(attrs).map(function(v) { return URI(v).segment(-1); });
                } else if ( _(self.keyType).isFunction() ) {
                    attrs = _(attrs).map(self.keyType);
                } else {
                    throw ("Invalid key type " + self.keyType);
                }

                return attrs.uniq().value().sort();
            }).extend({throttle: 1});

            // This should only fire if the sorted set of attributes has actually changed
            var data = c(function() {
                var keys = relatedKeys();
                if ( _(keys).isEmpty() ) { keys = NOFETCH; }
                
                var _data = _(self.data()).clone();
                _data.limit = 0; // Enough rope to hang yourself with, but partial join only break things
                _data[self.reverseField] = keys;
                return _data;
            });
               
            return destCollection.withData(data); // Paging, as always, sucks.
        }

        return new Relationship(self);
    }
    
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

        self.fetch = function() { impl.fetch(); return self };
        self.when = function(goalState, callback) { when(self, goalState, callback); return self; };
    }
    
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
        self.collections = o({});
        self.debug = args.debug || false;
        self.name = args.name || 'solidstate.RemoteApi';
        var relationships = {};
        
        // underscore maintainers have rejected implementing proper map for objects, so do it mutatey-like
        _(args.relationships).each(function(relationshipsByDest, sourceName) {
            _(relationshipsByDest).each(function(relationshipParams, attr) {
                relationships[sourceName] = relationships[sourceName] || {};

                var rel = _(relationshipParams).has('rel') ? relationshipParams.rel
                    : JoinRelationship({
                        debug: self.debug,
                        key: relationshipParams.key || attr,
                        keyType: relationshipParams.keyType,
                        type: relationshipParams.type,
                        reverseField: relationshipParams.reverseField
                    });

                relationships[sourceName][attr] = {
                    collection: relationshipParams.collection,
                    rel: rel
                };
            });
        })

        // The actual API metadata endpoint (a la Tastypie) is implemented as a Backbone model
        // where each attribute is a resource endpoint
        var bbModel = new (Backbone.Model.extend({ url: self.url }))();

        var updateCollections = function(attributes) {
            if (!attributes) return; // changedAttributes returns false, not {}, when nothing has changed

            var nextCollections = _(self.collections()).clone();
            var collectionsDidChange = false;
            
            // Adjust any existing collections, add new ones.
            // Note that this is going to break any existing deps!
            _(attributes).each(function(metadata, name) {
                var uri = metadata.list_endpoint;
                
                if ( _(nextCollections).has(name) ) {
                    // Do nothing!
                } else {
                    if (self.debug) console.log(' - ', name);
                    nextCollections[name] = RemoteCollection({ 
                        name: name,
                        debug: self.debug,
                        url: metadata.list_endpoint,
                        schema_url: metadata.schema,
                        relationships: function(coll, attr) { return self.relatedCollection(name, attr, coll); }
                    });
                    collectionsDidChange = true;
                }
            });
            
            // Mutate the dict if it has changed
            if (collectionsDidChange) {
                self.collections(nextCollections);
            }
        };

        var nonce = null;
        var newNonce = function() { nonce = Math.random(); return nonce; }

        self.fetch = function() {
            self.state("fetching");
            if (self.debug) console.log(self.name, '-->', u(self.url))
            var myNonce = newNonce();
            bbModel.fetch({
                success: function(model, response) { 
                    if (nonce === myNonce) {
                        if (self.debug) console.log(self.name, '<--', u(self.url))
                        updateCollections(model.changedAttributes());
                        self.state('ready'); 
                    } 
                }
            });

            return self; // Just to be "fluent"
        };

        self.relatedCollection = function(sourceName, attr, sourceCollection) {
            var relationship = relationships[sourceName][attr]; 

            if (!relationship) 
                throw ("No known relationship for " + sourceName + "." + attr)

            var destCollection = self.collections()[relationship.collection];

            if ( !destCollection ) 
                throw ("No collection named " + relationship.collection);

            destCollection = destCollection.withName(sourceName + '.' + attr);

            // Get the related collection and rewrite its relationships to be keyed off the proper src name
            return relationship.rel.link(sourceCollection, destCollection).withRelationships(function(coll, attr) {
                return self.relatedCollection(relationship.collection, attr, coll);
            });
        };

        var api = new Api(self);
        return api;
    }

    //
    // AMD Module
    //
    return {
        // Interfaces
        Model: Model,
        Collection: Collection,
        CollectionLink: CollectionLink,
        Dereference: Dereference,
        Relationship: Relationship,
        Api: Api,

        // Implementations
        LocalModel: LocalModel,
        NewModel: NewModel,
        RemoteModel: RemoteModel,
        RemoteCollection: RemoteCollection,
        FilterLink: FilterLink,
        FromOneFilterLink: FromOneFilterLink,
        DirectUrlLink: DirectUrlLink,
        DirectDeref: DirectDeref,
        FilterDeref: FilterDeref,
        JoinToManyDeref: JoinToManyDeref,
        Rel: Rel,
        RemoteApi: RemoteApi,

        // Helpers, exposed for testing and whatever
        Attributes: Attributes,
        BBWriteThroughObservable: BBWriteThroughObservable,

        // Misc 
        NOFETCH: NOFETCH
    }
});
