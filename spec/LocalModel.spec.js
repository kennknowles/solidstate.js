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

    describe("LocalModel <: Model", function() {
        it("Is constructed directly from a dictionary of attributes", function() {
            var m = ss.LocalModel({
                attributes: {
                    foo: "hello",
                    baz: "goodbye"
                }
            });

            expect(m.attributes().foo()).to.equal("hello");
            expect(m.attributes().baz()).to.equal("goodbye");
        });

        it("LocalModel.fetch actually does things that look like a fetch", function(done) {
            var m = ss.LocalModel({ attributes: { foo: 'baz' } });
            expect(m.state()).to.equal('ready');
            m.fetch();
            m.state.reaches('ready').then(function() {
                done();
            });
        });
    });
});
