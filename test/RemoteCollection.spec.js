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
    var o = ko.observable, u = ko.utils.unwrapObservable, c = ko.computed;
    var expect = chai.expect, assert = chai.assert;

    describe("RemoteCollection <: Collection", function() {
        it(".create(...) returns a promise that resolves with the created RemoteModel", function() {

        });

        it(".create(...) returns a promise that rejects with any errors from the server", function() {

        });
        
        it(".withFields({ data: ... }) refetches whenever the data changes", function(done) {
            var data = o({ foo: 1 });
            var fetch = sinon.spy();
            var MockBBCollection = Backbone.Collection.extend({ fetch: fetch, });
            var MockBackbone = { Collection: MockBBCollection };

            var c = ss.RemoteCollection({ 
                Backbone: MockBackbone,
                uri: 'fake://uri',
            }).withFields({ data: data });

            expect(c.state()).to.equal('initial');
            c.fetch();
            expect(c.state()).to.equal('fetching');
            expect(fetch.callCount).to.equal(1);
            fetch.getCall(0).args[0].success([]);

            c.state.reaches('ready')
                .then(function() {
                    data({ foo: 2 });
                    return c.state.reaches('fetching');
                })
                .then(function() {
                    expect(fetch.callCount).to.equal(2);
                    done();
                })
                .otherwise(function(exception) {
                    console.error(exception.stack);
                });
        });

    });
});
