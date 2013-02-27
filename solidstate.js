"use strict";
define([ 
    'jquery',
    'underscore',
    'backbone', 
    'knockout',
    'purl',
], function($, _, Backbone, ko, purl) {

    // Alias extremely common knockout functions.
    // Trust me, this actually improves readability.
    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v) };
    
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
    }

    // type observableLike = a | ko.observable a

    // interface Model =
    // {
    //   state      :: observable ("intial" | "ready" | "fetching" | "saving")  // read only
    //   attributes :: observable {String: observable *}
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

        self.fetch = function() { implementation.fetch(); return self };
        
        self.relatedCollection = function(attr) { 
            var justThisModelCollection = new Collection({ 
                state: self.state, 
                models: c(function() { return [self]; })
            });
            return self.relationships(justThisModelCollection, attr); 
        }


        self.when = function(goalState, callback) {
            when(self, goalState, callback);
            return self; // just to be fluent
        }

        self.withState = function(state) {
            var impl = _({}).extend(self, {
                state: c(function() { return state() === 'ready' ? self.state() : state() })
            });

            return new Model(impl);
        }
        
        self.withAttributes = function(attributes) {
            var impl = _({}).extend(self, {
                attributes: c({
                    read: function() {
                        var oldAttributes = self.attributes();
                        var newAttributes = attributes();

                        return _({}).extend(oldAttributes, newAttributes);
                    },
                    
                    write: function(updatedAttributes) { 
                        var newAttributes = attributes();
                        
                        attributes( _(updatedAttributes).pick(_(newAttributes).keys()) );
                        self.attributes( _({}).extend(self.attributes(), _(updatedAttributes).omit(_(newAttributes).keys())) );
                    },
                })
            });

            return new Model(impl);
        };
        
        // Plugs in for the subresources
        self.withSubresourcesFrom = function(subresourceCollections) {
            var augmentedAttributes = c({
                write: self.attributes.write,
                read: function() {
                    var foundAttributes = {};
                
                    // Using loops instead of _.map to short-circuit ASAP if something is not found
                    for (var field in subresourceCollections) {
                        
                        // Be a little flexible about accepting a collection or a dictionary, for testing & providing literal collections
                        var subcoll = subresourceCollections[field];
                        var models = _(subcoll).has('models') ? u(subcoll.models) : u(subcoll);

                        var val = self.attributes()[field]();
                        
                        // If an object is already here, it won't be a string or number and we are OK with that
                        if ( _(val).isString() || _(val).isNumber() ) {
                            var found = models[val];
                            if ( !found ) {
                                return null;
                            } else if ( _(found).has('state') && (u(found.state) !== 'ready') ) {
                                return null;
                            } else {
                                foundAttributes[field] = w(found); 
                            }
                        } else if ( _(val).isArray() ) {
                            var new_val = [];
                            for (var i in val) {
                                var found = models[val[i]];
                                if ( found ) 
                                    new_val.push(found)
                                else
                                    return null;
                            }
                            foundAttributes[field] = w(new_val);
                        }
                    }
                    return foundAttributes;
                }
            });
                    
            var withAttrs = self.withAttributes(augmentedAttributes);

            return withAttrs.withState(c(function() {
                if ( augmentedAttributes() === null )
                    return "fetching";
                else
                    return "ready";
            }));
        }

        self.toString = function() { return 'Model()'; };

        return self;
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
        var attributes = o({});
        self.relationships = args.relationships || function(thisColl, attr) { return null; };
        
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
        var bbModel = new (Backbone.Model.extend({ url: url }))();
        
        // Taking in a dictionary of attributes, updates as appropriate.
        // Note that this function should be safe to call with an arbitrary
        // object of attributes -> values | ko.observable, not just
        // `bbModel.changedAttributes()`
        function updateAttributes(changedAttributes) {
            if (!changedAttributes) return;

            var nextAttributes = _(attributes.peek()).clone();
            var attributesDidChange = false; // This only records whether there are attributes added/deleted.

            _(changedAttributes).each(function(newValue, attr) {

                if ( _(nextAttributes).has(attr) ) {
                    // If the attribute exists, then set it to the new value
                    nextAttributes[attr](newValue);

                    // but if it has become undefined, delete it also
                    // (some things may react to the above anyhow!)
                    if ( typeof newValue === "undefined" ) {
                        delete nextAttributes[attr];
                        attributesDidChange = true;
                    }
                } else {
                    // Otherwise make a fresh observable that writes back to the model,
                    var obs = ko.observable();
                    obs.subscribe(function(newValue) { bbModel.set(attr, newValue, { silent: true }); });
                    obs(newValue);
                    
                    nextAttributes[attr] = obs;
                    attributesDidChange = true;
                }
            });

            // Mutate the larger attribute collection only if necessary
            if (attributesDidChange) {
                attributes(nextAttributes);
            }
        };
        
        // Expose the attributes via a writable computed observable that calls updateAttributes
        self.attributes = c({
            read:  function() { return attributes() },
            write: function(newAttributes) { updateAttributes(newAttributes); }
        });
        self.attributes(args.attributes);
        
        // This will be mutated to correspond to the latest response; any other response will be ignored.
        var nonce = null;
        function newNonce() { nonce = Math.random(); return nonce; }
        
        self.save = function() { 
            var myNonce = newNonce();
            self.state("saving");
            bbModel.save({}, { success: function() { if (nonce === myNonce) self.state('ready'); } });
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
                        updateAttributes(changedAttributes);
                        self.state('ready');
                    }
                }
            });
            return new Model(self); // Just to be "fluent"
        };
        
        self.toString = function() { return 'RemoteModel'; };

        return new Model(self);
    }

    // A model that proxies for a new model until it is ready. Currently has a permanent (tiny) proxy overhead.
    var NewModel = function(args) {
        var self = {};

        self.underlyingModel = o(null);
        
        self.readyState = o('initial');
        self.state = c(function() { return self.readyState() !== 'ready' ? self.readyState() : self.underlyingModel().state(); });
       
        self.attributes = c({
            read: function() { return self.underlyingModel() ? self.underlyingModel().attributes() : {} },
            write: function(attrs) { self.underlyingModel() ? self.underlyingModel().attributes(attrs) : undefined }
        });
        
        self.relatedCollection = function(model, attr) {
            if (self.underlyingModel()) return self.underlyingModel().relatedCollection(model, attr);
        }

        self.fetch = function() { 
            if (self.underlyingModel()) {
                self.underlyingModel.fetch(); 
                return self.underlyingModel;
            } else {
                return new Model(self);
            }
        }

        self.save = function() { if (self.underlyingModel()) self.underlyingModel.save(); }

        var fakeModel = new Model({state: args.state});
        fakeModel.when('ready', function() { 
            self.underlyingModel(args.next()); 
            self.readyState('ready');
        });

        return new Model(self);
    }
                                                   
    // Interface Collection =
    // {
    //   state  :: ko.observable ("initial" | "ready" | "fetching" | "saving") // read only
    //   models :: ko.observable {String: Model}                              // keyed on model URI
    //
    //   fetch  :: () -> ()
    //   create :: {String:??} -> ()  // input is attributes for a new Model
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
        self.data = w(args.data);
        self.name = args.name || "(unknown)";
        self.debug = args.debug || false;
        self.relationships = args.relationships || function(thisColl, attr) { return null; };

        self.state = ko.observable("initial");
        self.models = ko.observable({});
        
        // A private `Backbone.Collection` for dealing with HTTP/jQuery
        var bbCollectionClass = Backbone.Collection.extend({ 
            url: self.url,
            parse: function(response) { return response.objects; }
        });
        var bbCollection = new bbCollectionClass();

        // An ss.Model for an existing model fetching via the collection
        var modelInThisCollection = function(args) {
            return RemoteModel({ 
                url: args.uri, 
                name: self.name + '[' + args.uri + ']',
                state: 'ready',
                attributes: args.attributes,
                relationships: self.relationships
            });
        };
        
        // Because of the simplified state machine, we only have to subscribe to 'reset'
        // TODO: Never remove a model, but force client code to filter & sort and let
        // this just be a monotonic knowledge base.
        var updateModels = function(receivedModels) {
            if (self.debug) console.log(self.name, '<--', '(' + _(receivedModels).size() + ' results)');

            var next_models = _(self.models()).clone();
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
            _.chain(next_models).keys().difference(bbCollection.pluck('resource_uri')).each(function(uri) {
                delete next_models[uri];
                models_changed = true;
            });
            
            // Mutate the dict if it has changed
            if (models_changed) {
                self.models(next_models);
            }
        }
    
        // This will be mutated to correspond to the latest response; any other response will be ignored.
        var nonce = null;
        function newNonce() { nonce = Math.random(); return nonce; }
        
        self.create = function(args) { 
            var myNonce = newNonce();
            self.state("saving");
            
            // Will trigger an "add" hence `updateModels` once the server responds happily
            var bbModel = bbCollection.create(args.attributes, {
                wait: true,
                success: function(new_model) { if (nonce === myNonce) self.state('ready'); } 
            });

            return NewModel({
                state: self.state,
                next: function() { 
                    return modelInThisCollection({ 
                        uri: bbModel.get('resource_uri'),
                        attributes: bbModel.attributes 
                    }); 
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
                var parsedUrl = purl(u(self.url));
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

    // Interface Relationship = 
    // {
    //   relatedCollection :: src:Collection -> dst:Collection -> Collection  // from the src it pulls data to do dst.withData( ... ) for the return value
    // }
    var Relationship = function(impl) {
        var self = _(this).extend(impl);
    };
    
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

        self.relatedCollection = function(sourceCollection, destCollection) {
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
                    attrs = _(attrs).map(function(v) { return purl(v).segment(-1); });
                } else if ( _(self.keyType).isFunction() ) {
                    attrs = _(attrs).map(self.keyType);
                } else {
                    throw ("Invalid key type " + self.keyType);
                }

                return attrs.value().sort();
            });

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

                relationships[sourceName][attr] = {
                    collection: relationshipParams.collection,
                    rel: JoinRelationship({
                        debug: self.debug,
                        key: relationshipParams.key || attr,
                        keyType: relationshipParams.keyType,
                        type: relationshipParams.type,
                        reverseField: relationshipParams.reverseField
                    })
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

            var destCollection = self.collections()[relationship.collection].withName(sourceName + '.' + attr);

            if ( !destCollection ) 
                throw ("No collection named " + relationship.collection);

            // Get the related collection and rewrite its relationships to be keyed off the proper src name
            return relationship.rel.relatedCollection(sourceCollection, destCollection).withRelationships(function(coll, attr) {
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
        Relationship: Relationship,
        Api: Api,

        // Implementations
        RemoteApi: RemoteApi,
        RemoteCollection: RemoteCollection,
        RemoteModel: RemoteModel,

        // Misc 
        NOFETCH: NOFETCH,
    }
});
