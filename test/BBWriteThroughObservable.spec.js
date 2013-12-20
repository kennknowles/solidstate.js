/* global describe, it */
/* jshint -W070 */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([
    'backbone',
    'solidstate',
    'chai',
    'claire',
], function(Backbone, ss, chai, claire) {
    "use strict";

    var 
        expect = chai.expect,
        assert = chai.assert;

    describe("BBWriteThroughObservable <: Observable *", function() {
        it("Writes back to a backbone model", function() {
            var m = new Backbone.Model(); // No need for a mock, here
            var o = ss.BBWriteThroughObservable({
                bbModel: m,
                attribute: 'foo',
                value: 3
            });

            expect(o()).to.equal(3);
            expect(m.get('foo')).to.equal(3);

            o(4);
            
            expect(o()).to.equal(4);
            expect(m.get('foo')).to.equal(4);
        });
    });
});
