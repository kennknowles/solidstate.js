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

    // FilterReference
    //
    // A filter reference is a "virtual" reference, not actually present on the model, but implicit
    // by filtering the target collection according to some predicate of the model.
    //
    var FilterReference = function(filter) {
        return function(sourceModel, destCollection) {
            _(destCollection).has('models') || die('Collection passed to FilterReference missing `models`:' + destCollection);

            return c(function() {
                return _.chain(destCollection.models())
                    .values()
                    .filter(function(m) { return filter(sourceModel, m); })
                    .value();
            });
        };
    };

    return FilterReference;
});

