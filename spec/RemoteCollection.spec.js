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

    describe("RemoteCollection <: Collection", function() {
        describe(".newModel yields a new model in the collection (with the right subresources) which calls back to save, when ready", function() {
            it("calls back to the collection to create a remote model with the URL of the overlay", function() {
                var spyCreate = sinon.spy();
                var MockBBCollection = Backbone.Collection.extend({
                    create: spyCreate
                });
                var MockBBModel = function() { };
                var MockBackbone = {
                    Collection: MockBBCollection,
                    Model: MockBBModel
                };

                var baseColl = ss.RemoteCollection({
                    url: '/some/fake/url',
                    Backbone: MockBackbone
                });
                var overlay = { link: ss.LocalCollection({ models: { 'model_uri': ss.LocalModel({ attributes: { foo: 'baz' } }) } }) };
                var coll = baseColl.withSubresourcesFrom(overlay);

                var newModel = coll.newModel({ attributes: { link: null } });
                newModel.attributes().link(ss.LocalModel({ attributes: { resource_uri: 'fake_uri' } }));
                newModel.save();

                var args = spyCreate.args[0][0];
                expect(args.link).to.equal('fake_uri');
            });
        });

        // If the above is done with a derived relatedSubresource then it should immediately re-fetch!
    });
});
