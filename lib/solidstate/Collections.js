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

    ///// Collections
    //
    // A dictionary of collections by name with the property that writing to a collection
    // that is already in there is ignored.

    var Collections = function(args) {
        args = args || {};

        var actualCollections = o({});
        var debug = args.debug || false;
        
        ///// wrappedCollections
        //
        // The returned value; a computed observable that builds the collections monotonically

        var wrappedCollections = c({
            read: function() { return actualCollections(); },
            write: function(additionalCollections) {
                if (!additionalCollections) return;

                var nextCollections = _(actualCollections()).clone();
                var collectionsDidChange = false;
                
                _(additionalCollections).each(function(collection, name) {
                    if ( !_(nextCollections).has(name) ) {
                        if (debug) console.log(' - ', name);
                        nextCollections[name] = collection;
                    }
                    collectionsDidChange = true;
                });

                if (collectionsDidChange)
                    actualCollections(nextCollections);
            }
        });
        
        // Set the initial collections if provided
        if (args.collections)
            wrappedCollections(args.collections);
        
        return wrappedCollections;
    };

    return Collections;
});

