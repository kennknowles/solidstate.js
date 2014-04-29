if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'underscore',
], function(_) {
    'use strict';
    
    ///// Link = { resolve: Collection -> Collection }
    //
    // The simplest sort of link is a URI, a pointer. However, even a
    // URI may be relative, hence takes a "source" location as an
    // implicit input. And much more complex links arise in
    // efficiently moving from a _set_ of fetched models to another
    // set of fetched models. Hence, a link is a function from a
    // Collection to another Collection.
    
    var Link = function(implementation) {
        if (!(this instanceof Link)) return new Link(implementation);

        var self = this;

        self.resolve = implementation.resolve || die('Link implementation missing required field `resolve`');

        return self;
    };

    return Link;
});
