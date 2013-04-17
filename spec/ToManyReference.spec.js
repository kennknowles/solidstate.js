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

    describe("ToManyReference(foo) <: Reference", function() {
        describe("(src, dst)", function() {
            var deref = ss.ToManyReference({from:'sizzle'});

            it("ToManyReference(foo)(src, dst) === _(src.attributes()[foo]).map(dst.models()[_])", function() {
                var dereffed = deref(ss.LocalModel({ attributes: { sizzle: ['bizzle', 'bozzle'] } }), 
                                     ss.LocalCollection({ models: { bizzle: 'bazzle', bozzle: 'bangle' } }));

                expect(u(dereffed)).to.deep.equal(['bazzle', 'bangle']);
            })

            it("ToManyReference(foo)(src, dst) === undefined if not all found?", function() {
                expect(u( deref(ss.LocalModel({ attributes: { sizzle: ['sazzle'] } }), 
                                ss.LocalCollection({ models: { bizzle: 'bazzle' } })) ))
                    .to.equal(undefined);
            });
        });
    });
});
