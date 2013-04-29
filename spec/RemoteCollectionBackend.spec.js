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

    describe("RemoteCollectionBackend <: Collection", function() {
        it('.fetch() returns a promise that resolves when remote models come in', function(done) {

            // Set up a mock Backbone that will intercept the fetch and return the appropriate value
            var fetch = sinon.spy();
            var MockBBCollection = Backbone.Collection.extend({ fetch: fetch });

            var MockBackbone = {
                Model: Backbone.Model,
                Collection: MockBBCollection,
            };

            MockBackbone.Collection.foo = 'baz';

            // A RemoteCollectionBackend using this Backbone
            var backend = ss.RemoteCollectionBackend({
                url: '/some/fake/url',
                Backbone: MockBackbone
            });

            // The business
            var promise = backend.fetch();

            // Set up the test to complete with known models
            var bbModels = [ new Backbone.Model({ resource_uri: 'foo' }) ];
            when(promise,
                 function(fetchedModels) {
                     expect(fetchedModels.foo.attributes().resource_uri()).to.equal('foo');
                     done();
                 })
                .otherwise(function(error) {
                    console.error(error.stack);
                });
           
            
            // Fulfill the promise with a made-up backbone model
            var args = fetch.args[0][0];
            args.success({ models: bbModels });
        });
    });
});
