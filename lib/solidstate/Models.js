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
                var prevModels = _(actualModels.peek()).clone();
                var prevKeys = _(prevModels).keys();
                var nextModels = {};

                var newModels = u(_newModels);

                _(newModels).each(function(model, uri) {
                    if (_(prevModels).has(uri)) {
                        nextModels[uri] = prevModels[uri];
                        nextModels[uri].attributes(model.attributes);
                    } else {
                        nextModels[uri] = model;
                        keysChanged = true;
                    }
                });

                var nextKeys = _(nextModels).keys();
                if ( _(prevKeys).difference(nextKeys).length > 0 )
                    keysChanged = true;

                if (keysChanged)
                    actualModels(nextModels);
            }
        });

        if ( args.models ) {
            wrappedModels( args.models );
        }
        
        return wrappedModels;
    };

    return Models;
});
