if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'knockout',
    'underscore',
    'URIjs',
    'when',
    '../State',
    '../Models',
    '../model/ModelForZoetrope',
    './Collection',
    '../misc'
], function(ko, _, URI, when, State, Models, ModelForZoetrope, Collection, misc) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); };

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
        self.debug = args.debug || false;
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

        ////// metadata :: {*: *}
        //
        // Public: observable
        // Private: mutable observable
        //
        // arbitrary key-value mapping to store e.g. paging info. Sort of ad-hoc at the moment

        var mutableMetadata = ko.observable({});
        self.metadata = ko.computed(function() { return mutableMetadata(); });
        
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

            if ( _.chain(combinedData).values().any(function(v) { return v === misc.NOFETCH; }).value() ) {
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
                    mutableMetadata(newZCollection.metadata);
                    mutableState('ready');
                    initial = false;
                })
                .otherwise(function(err) {
                    if (nonce !== myNonce) return;
                    console.error(err.stack);
                    mutableState('error');
                    when(self.state.reaches('error')).then(function() {
                        mutableState(initial ? 'initial' : 'ready');
                    });
                })
            ;
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

    return CollectionForZoetrope;
});
