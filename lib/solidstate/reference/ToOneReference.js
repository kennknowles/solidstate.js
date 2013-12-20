if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'knockout',
    'underscore',
    'URIjs',
    'when',
    'zoetropic',
    '../misc'
], function(ko, _, URI, when, z, misc) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); };

    // ToOne / ToMany attributes are low-level building blocks for most common-cases
    //
    // These are observables from which one reads/writes objects, but the underlying observable
    // experiences this as reads/writes or URIs.
    //
    // While it is simplest to have these always transform their values, there are wacky cases:
    // 1. When a Model is written that is not in the collection. In this case, it is added.
    // 2. When a URI is written instead of a Model. This may be an accident, or may be because
    //    we were just "lucky" to already have a Model in place. To try to catch the accidental
    //    cases, the writing of a URI will fail if the URI is not found in the destination
    //    collection.

    var ToOne = function(underlyingObservable) {
        return function(collection) {
            (collection && _(collection).has('models')) || die('Collection passed to `ToOne` missing required `models` attribute:' + collection);

            return misc.transformed(underlyingObservable, {
                read: function(v) {
                    return v ? u(collection.models()[v]) : v;
                },

                write: function(v) {
                    if (!v) return v;

                    if (_(v).isString()) {
                        if ( !_(collection.models()).has(v) ) die('Model with URI ' + v +
                            ' was not found in ' + collection.name +
                            ' - this probably indicates an accidental writing of a URI when you need to write a Model');

                        return v;
                    }

                    var resource_uri = v.attributes().resource_uri();

                    if ( ! _( u(collection.models()) ).has(resource_uri) ) {
                        var update = {};
                        update[resource_uri] = v;
                        collection.models(update);
                    }

                    return resource_uri;
                }
            });
        };
    };

    // ToOneReference
    //
    // The `field` in the model directly references the Url of the
    // destination.
    //
    var ToOneReference = function(args) {
        var field = args.from || die('Missing required args `from` for `ToOneReference`');

        return function(model, destCollection) {
            return ToOne(model.attr(field))(destCollection);
        };
    };

    return ToOneReference;
});

