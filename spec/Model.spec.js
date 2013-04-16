/* global describe, it */
/* jshint -W070 */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([
    'underscore',
    'backbone',
    'knockout', 
    'solidstate',
    'sinon',
    'chai',
    'claire',
    'when',
], function(_, Backbone, ko, ss, sinon, chai, claire, when) {
    "use strict";
    var o = ko.observable,
    u = ko.utils.unwrapObservable,
    c = ko.computed,
    expect = chai.expect,
    assert = chai.assert;

    describe("Model", function() {
        it("Directly wraps the implementation", function() {

            var impl = { state: o("fetching") };
            var m = new ss.Model(impl);

            expect(m.state()).to.equal("fetching");
            impl.state('ready');
            expect(m.state()).to.equal("ready");
        });

        it("Provides .toJSON that serializes the current value of the attributes, not the Model interface itself", function() {
            // TODO: pass in an arbitrary implementation generator
            var impl = { state: o('ready'), attributes: o({foo: o('baz')}) };
            var m = new ss.Model(impl);

            expect(JSON.parse(JSON.stringify(m))).to.deep.equal({foo: 'baz'});
            
            var impl2 = { state: o('ready'), attributes: o({foo: 'baz', subresource: o( new ss.Model({ state: o('ready'), attributes: o({ bizzle: o('bazzle') }) }) ) }) };
            var m2 = new ss.Model(impl2);
            
            expect(JSON.parse(JSON.stringify(m2))).to.deep.equal({foo: 'baz', subresource: { bizzle: 'bazzle'} });
        });

        it("Provides .withState that blends the provided state with the underlying state", function() {
            var impl = { state: o("fetching") };
            var overlayed = o("fetching");

            var m = new ss.Model(impl).withState(overlayed);

            // fetching && fetching
            expect(m.state()).to.equal("fetching");

            // ready && fetching
            overlayed("ready");
            expect(m.state()).to.equal("fetching");

            // ready && ready
            impl.state("ready");
            expect(m.state()).to.equal("ready");

            // fetching && ready
            overlayed("fetching");
            expect(m.state()).to.equal("fetching");
        });

        it("Provides .withAttributes that overlays the provided attributes with the underlying attributes", function() {
            var impl = { state: o('ready'), attributes: o({"foo": o(1), "baz": o(8)}) };
            var overlayed = ko.observable({"foo": o(4)});
            var overlayed2 = ko.observable({"bizzz": o(5)});

            var m = new ss.Model(impl);
            var m2 = m.withAttributes(overlayed);
            var m3 = m.withAttributes(overlayed2);
            
            expect(m.attributes().foo()).to.equal(1);
            expect(m2.attributes().foo()).to.equal(4);
            expect(m3.attributes().bizzz()).to.equal(5);

            m2.attributes({"foo": o(7)});
            expect(m.attributes().foo()).to.equal(1);
            expect(m2.attributes().foo()).to.equal(7);

            m2.attributes().foo(10);
            expect(m.attributes().foo()).to.equal(1);
            expect(m2.attributes().foo()).to.equal(10);
            
            m2.attributes({"foo": o(9), "baz": o(22)});
            expect(m.attributes().foo()).to.equal(1);
            expect(m2.attributes().foo()).to.equal(9);
            expect(m.attributes().baz()).to.equal(22);
            expect(m2.attributes().baz()).to.equal(22);
        });
    });
});
