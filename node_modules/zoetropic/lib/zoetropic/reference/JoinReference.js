if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'URIjs',
    'when'
], function(Backbone, _, URI, when) {
    'use strict';
    
    ///// JoinReference <: Reference
    //
    // A FilterReference where the `from` attribute and `to` attribute must match exactly.
    
    var JoinReference = function(args) {
        var from = args.from || die('Missing required argument `from` in JoinReference'),
            to   = args.to   || die('Missing required argument `to` in JoinReference');

        return FilterReference(function(source, destination) { 
            _(source).has('attributes') || die('Model `source` passed to JoinReference missing attributes:' + source + '('+source+')');
            _(destination).has('attributes') || die('Model `destination` passed to JoinReference missing attributes:' + destination +'('+destination+')');

            return source.attributes[from] === destination.attributes[to]; 
        });
    };

    return JoinReference;
});
