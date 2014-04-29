if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'URIjs',
    'when',
    './FromOneFilterLink'
], function(Backbone, _, URI, when, FromOneFilterLink) {
    'use strict';
    
    // UrlLink :: {from:String} -> (Link -> Link)
    //
    // Uses the `from` attribute of each model in the source collection
    // as the URL for a model in the destination collection. Currently
    // hard-coded to Tastypie/Rails style URLs where the ID is the final
    // non-empty segment of the path, so querystring do not get too large.
    var UrlLink = function(args) {
        return FromOneFilterLink({
            from:      args.from || die('No attribute provided for UrlLink'),
            to:        'id__in',
            transform: function(uri) { 
                if (!uri) return uri; // Preserve null and undefined
                
                if (!_(uri).isString()) throw new Error('UrlLink given a property `' + args.from + '` that is not a string!');
                
                // If it ends in a slash, grab the second-to-last segment for now...
                if ( uri[uri.length - 1] === '/' )
                    return URI(uri).segment(-2);
                else
                    return URI(uri).segment(-1);
            }
        });
    };

    return UrlLink
});
