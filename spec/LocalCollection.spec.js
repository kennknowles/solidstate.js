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

    describe("LocalCollection <: Collection", function() {
        it("Is constructed directly from a dictionary of models and other options, passing its relationships on to the models", function() {
            var dst = ss.LocalCollection();

            var c = ss.LocalCollection({
                name: 'fooey',
                relationships: function(attr) { return { link: ss.LinkToCollection(dst) }; },
                models: {
                    0: ss.LocalModel()
                }
            });

            expect(c.name).to.equal('fooey');
            expect(c.relatedCollection('foo').uri).to.equal(dst.uri);
            expect(c.models()[0].relatedCollection('foo').uri).to.equal(dst.uri);
        });
    });
});
