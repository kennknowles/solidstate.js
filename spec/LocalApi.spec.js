/* global describe, it */
/* jshint -W070 */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([
    'underscore',
    'knockout', 
    'solidstate',
    'sinon',
    'chai',
    'claire',
    'when',
], function(_, ko, ss, sinon, chai, claire, when) {
    "use strict";
    var o = ko.observable,
    u = ko.utils.unwrapObservable,
    c = ko.computed,
    expect = chai.expect,
    assert = chai.assert;

    describe("LocalApi <: Api", function() {
        it("Is constructed directly from a dictionary of collections and relationships-by-name", function() {
            var api = ss.LocalApi({
                collections: {
                    'foo': ss.LocalCollection(),
                    'baz': ss.LocalCollection()
                },
                relationships: {
                    foo: { bizzle: { collection: 'baz' } },
                    baz: { bozzle: { collection: 'foo' } }
                }
            });
        });
    });
});