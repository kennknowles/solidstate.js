if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'URIjs',
    'when',
    './FilterLink'
], function(Backbone, _, URI, when, FilterLink) {
    'use strict';
    
    // FromOneFilterLink :: {from:String, to: String, transform: * -> *} -> (Link -> Link)
    //
    // Creates a filter on the target's `to` attribute by transforming the source's `from` attribute.
    //
    var FromOneFilterLink = function(args) {
        var from      = args.from      || 'id',
            transform = args.transform || function(x) { return x; },
            to        = args.to;

        var filters = {};
        filters[to] = function(model) { return transform(model.attributes[from]); };
        
        return FilterLink(filters);
    };

    return FromOneFilterLink;
});
