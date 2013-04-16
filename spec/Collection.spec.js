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

    describe("Collection (fluent interface wrapper)", function() {
        it("Provides .withSubresourcesFrom that applies to all of its models, and derives its ready state from theirs", function() {

            var impl = {
                state: ko.observable("ready"),
                models: ko.observable({
                    'one': new ss.Model({ state: o("ready"), attributes: o({ foo: o("baz")}) }),
                    'two': new ss.Model({ state: o("ready"), attributes: o({ foo: o("biz")}) })
                })
            };

            var incomplete_models = o({baz: 25});

            var c = new ss.Collection(impl);
            var c2 = c.withSubresourcesFrom({ foo: { models: o({ baz: 24, biz: 89 }) } });
            var c3 = c.withSubresourcesFrom({ foo: { models: incomplete_models } });

            expect(c.state()).to.equal("ready");

            expect(c2.state()).to.equal("ready");
            expect(c2.models().one.state()).to.equal("ready");
            expect(c2.models().one.attributes().foo()).to.equal(24);
            expect(c2.models().two.state()).to.equal("ready");
            expect(c2.models().two.attributes().foo()).to.equal(89);

            expect(c3.state()).to.equal("fetching");
            expect(c3.models().one.state()).to.equal("ready");
            expect(c3.models().one.attributes().foo()).to.equal(25);
            expect(c3.models().two.state()).to.equal("fetching");
            expect(c3.models().two.attributes().foo()).to.equal(undefined);

            incomplete_models({baz: 29, biz: 101});
            expect(c3.state()).to.equal("ready");
            expect(c3.models().one.state()).to.equal("ready");
            expect(c3.models().one.attributes().foo()).to.equal(29);
            expect(c3.models().two.state()).to.equal("ready");
            expect(c3.models().two.attributes().foo()).to.equal(101);
        });
    });
});
