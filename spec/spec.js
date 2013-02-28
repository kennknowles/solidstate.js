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

            m.attributes({foo: "bizzle"});
            expect(m.attributes().foo()).toBe("bizzle");
            expect(spy).toHaveBeenCalled();
        });

    }

    describe("The LocalModel implementation of Model", function() {
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

    describe("The NewModel implementation of Model", function() {
        describe("Is constructed from arguments for a LocalModel (and a create function) and acts like a local model until saved", function() {
            localModelAttributeSpec(ss.NewModel);
        });
        
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

    describe("The solidstate Model fluent interface", function() {
        it("Directly wraps the implementation", function() {

            var impl = { state: o("fetching") };
            var m = new ss.Model(impl);

            expect(m.state()).toBe("fetching");
            impl.state('ready');
            expect(m.state()).toBe("ready");
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

            var m = new ss.Model(impl);
            var m2 = m.withAttributes(overlayed);
            
            expect(m.attributes().foo()).toBe(1);
            expect(m2.attributes().foo()).toBe(4);

            m2.attributes({"foo": o(7)})
            expect(m.attributes().foo()).toBe(1);
            expect(m2.attributes().foo()).toBe(7);
            
            m2.attributes({"foo": o(9), "baz": o(22)})
            expect(m.attributes().foo()).toBe(1);
            expect(m2.attributes().foo()).toBe(9);
            expect(m.attributes().baz()).toBe(22);
            expect(m2.attributes().baz()).toBe(22);
        });

        it("Provides .withSubresourcesFrom that looks up attributes in a dict or Collection (and sets state to 'fetching' until they are all found)", function() {
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
        });
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
            expect(c3.models().two.attributes().foo()).toBe("biz");

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
