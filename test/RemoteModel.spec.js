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

    describe("RemoteModel <: Model", function() {
        it("Writes back to a backbone model", function() {
            var spySet = sinon.spy();
            var spyFetch = sinon.spy();
            var spySave = sinon.spy();
            var MockBBModel = Backbone.Model.extend({
                fetch: spyFetch,
                save: spySave
            });

            var MockBackbone = {
                Model: MockBBModel
            };

            var model  = ss.RemoteModel({
                name: 'foozle',
                uri: '/some/fake/url',
                Backbone: MockBackbone
            });

            model.attributes({foo: 'bar'});
            expect(model.attributes().foo()).to.equal('bar');
        });
    });
});
