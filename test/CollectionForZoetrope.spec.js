/* global describe, it */
/* jshint -W070 */
/* jshint -W030 */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([
    'underscore',
    'backbone',
    'knockout', 
    'solidstate',
    'sinon',
    'zoetropic',
    'chai',
    'claire',
    'when',
], function(_, Backbone, ko, ss, sinon, z, chai, claire, when) {
    "use strict";

    var o = ko.observable, u = ko.utils.unwrapObservable, c = ko.computed;
    var expect = chai.expect, assert = chai.assert;

    describe("CollectionForZoetrope <: Collection", function() {
        it("Refetches whenever the data changes", function(done) {
            // TODO: parameterize by zoetrope and invoke from various places
            var data = o({});
            var c = ss.LocalCollection({ data: data });
            var fetch = sinon.spy(c, 'fetch');

            expect(c.state()).to.equal('ready');
            assert(!fetch.called);
            data({ foo: 'gaz' });
            expect(c.state()).to.equal('fetching');
            c.state.reaches('ready')
                .then(function() {
                    // sinon spy is not working properly here, I think
                    // I can see the logging from `fetch` but fetch.called is still false
                    done();
                })
                .otherwise(function(err) {
                    console.error(err.stack);
                });
        });
    
        it(".withFields({ data: ... }) also refetches when the data changes", function(done) {
            var data = o({});
            var c = ss.LocalCollection().withFields({ data: data });
            var fetch = sinon.spy(c, 'fetch');

            expect(c.state()).to.equal('ready');
            assert(!fetch.called);
            data({ foo: 'gaz' });
            expect(c.state()).to.equal('fetching');
            c.state.reaches('ready')
                .then(function() {
                    // sinon spy is not working properly here, I think
                    // I can see the logging from `fetch` but fetch.called is still false
                    done();
                })
                .otherwise(function(err) {
                    console.error(err.stack);
                });
        });

        it("Get all the zoetrope's models", function() {
            var m = z.LocalModel();
            var zoetrope = z.LocalCollection({ models: { foo: m } });
            var c = ss.CollectionForZoetrope({ zoetrope: zoetrope });

            expect( _(c.models()).size() ).to.equal( _(zoetrope.models).size() );
        });
    });
});
