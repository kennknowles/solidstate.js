if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'underscore',
], function(_) {
    'use strict';
    
    _.mixin({
        mapValues: function (input, mapper) {
            return _.reduce(input, function (obj, v, k) {
                obj[k] = mapper(v, k, input);
                return obj;
            }, {});
        }
    });

    return _;
});

