if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([
    'knockout',
    'underscore',
    'URIjs',
    'when',
    'zoetropic',
    '../Attributes',
    '../State',
    '../reference/ToOneReference',
    'require',
    '../collection/Collection' // Will be null since it is circular dep, but we can require it later
], function(ko, _, URI, when, z, Attributes, State, ToOneReference, require, Collection) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); };

    ///// Model
    //
    // A wrapper for any Model implementation that performs a little
    // kick typing (hence defining the minimal interface) before adding fluent combinators.
    
    var Model = function(implementation) {
        if ( !(this instanceof Model) ) return new Model(implementation);

        var self = this;
        self.implementation = implementation;

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
            // TODO: break this cycle; it is nearly meaningless
            var Collection = require('../collection/Collection');

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
            _(u(self.attributes)).each(function(value, key) { 
                // Primitive but useful attempt at recursing well
                value = u(value);
                if ( value instanceof Model ) {
                    result[key] = value.toJSON();
                } else if ( _(value).isArray() && value[0] && (value[0] instanceof Model) ) {
                    result[key] = _(value).map(function(v) { return v.toJSON(); });
                } else {
                    result[key] = value;
                }
            });
            return result;
        };

        
        ///// overlayAttributes :: Attributes -> Model
        //
        // Overlays the provided attributes in the observable.
        // Reads & writes will be appropriately directly to
        // the current attributes and the overlayed attributes.
        
        self.overlayAttributes = function(overlayedAttributes) {
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
        self.withAttributes = self.overlayAttributes;
        

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

            var augmentedSelf = self.overlayAttributes(overlayedAttributes);

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

        // stripOverlays :: ({String: Collection}|[String]) -> Model
        //
        // Removes overlays to give the underlying model again

        self.stripOverlays = function(overlays) {
            if ( ! _(overlays).isArray() )
                overlays = _(overlays).keys();

            var strippedAttributes = Attributes({
                // The initial values of the attributes will be ignored, because
                // all of them will cause a call to `makeAttribute` which sets up the proxying,
                // so any dictionary with the right keys is fine
                attributes: _(self.attributes()).pick(overlays),

                makeAttribute: function(field, value) {
                    // A new attribute should never be possible, so the only time this is called
                    // is on initialization, when the value can be ignored because it will be proxied.
                    var relationship = self.relationships[field] || { deref: ToOneReference({from: field}) };

                    // This observable will write to the underlying attribute properly whether it already existed or not
                    var strippedAttribute = o(value.attributes().resource_uri());

                    // Set the underlying attribute immediately
                    return strippedAttribute;
                }
            });

            return self.overlayAttributes(strippedAttributes);
        }

        // toString :: () -> String
        //
        // Just some sort of friendly-ish string

        self.toString = function() { return 'Model()'; };

        return self;
    };

    return Model;
});

