if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'URIjs',
    'when',
    './Link',
    '../misc'
], function(Backbone, _, URI, when, Link, misc) {
    'use strict';
    
    ///// FilterLink :: { String: Model -> String|Number } -> (Link -> Link)
    //
    // The same as the input link, but adds filters based on a dictionary
    // of input functions. It combines the values from all the models
    // into a single filter.
    
    var FilterLink = function(filters) {
        filters || die('Missing required arg `filters` for FilterLink');

        return function(link) {
            link    || die('Missing required arg `link` for FilterLink');

            return Link({ 
                resolve: function(sourceCollection) {
                    var target = link.resolve(sourceCollection);
                    
                    var targetData = {};
                    _(filters).each(function(fn, key) {
                        var vals = _.chain(sourceCollection.models)
                            .values()
                            .map(fn)
                            .filter(function(v) { return _(v).isString() || _(v).isNumber(); }) 
                            .uniq()
                            .value()
                            .sort();
                        
                        if ( _(vals).isEmpty() ) vals = misc.NOFETCH;
                            
                        targetData[key] = vals;
                    });
                        
                    // And... danger / hardcoding for tastypie for now (can actually be easily expressed in the client code, but verbose)
                    targetData.limit = 0;
                    
                    return target.overlayData(targetData);
                }
            });
        };
    };

    return FilterLink;
});
