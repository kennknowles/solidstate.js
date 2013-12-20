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

    ///// Attributes
    //
    // An observable dictionary with the property that writing the whole dictionary
    // actually writes individually to each attribute.
    //
    // As this is not a dependent observable but a mutable cell, it will _peek_
    // at args.attributes to initalize itself
    //
    // args :: {
    //   attributes :: String -> Observable
    //   makeAttribute :: (Key, Value) -> Observable
    // }
    var Attributes = function(args) {
        args = args || {};
        var makeAttribute = args.makeAttribute || function(key, value) { return ko.observable(value); };

        var actualAttributes = o({});

        var wrappedAttributes = c({
            read: function() {
                return actualAttributes();
            },
            write: function(_newAttributes) {
                var keysChanged = false;
                var nextAttributes = _(actualAttributes.peek()).clone();
                var newAttributes = _newAttributes.peek ? _newAttributes.peek() : _newAttributes;

                _(newAttributes).each(function(value, key) {
                    value = (value && value.peek) 
                        ? value.peek() 
                        : value;

                    if (_(nextAttributes).has(key)) {
                        nextAttributes[key](value);
                    } else {
                        nextAttributes[key] = makeAttribute(key, value);
                        keysChanged = true;
                    }
                });
                
                // Note that there is currently no way to remove an attribute (because that is a weird thing to do and the semantics aren't clean)

                if (keysChanged)
                    actualAttributes(nextAttributes);
            }
        });

        if ( args.attributes ) {
            wrappedAttributes( args.attributes );
        }

        return wrappedAttributes;
    };

    return Attributes;
});

