if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'knockout',
    'underscore',
    'URIjs',
    'when',
    'zoetropic',
    './ApiForZoetrope'
], function(ko, _, URI, when, z, ApiForZoetrope) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); };

    ///// RemoteApi
    //
    // An api that lies across an AJAX request and returns metadata about each
    // of its collections

    var RemoteApi = function(args) {
        return ApiForZoetrope({
            state: 'initial',
            debug: args.debug,
            zoetrope: z.RemoteApi(args)
        });
    };

    return ApiForZoetrope;
});
