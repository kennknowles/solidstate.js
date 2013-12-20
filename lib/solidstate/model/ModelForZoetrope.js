if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'knockout',
    'underscore',
    'URIjs',
    'when',
    '../State',
    '../Attributes',
    'require',
    './Model'
], function(ko, _, URI, when, State, Attributes, require, Model) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); };

    ///// ModelForZoetrope
    //
    // Builds a model that "mutates" appropriately according to the
    // frames of a zoetrope (a sequence of immutable values)

    var ModelForZoetrope = function(args) {
        if (!(this instanceof ModelForZoetrope)) return new ModelForZoetrope(args);

        // TODO: break this crap cycle
        var Model = require('./Model');

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
                });

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
    };

    return ModelForZoetrope;
});

