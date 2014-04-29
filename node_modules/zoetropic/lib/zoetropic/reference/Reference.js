if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'URIjs',
    'when'
], function(Backbone, _, URI, when) {
    'use strict';
    
    ////// Reference = Model -> Collection -> (Model | [Model])
    //
    // A reference complements a Link. Since the link is from collection to
    // collection, the Reference knows how get the proper value out of the 
    // destination collection and how to put it back. It may refer
    // to any piece of the model.
    //
    // A `Reference` is essentially the _dereference_ spec. It may eventually
    // have more useful methods.
    //
    var Reference = function(impl) {
        return impl;
    };

    return Reference;
});
