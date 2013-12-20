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

    ///// Relationship
    //
    // A `Link` for getting from one collection to another, and a `Reference` for pulling out individual models... is a complete Relationship

    var Relationship = function(implementation) {
        if (!(this instanceof Relationship)) return new Relationship(implementation);

        var self = this;
        
        self.link = implementation.link || die('Relationship missing required field `link`');
        self.deref = implementation.link || die('Relationship missing required field `deref`');

        return self;
    };

    return Relationship;
});
