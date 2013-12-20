if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'knockout',
    'underscore',
    './Link',
    '../misc',
], function(ko, _, Link, misc) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v);},
        die = misc.die;

    // LinkToCollection :: Collection -> Link
    //
    // A constant link that ignores its input and returns the provided destination collection
    //
    var LinkToCollection = function(destination) {
        (destination && _(destination).has('models')) || die('Collection provided to `LinkToCollection` missing required field `models`:' + destination);

        return new Link({
            resolve: function(sourceCollection) {
                return destination;
            }
        });
    };

    return LinkToCollection;
});

