if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'URIjs',
    'when'
], function(Backbone, _, URI, when) {
    'use strict';
    
    ///// ToManyReference <: Reference
    //
    // The `field` in the model is an array of Urls in the destination collection
    
    var ToManyReference = function(args) {
        var attribute = args.from || die('Missing required arg `from` for ToManyReference`');
        
        return function(model, destCollection) {
            var vs = model.attributes[attribute];

            var referenced = _(vs).map(function(v) { return destCollection.models[v]; });
            
            if ( _(referenced).any(function(r) { return _(r).isUndefined(); }) )
                return undefined;

            return referenced;
        };
    };

    return ToManyReference;
});
