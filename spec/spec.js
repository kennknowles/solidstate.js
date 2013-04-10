"use strict";
if (typeof define !== 'function') { var define = require('amdefine')(module) }
define([
    'underscore',
    'backbone',
    'knockout', 
    'solidstate',
    'sinon',
    'chai',
], function(_, Backbone, ko, ss, sinon, chai) {
    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        expect = chai.expect,
        assert = chai.assert;

    chai.Assertion.includeStack = true;

    var localModelAttributeSpec = function(constructModel) {
        it("Can have its attributes set one at a time or en masse, without triggering an update on the whole collection unless the keys change", function() {
            var m = constructModel({
                attributes: {
                    foo: "hello",
                    baz: "goodbye"
                }
            });
            var spy = sinon.spy();

            m.attributes.subscribe(spy);
            m.attributes().baz('hello again');

            expect(m.attributes().baz()).to.equal('hello again');
            assert(!spy.called);

            m.attributes({foo: 'knock knock', baz: "who's there"});
            
            expect(m.attributes().foo()).to.equal('knock knock');
            expect(m.attributes().baz()).to.equal("who's there");
            assert(!spy.called);

            m.attributes({boomer: "bizzle"});
            expect(m.attributes().boomer()).to.equal("bizzle");
            assert(spy.called);
        });

    };

    var withSubresourcesFromReadSpec = function(model, field, collection) {
        var overlay = {};
        overlay[field] = collection;
        
        var val = model.attributes()[field]();
        
        describe(".withSubresourcesFrom({field: collection})", function() {
            if ( _(collection).has(val) ) {
                it(".attributes()[field]() === collection[model.attributes().field()]  // when .attributes().field() is in collection", function() {
                    expect(model.withSubresourcesFrom(overlay).attributes()[field]()).to.equal(collection[val]);
                });
            } else {
                it(".attributes()[field]() === undefined   // when .attributes().field() is not in the collection", function() {
                    expect(model.withSubresourcesFrom(overlay).attributes()[field]()).to.equal(undefined);
                });
            }
        });
    }

    var withSubresourcesFromWriteSpec = function(model, field, collection) {
        describe("The write behavior", function() {
            var overlay = {};
            overlay[field] = collection;

            var val = model.attributes()[field]();

            it("After model.withSubresourcesFrom({field: collection}).attributes()[field](subModel), the value of model.attributes()[field] is subModel's URL", function() {
                model.withSubresourcesFrom(overlay).attributes()[field](ss.LocalModel({ attributes: { resource_uri: 'fizzle' } }));
                expect(model.attributes()[field]()).to.equal('fizzle');
            });
        })
    }

    describe("LocalModel <: Model", function() {
        it("Is constructed directly from a dictionary of attributes", function() {
            var m = ss.LocalModel({
                attributes: {
                    foo: "hello",
                    baz: "goodbye"
                }
            });

            expect(m.attributes().foo()).to.equal("hello");
            expect(m.attributes().baz()).to.equal("goodbye");
        });

        localModelAttributeSpec(ss.LocalModel);

        it("Is always `ready`", function() {
            var m = ss.LocalModel({ attributes: { foo: 'baz' } });
            expect(m.state()).to.equal('ready');
            m.fetch();
            expect(m.state()).to.equal('ready');
            m.save();
            expect(m.state()).to.equal('ready');
        });
    });

    describe("NewModel <: Model", function() {
        describe("Is constructed from arguments for a LocalModel (and a create function) and acts like a local model until saved", function() {
            localModelAttributeSpec(ss.NewModel);
        });

        var m = ss.NewModel({ attributes: { link: 'to_resource' }, create: function() { } });
        withSubresourcesFromReadSpec(m, 'link', { to_resource: { attributes: ss.LocalModel({ resource_uri: 'to_resource' }) } });
        withSubresourcesFromReadSpec(m, 'link', { other_resource: { attributes: ss.LocalModel({ resource_uri: 'other_resource' }) } });
        
        var m = ss.NewModel({ attributes: { link: 'to_resource' }, create: function() { } });
        withSubresourcesFromWriteSpec(m, 'link', { to_resource: { attributes: ss.LocalModel({ resource_uri: 'to_resource' }) } });
        
        it("Passes the current values from the LocalModel to the `create` function", function() {
            var wrapper = {
                newModel: function(args) {
                    return {
                        state: o('ready'),
                        model: o(ss.LocalModel(args))
                    };
                }
            };
            var spy = sinon.spy(wrapper, 'newModel');

            var m = ss.NewModel({
                name: 'me',
                attributes: {
                    foo: 'baz'
                },
                create: wrapper.newModel
            });

            assert(!spy.called);
            m.attributes().foo('bizzle');
            m.save();
            assert(spy.called, 'newModel not called');
            
            var args = spy.args[0][0];
            expect(args.name).to.equal('me');
            expect(u(u(args.attributes).foo)).to.equal('bizzle');
        });

        it("When errors occur, stores them in attributeErrors() and returns to the initial state", function() {
            var wrapper = {
                newModel: function(args) {
                    return {
                        state: o('error'),
                        attributeErrors: o({'__all__': 'Die'})
                    };
                }
            };
            var spy = sinon.spy(wrapper, 'newModel');

            var m = ss.NewModel({
                name: 'me',
                attributes: {
                    foo: 'baz'
                },
                create: wrapper.newModel
            });

            assert(!spy.called, 'newModel called too soon');
            m.attributes().foo('bizzle');
            m.save();
            assert(spy.called, 'newModel not called');
            
            var args = spy.args[0][0];
            expect(args.name).to.equal('me');
            expect(u(u(args.attributes).foo)).to.equal('bizzle');

            expect(m.attributeErrors()).to.deep.equal({'__all__': 'Die'});
        });

        it("Prior to a save, can still have withSubresourcesFrom proxy its attributes", function() {
            var wrapper = {
                newModel: function(args) {
                    return {
                        state: o('ready'),
                        model: o(ss.LocalModel(args))
                    };
                }
            };
            var spy = sinon.spy(wrapper, 'newModel');

            var m = ss.NewModel({
                name: 'me',
                attributes: {
                    foo: 'baz',
                    link: 'to_resource'
                },
                create: wrapper.newModel
            });

            var m2 = m.withSubresourcesFrom({ link: { to_resource: { attributes: o({ resource_uri: o('to_resource') }) } } });
            var m3 = m.withSubresourcesFrom({ link: {} });

            m3.attributes().link({ attributes: o({ resource_uri: o('fake_uri') }) });
            expect(m.attributes().link()).to.equal('fake_uri');
            m2.attributes().link({ attributes: o({ resource_uri: o('to_resource') }) });
            expect(m2.attributes().link().attributes().resource_uri()).to.equal('to_resource');
            
            m2.save();
            
            var args = spy.args[0][0];
            expect(args.name).to.equal('me');
            expect(u(u(args.attributes).link)).to.equal('to_resource');
            expect(m2.attributes().link().attributes().resource_uri()).to.equal('to_resource');
        });


        it("After a save(), it acquires the behavior of the model provided by `create`, when ready", function() {
            var savingState = o('saving');
            var savedModel = ss.LocalModel({ attributes: { foo: 'bizzle' }});

            var m = ss.NewModel({
                attributes: {
                    foo: 'baz'
                },
                create: function(args) {
                    return {
                        state: savingState,
                        model: o(savedModel)
                    };
                }
            });

            expect(m.attributes().foo()).to.equal('baz');
            expect(m.state()).to.equal('initial');
            
            m.save();
            expect(m.attributes().foo()).to.equal('baz');
            expect(m.state()).to.equal('saving');

            savingState('ready');
            expect(m.attributes().foo()).to.equal('bizzle');
            expect(m.state()).to.equal('ready');
            m.attributes().foo('boing');
            expect(savedModel.attributes().foo()).to.equal('boing');
        });
    });

    describe("Model", function() {
        it("Directly wraps the implementation", function() {

            var impl = { state: o("fetching") };
            var m = new ss.Model(impl);

            expect(m.state()).to.equal("fetching");
            impl.state('ready');
            expect(m.state()).to.equal("ready");
        });

        it("Provides .toJSON that serializes the current value of the attributes, not the Model interface itself", function() {
            var impl = { attributes: o({foo: o('baz')}) };
            var m = new ss.Model(impl);

            expect(JSON.parse(JSON.stringify(m))).to.deep.equal({foo: 'baz'});
            
            var impl = { attributes: o({foo: 'baz', subresource: o( new ss.Model({ attributes: o({ bizzle: o('bazzle') }) }) ) }) };
            var m = new ss.Model(impl);
            
            expect(JSON.parse(JSON.stringify(m))).to.deep.equal({foo: 'baz', subresource: { bizzle: 'bazzle'} });
        });

        it("Provides .withState that blends the provided state with the underlying state", function() {
            var impl = { state: o("fetching") };
            var overlayed = o("fetching");

            var m = new ss.Model(impl).withState(overlayed);

            // fetching && fetching
            expect(m.state()).to.equal("fetching");

            // ready && fetching
            overlayed("ready");
            expect(m.state()).to.equal("fetching");

            // ready && ready
            impl.state("ready");
            expect(m.state()).to.equal("ready");

            // fetching && ready
            overlayed("fetching");
            expect(m.state()).to.equal("fetching");
        });

        it("Provides .withAttributes that overlays the provided attributes with the underlying attributes", function() {
            var impl = { attributes: o({"foo": o(1), "baz": o(8)}) };
            var overlayed = ko.observable({"foo": o(4)});
            var overlayed2 = ko.observable({"bizzz": o(5)});

            var m = new ss.Model(impl);
            var m2 = m.withAttributes(overlayed);
            var m3 = m.withAttributes(overlayed2);
            
            expect(m.attributes().foo()).to.equal(1);
            expect(m2.attributes().foo()).to.equal(4);
            expect(m3.attributes().bizzz()).to.equal(5);

            m2.attributes({"foo": o(7)})
            expect(m.attributes().foo()).to.equal(1);
            expect(m2.attributes().foo()).to.equal(7);

            m2.attributes().foo(10);
            expect(m.attributes().foo()).to.equal(1);
            expect(m2.attributes().foo()).to.equal(10);
            
            m2.attributes({"foo": o(9), "baz": o(22)})
            expect(m.attributes().foo()).to.equal(1);
            expect(m2.attributes().foo()).to.equal(9);
            expect(m.attributes().baz()).to.equal(22);
            expect(m2.attributes().baz()).to.equal(22);
        });

        describe(".withSubresourcesFrom", function() {

            it("for singular references, overlays models looked up in a dict or Collection, sets state to 'fetching' until they are all found, and writes URLs back", function() {
                var impl = { 
                    state: o("ready"),
                    attributes: o({ foo: o("baz") }) 
                };
            
                var m = new ss.Model(impl);
                var m2 = m.withSubresourcesFrom({ foo: { baz: { bingle: 24 } } });
                var m3 = m.withSubresourcesFrom({ foo: { boo: { bingle: 24 } } });
                
                expect(m.attributes().foo()).to.equal("baz");
                expect(m2.attributes().foo()).to.deep.equal({ bingle: 24 });
                expect(m2.state()).to.equal("ready");
                expect(m3.state()).to.equal("fetching");
                
                // Minor hack: resource_uri hardcoded in the library (as in a few places)
                m2.attributes().foo({ attributes: o({ resource_uri: o('bizzle') }) });
                expect(m.attributes().foo()).to.equal('bizzle');
            });

            it("For fromMany relationships, where there is no attribute... hosed without relationship knowledge!", function() {
                
            });
        });
    });

    describe("FilterLink <: CollectionLink", function() {
        it("is built from a target (codomain) collection and a function to build the filters per source collection", function() {
            var src = new ss.Collection({
                models: o({
                    a: { x: 1 },
                    b: { x: 2 },
                    c: { x: null },
                    d: { x: 2 },
                    e: {}
                })
            });

            var withDataSpy = sinon.spy();
            var dst = new ss.Collection({ withData: withDataSpy });
            var filterLink = ss.FilterLink({ withData: { my_filter: function(model) { return model.x; } } });

            var filteredDst = filterLink.link(src, dst);
            var dataObservable = withDataSpy.args[0][0];
            expect(dataObservable()).to.deep.equal({ my_filter: [1, 2], limit: 0 });
        });
    });

    describe("DirectUrlLink <: CollectionLink", function() {
        it("Is a link from an attribute containing a Url to all related items in the other collection", function() {
            var src = new ss.Collection({
                models: o({
                    a: ss.LocalModel({ attributes: { x: '/resource/1' } }),
                    b: ss.LocalModel({ attributes: { x: '/resource/47' } }),
                    c: ss.LocalModel({ attributes: { x: null } }),
                    d: ss.LocalModel({ attributes: { x: '/resource/1' } }),
                    e: ss.LocalModel()
                })
            });

            var withDataSpy = sinon.spy();
            var dst = new ss.Collection({
                withData: withDataSpy
            });
            
            var directLink = ss.DirectUrlLink({
                from: 'x',
            });

            var filteredDst = directLink.link(src, dst);
            var dataObservable = withDataSpy.args[0][0];
            expect(dataObservable()).to.deep.equal({ id__in: ['1', '47'], limit: 0 });
        });
    });

    describe("DirectDeref({from: foo}) <: Dereference", function() {
        describe(".deref(src, dst)", function() {
            var directDeref = ss.DirectDeref({from:'sizzle'});

            it("=== dst[foo] // if dst not a Collection", function() {
                expect(directDeref.deref(ss.LocalModel({ attributes: { sizzle: 'bizzle' } }), { bizzle: 'bazzle' }))
                    .to.equal('bazzle');

                expect(directDeref.deref(ss.LocalModel({ attributes: { sizzle: 'sazzle' } }), { bizzle: 'bazzle' }))
                    .to.equal(undefined);
            });

            it("=== dst.models()[foo] // if dst instanceof Collection", function() {
                expect(directDeref.deref(ss.LocalModel({ attributes: { sizzle: 'bizzle' } }), new ss.Collection({ models: o({ bizzle: 'bazzle' }) })))
                    .to.equal('bazzle');

                expect(directDeref.deref(ss.LocalModel({ attributes: { sizzle: 'sazzle' } }), new ss.Collection({ models: o({ bizzle: 'bazzle' }) })))
                    .to.equal(undefined);
            });
        });
    });

    describe("FilterDeref({filter: f}) <: Dereference", function() {
        var filterDeref = ss.FilterDeref({ filter: function(source, dest) { return source.attributes().x() == dest.x } });
        
        describe(".deref(src, dst)", function() {
            
            it("=== _(dst).filter( f(src, _) ) // more or less", function() {
                var dst = {
                    '/foo/1': { x: 1, y: 1 },
                    '/foo/2': { x: 7, y: 2 },
                    '/foo/3': { x: 2, y: 3 },
                    '/foo/4': { x: 9, y: 4 },
                    '/foo/5': { x: 7, y: 5 },
                    '/foo/6': { x: 'hello', y: 6 }
                };

                var dereferenced = _(filterDeref.deref(ss.LocalModel({ attributes: { x: 7 } }), dst)).sortBy(function(foo) { return foo.y; });
                expect(dereferenced).to.deep.equal([{x:7, y:2}, {x:7, y:5}])
            });
        });
    });

    describe("The solidstate BBWriteThroughObservable", function() {
        it("Writes back to a backbone model", function() {
            var m = new Backbone.Model(); // No need for a mock, here
            var o = ss.BBWriteThroughObservable({
                bbModel: m,
                attribute: 'foo',
                value: 3
            });

            expect(o()).to.equal(3);
            expect(m.get('foo')).to.equal(3);
        });
    });

    describe("The solidstate RemoteModel implementation of Model", function() {
        it("Writes back to a backbone model", function() {
            var spySet = sinon.spy();
            var spyFetch = sinon.spy();
            var spySave = sinon.spy();
            var MockBBModel = Backbone.Model.extend({
                fetch: spyFetch,
                save: spySave
            });

            var MockBackbone = {
                Model: MockBBModel
            };

            var model  = ss.RemoteModel({
                url: '/some/fake/url',
                Backbone: MockBackbone
            });

            model.attributes({foo: 'bar'});
            expect(model.attributes().foo()).to.equal('bar');
        });
    });

    describe("RemoteCollection <: Collection", function() {
        describe(".newModel yields a new model in the collection (with the right subresources) which calls back to save, when ready", function() {

            var spyCreate = sinon.spy();
            var MockBBCollection = Backbone.Collection.extend({
                create: spyCreate
            });
            var MockBBModel = function() { };
            var MockBackbone = {
                Collection: MockBBCollection,
                Model: MockBBModel
            };

            var baseColl = ss.RemoteCollection({
                url: '/some/fake/url',
                Backbone: MockBackbone
            });
            var overlay = { link: { 'model_uri': ss.LocalModel({ attributes: { foo: 'baz' } }) } };
            var coll = baseColl.withSubresourcesFrom(overlay);

            var newModel = coll.newModel({ attributes: { link: null } });
            newModel.attributes().link(ss.LocalModel({ attributes: { resource_uri: 'fake_uri' } }));
            newModel.save();

            it("calls back to the collection to create a remote model with the URL of the overlay", function() {
                var args = spyCreate.args[0][0];
                expect(args.link).to.equal('fake_uri');
            });
        });

        // If the above is done with a derived relatedSubresource then it should immediately re-fetch!
    });

    describe("The solidstate Collection fluent interface", function() {
        it("Provides .withSubresourcesFrom that applies to all of its models, and derives its ready state from theirs", function() {

            var impl = {
                state: ko.observable("ready"),
                models: ko.observable({
                    'one': new ss.Model({ state: o("ready"), attributes: o({ foo: o("baz")}) }),
                    'two': new ss.Model({ state: o("ready"), attributes: o({ foo: o("biz")}) })
                })
            };

            var incomplete_models = o({baz: 25});

            var c = new ss.Collection(impl);
            var c2 = c.withSubresourcesFrom({ foo: { models: o({ baz: 24, biz: 89 }) } });;
            var c3 = c.withSubresourcesFrom({ foo: { models: incomplete_models } });

            expect(c.state()).to.equal("ready");

            expect(c2.state()).to.equal("ready")
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
            expect(c3.state()).to.equal("ready");
            expect(c3.models().one.state()).to.equal("ready");
            expect(c3.models().one.attributes().foo()).to.equal(29);
            expect(c3.models().two.state()).to.equal("ready");
            expect(c3.models().two.attributes().foo()).to.equal(101);
        });
    });

    describe("A solidstate Relationship", function() {
        it("Filters the destination collection according to the sourceKey", function() {
            var r = new ss.Relationship({});
        });
    });
});
