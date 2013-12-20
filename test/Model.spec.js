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

    describe("Model (fluent interface)", function() {
        it("Directly wraps the implementation", function() {
            var impl = {
                state: ss.State('fetching'),
                name: 'foo',
                uri: 'zoo',
                attributes: ss.Attributes({}),
                relationships: {},
                errors: o({}),
                fetch: function() { },
                save: function() { }
            };
            var m = ss.Model(impl);

            expect(m.state()).to.equal("fetching");
            impl.state('ready');
            expect(m.state()).to.equal("ready");
        });

        it("Provides .toJSON that serializes the current value of the attributes, not the Model interface itself", function() {
            var impl = {
                state: ss.State('ready'),
                name: 'foo',
                uri: 'zoo',
                attributes: ss.Attributes({ attributes: { foo: o('baz') } }),
                relationships: {},
                errors: o({}),
                fetch: function() { },
                save: function() { }
            };
            var m = ss.Model(impl);

            expect(JSON.parse(JSON.stringify(m))).to.deep.equal({foo: 'baz'});
            
            var impl2 = { 
                state: ss.State('ready'), 
                name: 'foo',
                uri: 'zoo',
                relationships: {},
                errors: o({}),
                fetch: function() { },
                save: function() { },
                attributes: ss.Attributes({
                    attributes: { 
                        foo: 'baz',
                        subresource: ss.LocalModel({ 
                            state: ss.State('ready'), 
                            attributes: ss.Attributes({ attributes: { bizzle: 'bazzle' } }) 
                        })
                    }
                })
            };
            var m2 = ss.Model(impl2);
            
            expect(JSON.parse(JSON.stringify(m2))).to.deep.equal({foo: 'baz', subresource: { bizzle: 'bazzle'} });
        });

        it("Provides .withAttributes that overlays the provided attributes with the underlying attributes", function() {

            var m = ss.LocalModel({ 
                name: 'foo',
                uri: 'bizzle',
                state: ss.State('ready'), 
                attributes: ss.Attributes({ attributes: {"foo": o(1), "baz": o(8)} }),
                fetch: function() { },
                save: function() { }
            });
            var overlayed = ss.Attributes({ attributes: {"foo": o(4)} });
            var overlayed2 = ss.Attributes({ attributes: {"bizzz": o(5)} });

            var m2 = m.withAttributes(overlayed);
            var m3 = m.withAttributes(overlayed2);
            
            expect(m.attributes().foo()).to.equal(1);
            expect(m2.attributes().foo()).to.equal(4);
            expect(m3.attributes().bizzz()).to.equal(5);

            m2.attributes({"foo": o(7)});
            expect(m.attributes().foo()).to.equal(1);
            expect(m2.attributes().foo()).to.equal(7);

            m2.attributes().foo(10);
            expect(m.attributes().foo()).to.equal(1);
            expect(m2.attributes().foo()).to.equal(10);
            
            m2.attributes({"foo": o(9), "baz": o(22)});
            expect(m.attributes().foo()).to.equal(1);
            expect(m2.attributes().foo()).to.equal(9);
            expect(m.attributes().baz()).to.equal(22);
            expect(m2.attributes().baz()).to.equal(22);
        });
    });
});
