define([
    'knockout', 
    'solidstate',
    'jasmine',
], function(ko, ss) {
    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed;

    var localModelAttributeSpec = function(constructModel) {
        it("Can have its attributes set one at a time or en masse, without triggering an update on the whole collection unless the keys change", function() {
            var m = constructModel({
                attributes: {
                    foo: "hello",
                    baz: "goodbye"
                }
            });
            var spy = jasmine.createSpy();

            m.attributes.subscribe(spy);
            m.attributes().baz('hello again');

            expect(m.attributes().baz()).toBe('hello again');
            expect(spy).not.toHaveBeenCalled();

            m.attributes({foo: 'knock knock', baz: "who's there"});
            
            expect(m.attributes().foo()).toBe('knock knock');
            expect(m.attributes().baz()).toBe("who's there");
            expect(spy).not.toHaveBeenCalled();

            m.attributes({boomer: "bizzle"});
            expect(m.attributes().boomer()).toBe("bizzle");
            expect(spy).toHaveBeenCalled();
        });

    };

    var withSubresourcesFromReadSpec = function(model, field, collection) {
        var overlay = {};
        overlay[field] = collection;
        
        var val = model.attributes()[field]();
        
        describe(".withSubresourcesFrom({field: collection})", function() {
            if ( _(collection).has(val) ) {
                it(".attributes()[field]() === collection[model.attributes().field()]  // when .attributes().field() is in collection", function() {
                    expect(model.withSubresourcesFrom(overlay).attributes()[field]()).toEqual(collection[val]);
                });
            } else {
                it(".attributes()[field]() === undefined   // when .attributes().field() is not in the collection", function() {
                    expect(model.withSubresourcesFrom(overlay).attributes()[field]()).toBe(undefined);
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
                expect(model.attributes()[field]()).toBe('fizzle');
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

            expect(m.attributes().foo()).toBe("hello");
            expect(m.attributes().baz()).toBe("goodbye");
        });

        localModelAttributeSpec(ss.LocalModel);

        it("Is always `ready`", function() {
            var m = ss.LocalModel({ attributes: { foo: 'baz' } });
            expect(m.state()).toBe('ready');
            m.fetch();
            expect(m.state()).toBe('ready');
            m.save();
            expect(m.state()).toBe('ready');
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
            spyOn(wrapper, 'newModel').andCallThrough();

            var m = ss.NewModel({
                name: 'me',
                attributes: {
                    foo: 'baz'
                },
                create: wrapper.newModel
            });

            expect(wrapper.newModel).not.toHaveBeenCalled();
            m.attributes().foo('bizzle');
            m.save();
            
            var args = wrapper.newModel.mostRecentCall.args[0];
            expect(args.name).toBe('me');
            expect(u(u(args.attributes).foo)).toBe('bizzle');
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
            spyOn(wrapper, 'newModel').andCallThrough();

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
            expect(m.attributes().link()).toBe('fake_uri');
            m2.attributes().link({ attributes: o({ resource_uri: o('to_resource') }) });
            expect(m2.attributes().link().attributes().resource_uri()).toBe('to_resource');
            
            m2.save();
            
            var args = wrapper.newModel.mostRecentCall.args[0];
            expect(args.name).toBe('me');
            expect(u(u(args.attributes).link)).toBe('to_resource');
            expect(m2.attributes().link().attributes().resource_uri()).toBe('to_resource');
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

            expect(m.attributes().foo()).toBe('baz');
            expect(m.state()).toBe('initial');
            
            m.save();
            expect(m.attributes().foo()).toBe('baz');
            expect(m.state()).toBe('saving');

            savingState('ready');
            expect(m.attributes().foo()).toBe('bizzle');
            expect(m.state()).toBe('ready');
            m.attributes().foo('boing');
            expect(savedModel.attributes().foo()).toBe('boing');
        });
    });

    describe("Model", function() {
        it("Directly wraps the implementation", function() {

            var impl = { state: o("fetching") };
            var m = new ss.Model(impl);

            expect(m.state()).toBe("fetching");
            impl.state('ready');
            expect(m.state()).toBe("ready");
        });

        it("Provides .toJSON that serializes the current value of the attributes, not the Model interface itself", function() {
            var impl = { attributes: o({foo: o('baz')}) };
            var m = new ss.Model(impl);

            expect(JSON.parse(JSON.stringify(m))).toEqual({foo: 'baz'});
            
            var impl = { attributes: o({foo: 'baz', subresource: o( new ss.Model({ attributes: o({ bizzle: o('bazzle') }) }) ) }) };
            var m = new ss.Model(impl);
            
            expect(JSON.parse(JSON.stringify(m))).toEqual({foo: 'baz', subresource: { bizzle: 'bazzle'} });
        });

        it("Provides .withState that blends the provided state with the underlying state", function() {
            var impl = { state: o("fetching") };
            var overlayed = o("fetching");

            var m = new ss.Model(impl).withState(overlayed);

            // fetching && fetching
            expect(m.state()).toBe("fetching");

            // ready && fetching
            overlayed("ready");
            expect(m.state()).toBe("fetching");

            // ready && ready
            impl.state("ready");
            expect(m.state()).toBe("ready");

            // fetching && ready
            overlayed("fetching");
            expect(m.state()).toBe("fetching");
        });

        it("Provides .withAttributes that overlays the provided attributes with the underlying attributes", function() {
            var impl = { attributes: o({"foo": o(1), "baz": o(8)}) };
            var overlayed = ko.observable({"foo": o(4)});
            var overlayed2 = ko.observable({"bizzz": o(5)});

            var m = new ss.Model(impl);
            var m2 = m.withAttributes(overlayed);
            var m3 = m.withAttributes(overlayed2);
            
            expect(m.attributes().foo()).toBe(1);
            expect(m2.attributes().foo()).toBe(4);
            expect(m3.attributes().bizzz()).toBe(5);

            m2.attributes({"foo": o(7)})
            expect(m.attributes().foo()).toBe(1);
            expect(m2.attributes().foo()).toBe(7);

            m2.attributes().foo(10);
            expect(m.attributes().foo()).toBe(1);
            expect(m2.attributes().foo()).toBe(10);
            
            m2.attributes({"foo": o(9), "baz": o(22)})
            expect(m.attributes().foo()).toBe(1);
            expect(m2.attributes().foo()).toBe(9);
            expect(m.attributes().baz()).toBe(22);
            expect(m2.attributes().baz()).toBe(22);
        });

        describe(".withSubresourcesFrom", function() {

            it("For singular references, overlays models looked up in a dict or Collection, sets state to 'fetching' until they are all found, and writes URLs back", function() {
                var impl = { 
                    state: o("ready"),
                    attributes: o({ foo: o("baz") }) 
                };
            
                var m = new ss.Model(impl);
                var m2 = m.withSubresourcesFrom({ foo: { baz: { bingle: 24 } } });
                var m3 = m.withSubresourcesFrom({ foo: { boo: { bingle: 24 } } });
                
                expect(m.attributes().foo()).toBe("baz");
                expect(m2.attributes().foo()).toEqual({ bingle: 24 });
                expect(m2.state()).toBe("ready");
                expect(m3.state()).toBe("fetching");
                
                // Minor hack: resource_uri hardcoded in the library (as in a few places)
                m2.attributes().foo({ attributes: o({ resource_uri: o('bizzle') }) });
                expect(m.attributes().foo()).toEqual('bizzle');
            });

            it("For fromMany relationships, where there is no attribute... hosed without relationship knowledge!", function() {
                
            });
        });
    });

    describe("FilterLink <: CollectionLink", function() {
        it("Is built from a target (codomain) collection and a function to build the filters per source collection", function() {
            var src = new ss.Collection({
                models: o({
                    a: { x: 1 },
                    b: { x: 2 },
                    c: { x: null },
                    d: { x: 2 },
                    e: {}
                })
            });

            var withDataSpy = jasmine.createSpy();
            var dst = new ss.Collection({
                withData: withDataSpy
            });

            var filterLink = ss.FilterLink({
                target: dst,
                withData: { my_filter: function(model) { return model.x; } }
            });

            var filteredDst = filterLink.linkFrom(src);
            var dataObservable = withDataSpy.mostRecentCall.args[0];
            expect(dataObservable()).toEqual({ my_filter: [1, 2] });
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

            var withDataSpy = jasmine.createSpy();
            var dst = new ss.Collection({
                withData: withDataSpy
            });
            
            var directLink = ss.DirectUrlLink({
                from: 'x',
                target: dst
            });

            var filteredDst = directLink.linkFrom(src);
            var dataObservable = withDataSpy.mostRecentCall.args[0];
            expect(dataObservable()).toEqual({ id__in: ['1', '47'] });
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

            expect(o()).toBe(3);
            expect(m.get('foo')).toBe(3);
        });
    });

    describe("The solidstate RemoteModel implementation of Model", function() {
        it("Writes back to a backbone model", function() {
            var spySet = jasmine.createSpy();
            var spyFetch = jasmine.createSpy();
            var spySave = jasmine.createSpy();
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
            expect(model.attributes().foo()).toBe('bar');
        });
    });

    describe("The solidstate RemoteCollection implementation of Collection", function() {
        describe("newModel yields a new model in the collection (with the right subresources) which calls back to save, when ready", function() {

            var spyCreate = jasmine.createSpy();
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
                var args = spyCreate.mostRecentCall.args[0];
                expect(args.link).toBe('fake_uri');
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

            expect(c.state()).toBe("ready");

            expect(c2.state()).toBe("ready")
            expect(c2.models().one.state()).toBe("ready");
            expect(c2.models().one.attributes().foo()).toBe(24);
            expect(c2.models().two.state()).toBe("ready");
            expect(c2.models().two.attributes().foo()).toBe(89);

            expect(c3.state()).toBe("fetching");
            expect(c3.models().one.state()).toBe("ready");
            expect(c3.models().one.attributes().foo()).toBe(25);
            expect(c3.models().two.state()).toBe("fetching");
            expect(c3.models().two.attributes().foo()).toBe(undefined);

            incomplete_models({baz: 29, biz: 101});
            expect(c3.state()).toBe("ready");
            expect(c3.models().one.state()).toBe("ready");
            expect(c3.models().one.attributes().foo()).toBe(29);
            expect(c3.models().two.state()).toBe("ready");
            expect(c3.models().two.attributes().foo()).toBe(101);
        });
    });

    describe("A solidstate Relationship", function() {
        it("Filters the destination collection according to the sourceKey", function() {
            var r = new ss.Relationship({});
        });
    });
});
