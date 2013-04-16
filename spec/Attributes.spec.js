/* global describe, it */
/* jshint -W070 */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([
    'solidstate',
    'sinon',
    'chai',
    'claire',
], function(ss, sinon, chai, claire) {
    "use strict";

    var 
      expect = chai.expect,
      assert = chai.assert;

    describe("Attributes <: Observable {:Observable *}" , function() {
        it('When an attribute is set directly, the toplevel observable does NOT register a change', function() {
            var attributes = ss.Attributes({ attributes: { foo: 'hello', } });
            var spy = sinon.spy();
            attributes.subscribe(spy);

            attributes().foo('hello again');

            expect(attributes().foo()).to.equal('hello again');
            assert(!spy.called);
        });

        it('When the entire dictionary is set, the contained attributes are each mutated, not replaced', function() {
            var attributes = ss.Attributes({ attributes: { foo: 'hello', baz: 'bizzle' } });
            var foo = attributes().foo;
            var baz = attributes().baz;
            var spy = sinon.spy();
            attributes.subscribe(spy);

            attributes({foo: 'knock knock', baz: "who's there"});
            
            expect(foo()).to.equal('knock knock');
            expect(baz()).to.equal("who's there");
            assert(!spy.called);
        });

        it('When new attributes are in the newly set dictionary, they are added', function() {
            var attributes = ss.Attributes();
            var spy = sinon.spy();
            attributes.subscribe(spy);

            attributes({boomer: "bizzle"});

            expect(attributes().boomer()).to.equal("bizzle");
            assert(spy.called);
        })

    });
});


