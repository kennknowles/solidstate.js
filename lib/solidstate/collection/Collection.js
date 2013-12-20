if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'knockout',
    'underscore',
    'URIjs',
    'when',
    '../State',
    '../model/NewModel',
    '../model/LocalModel'
], function(ko, _, URI, when, State, NewModel, LocalModel) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); };

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

        ///// metadata :: {*: *}
        //
        // Arbitrary read-only observable of metadata

        self.metadata = implementation.metadata || o({});
        
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
        //
        // New models added to the collection must already be augmented
        // the same way.

        self.overlayRelated = function(relations) {
            var overlayedCollections = {};

            if ( _(relations).isObject() ) {
                overlayedCollections = relations
            } else {
                _(arguments).each(function(attribute) { 
                    overlayedCollections[attribute] = self.relatedCollection(attribute).fetch();
                });
            }

            var augmentedModels = c({
                read: function() {
                    return _(self.models()).mapValues(function(model) { 
                        return model.overlayRelated(overlayedCollections); 
                    })
                },
                write: function(newModels) {
                    var stripped = _(newModels).mapValues(function(augmentedModel) {
                        return augmentedModel.stripOverlays(overlayedCollections);
                    });

                    self.models( stripped );
                }
            });

            var augmentedModelsState = State(c(function() {
                var m = _(augmentedModels()).find(function(m) { return m.state() !== "ready"; });
                if ( m )
                    return m.state();
                else
                    return 'ready';
            }));

            var augmentedStateExplanation = c(function() {
                var m = _(augmentedModels()).find(function(m) { return m.state() !== "ready"; });
                if ( m ) 
                    return self.name + ' waiting for model: ' + m.stateExplanation();
                else
                    return 'All models ready for ' + self.name;
            });

            // Whenever self.state returns to `fetching` this does too, and then
            // waits for all the underlying models
            var underlyingAugmentedState = State(o(
                (augmentedModelsState() !== 'ready') ? augmentedModelsState() : self.state()
            ));

            var awaitReady = function() {
                self.state.reaches('ready')
                    .then(function() {
                        return augmentedModelsState.reaches('ready')
                    })
                    .then(function() {
                        underlyingAugmentedState('ready');
                    })
                    .otherwise(function(err) {
                        console.error(err.stack);
                    });
            };
            awaitReady();

            self.state.subscribe(function(newState) {
                if ( newState !== 'ready' ) {
                    underlyingAugmentedState(newState);
                    awaitReady();
                }
            });

            var augmentedState = State(c({
                read: function() { 
                    return underlyingAugmentedState(); 
                },
                write: function(newValue) {
                    self.state(newValue);
                }
            }));
            
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

            // Not part of the public interface
            newSelf.underlyingCollection = self;

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

    return Collection;
});
