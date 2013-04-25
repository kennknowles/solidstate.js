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

    describe("ToOneReference(foo) <: Reference", function() {
        describe("(src, dst)", function() {
            var deref = ss.ToOneReference({from:'sizzle'});

            it("ToOneReference(foo)(src, dst) === dst.models()[src.attributes()[foo]]", function() {
                var dst = ss.LocalModel();
                var dereffed = deref(ss.LocalModel({ attributes: { sizzle: 'bizzle' } }), 
                                     ss.LocalCollection({ models: { bizzle: dst } }));

                expect(u(dereffed).uri).to.equal(dst.uri);
            })

            it("ToOneReference(foo)(src, dst) === undefined if not found ", function() {
                expect(u( deref(ss.LocalModel({ attributes: { sizzle: 'sazzle' } }), 
                                ss.LocalCollection({ models: { bizzle: ss.LocalModel() } })) ))
                    .to.equal(undefined);
            });

            it("When set to a model not in the referenced collection, adds it", function() {
                var collection = ss.LocalCollection({ models: {} });
                var model = ss.LocalModel({ attributes: { sizzle: null } }).withSubresourcesFrom({ sizzle: collection });

                model.attributes().sizzle(ss.LocalModel({ attributes: { resource_uri: 'bizzle' } }));

                assert(_(collection.models()).has('bizzle'));
            });
        });
    });
});
