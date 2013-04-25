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

    describe("Collections <: Observable {:Observable Collection}" , function() {
        it('Writes new collections to their name, otherwise ignores', function() {
            var c = ss.LocalCollection();
            var collections = ss.Collections({ collections: { "foo": c } });

            expect(_(collections()).keys()).to.deep.equal(['foo']);
            expect(collections().foo.uri).to.equal(c.uri);

            var c2 = ss.LocalCollection();
            collections({ 'baz': c2 });
            
            expect(_(collections()).keys().sort()).to.deep.equal(['baz', 'foo']);
            expect(collections().foo.uri).to.equal(c.uri);
            expect(collections().baz.uri).to.equal(c2.uri);
            
            var c3 = ss.LocalCollection();
            collections({ 'foo': c3 });
            expect(collections().foo.uri).to.equal(c.uri);
            expect(collections().baz.uri).to.equal(c2.uri);
        });

        it('Provides a link to a named collection', function() {
            var c1 = ss.LocalCollection();
            var c2 = ss.LocalCollection();
            var colls = ss.Collections({
                collections: { 'foo': c1, 'baz': c2 }
            });

            expect(colls.linkToNamedCollection('baz').resolve(c1).uri).to.equal(c2.uri);
        });

        it('Manages relationships provided in a by-name dictionary', function() {
            var c1 = ss.LocalCollection();
            var c2 = ss.LocalCollection();
            var colls = ss.Collections({
                relationships: {
                    'foo': { 'bizzle': { collection: 'baz' } }
                },
                collections: { 'foo': c1, 'baz': c2 }
            });

            expect(colls.relationships.foo.bizzle.link.resolve(c1).uri).to.equal(c2.uri);
            
            expect(colls().foo.relatedCollection('bizzle').uri).to.equal(c2.uri);
        });
    });
});

