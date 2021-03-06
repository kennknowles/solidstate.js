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

    describe("Collection (fluent interface)", function() {
        it("Can have its state augmented replaced by .withState", function() {
            var c = ss.LocalCollection();
            expect(c.state()).to.equal('ready');
            
            var state2 = ss.State('initial');
            var c2 = c.withState(state2);
            expect(c2.state()).to.equal('initial');
            state2('fetching');
            expect(c2.state()).to.equal('fetching');
        });
        
        it("Can get a new debugging name via .withName", function() {
            var c = ss.LocalCollection({ name: 'foo' });
            expect(c.name).to.equal('foo');

            var c2 = c.withName('baz');
            expect(c2.name).to.equal('baz');
        });

        it("Provides .withSubresourcesFrom that applies to all of its models, and derives its ready state from their initial load", function(done) {
            var c = ss.LocalCollection({
                models: {
                    'one': ss.LocalModel({ attributes: { foo: "baz"} }),
                    'two': ss.LocalModel({ attributes: { foo: "biz"} })
                }
            });
            expect(c.state()).to.equal("ready");
            
            var incomplete_models = o({baz: 25});
            var c2 = c.withSubresourcesFrom({ foo: { models: o({ baz: 24, biz: 89 }) } });
            var c3 = c.withSubresourcesFrom({ foo: { models: incomplete_models } });

            expect(c.state()).to.equal("ready");

            expect(c2.state()).to.equal("ready");
            expect(c2.models().one.state()).to.equal("ready");
            expect(c2.models().one.attributes().foo()).to.equal(24);
            expect(c2.models().two.state()).to.equal("ready");
            expect(c2.models().two.attributes().foo()).to.equal(89);

            expect(c3.state()).to.equal("fetching");
            expect(c3.models().one.state()).to.equal("ready");
            expect(c3.models().one.attributes().foo()).to.equal(25);
            expect(c3.models().two.state()).to.equal("fetching");
            expect(c3.models().two.attributes().foo()).to.equal(undefined);

            incomplete_models({baz: 29, biz: 101});
            c3.state.reaches('ready')
                .then(function() {
                    expect(c3.state()).to.equal("ready");
                    expect(c3.models().one.state()).to.equal("ready");
                    expect(c3.models().one.attributes().foo()).to.equal(29);
                    expect(c3.models().two.state()).to.equal("ready");
                    expect(c3.models().two.attributes().foo()).to.equal(101);
                    done()
                })
                .otherwise(function(err) {
                    done(err);
                });
        });
        
        it("Creates new models with .newModel that appropriately proxy subresources", function() {
            var c = ss.LocalCollection();
            var createSpy = sinon.spy(c, 'create');

            var referenced = ss.LocalModel({ attributes: { resource_uri: 'zizzle' } });

            var extendedC = c.withSubresourcesFrom({ foo: ss.LocalCollection({ models: { 'zizzle': referenced } }) });
            var m = extendedC.newModel({ attributes: { foo: null } });
            
            m.attributes().foo( referenced );
            
            m.save();

            assert(createSpy.called);
            expect(u(createSpy.getCall(0).args[0].attributes.foo)).to.equal('zizzle');

            var m2 = extendedC.newModel({ attributes: { foo: referenced } });
            expect(m2.attributes().foo().attributes().resource_uri()).to.equal('zizzle');
        });

        it('Has .withRelationships that is inherited by its models', function() {
            var c = ss.LocalCollection({
                models: {
                    "/fake/uri/1": ss.LocalModel({ attributes: { bizzle: 'bozzle' } })
                }
            });

            expect(c.models()['/fake/uri/1'].attributes().bizzle()).to.equal('bozzle'); // sanity check
            expect(c.models()['/fake/uri/1'].relationships.foo).to.equal(undefined);
            
            var c2 = ss.LocalCollection();
            var c3 = c.withRelationships({
                foo: { link: ss.UrlLink({from: 'bizzle'})(ss.LinkToCollection(c2)) },
                bizzle: { link: ss.UrlLink({from: 'bizzle'})(ss.LinkToCollection(c2)) }
            });

            expect(c3.relationships.bizzle).to.be.ok;
            expect(c3.relationships.foo).to.be.ok;
            expect(c3.models()['/fake/uri/1'].attributes().bizzle()).to.equal('bozzle'); // sanity check
            expect(c3.models()['/fake/uri/1'].relationships.foo.link.resolve(c).uri).to.equal(c2.uri);
        });
    });
});
