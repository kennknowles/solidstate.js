if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'knockout',
    'underscore',
    'URIjs',
    'when',
    'zoetropic'
], function(ko, _, URI, when, z) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); };

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
        // at the state passed in.

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

    return State;
});
