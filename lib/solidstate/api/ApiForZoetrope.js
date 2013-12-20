if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'knockout',
    'underscore',
    'URIjs',
    'when',
    '../State',
    '../Collections',
    './Api'
], function(ko, _, URI, when, State, Collections, Api) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); };

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

    return ApiForZoetrope;
});
