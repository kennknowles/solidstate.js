if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'URIjs',
    'when'
], function(Backbone, _, URI, when) {
    'use strict';
    
    ////// ToOneReference <: Reference
    //
    // The `field` in the model directly references the Url of the destination.
    
    var ToOneReference = function(args) {
        var attribute = args.from || die('Missing required args `from` for `ToOneReference`');

        return function(model, destCollection) {
            var v = model.attributes[attribute];
            return v ? destCollection.models[v] : v; 
        };
    };

    return ToOneReference;
});
