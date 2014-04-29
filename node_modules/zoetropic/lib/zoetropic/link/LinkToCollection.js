if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'URIjs',
    'when',
    './Link'
], function(Backbone, _, URI, when, Link) {
    'use strict';
    
    ///// LinkToCollection :: Collection -> Link
    //
    // A constant link that ignores its input and returns the provided destination collection
    
    var LinkToCollection = function(destination) {
        (destination && _(destination).has('models')) || die('Collection provided to `LinkToCollection` missing required field `models`:' + destination);

        return Link({
            resolve: function(sourceCollection) {
                return destination;
            }
        });
    };

    return LinkToCollection;
});
