if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'knockout',
    '../underscore.ext',
    'URIjs',
    'when',
    '../misc'
], function(ko, _, URI, when, misc) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); };


    // ToMany
    //

    var ToMany = function(underlyingObservable) {
        return function(collection) {
            return misc.transformed(underlyingObservable, {
                read: function(vs) {
                    if (!vs) return vs;

                    var results = _(vs).map(function(v) { return u(collection.models()[v]); });

                    if ( _(results).any(function(r) { return _(r).isUndefined(); }) )
                        return undefined;

                    return results;
                },
                write: function(vs) {
                    if (!vs) return vs;

                    return _(vs).map(function(v) {
                        if (_(v).isString()) {
                            if ( !_(collection.models).has(v) ) die('Model with URI ' + v +
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
                    });
                }
            });
        };
    };

    // ToManyReference
    //
    // The `field` in the model is an array of Urls in the destination collection
    //
    var ToManyReference = function(args) {
        var field = args.from || die('Missing required arg `from` for ToManyReference`');
        
        return function(model, destCollection) {
            return ToMany(model.attr(field))(destCollection);
        };
    };

    return ToManyReference;
});
