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

    chai.Assertion.includeStack = true;

    var withSubresourcesFromReadSpec = function(model, field, collection) {
        var overlay = {};
        overlay[field] = collection;
        
        var val = model.attributes()[field]();
        
        describe(".withSubresourcesFrom({field: collection})", function() {
            if ( _(collection.models()).has(val) ) {
                it(".attributes()[field]() === collection[model.attributes().field()]  // when .attributes().field() is in collection", function() {
                    expect(model.withSubresourcesFrom(overlay).attributes()[field]()).to.equal(u(collection.models()[val]));
                });
            } else {
                it(".attributes()[field]() === undefined   // when .attributes().field() is not in the collection", function() {
                    expect(model.withSubresourcesFrom(overlay).attributes()[field]()).to.equal(undefined);
                });
            }
        });
    };

    var withSubresourcesFromWriteSpec = function(model, field, collection) {
        describe("The write behavior", function() {
            var overlay = {};
            overlay[field] = collection;

            var val = model.attributes()[field]();

            it("After model.withSubresourcesFrom({field: collection}).attributes()[field](subModel), the value of model.attributes()[field] is subModel's URL", function() {
                model.withSubresourcesFrom(overlay).attributes()[field](ss.LocalModel({ attributes: { resource_uri: 'fizzle' } }));
                expect(model.attributes()[field]()).to.equal('fizzle');
            });
        });
    };

    describe("NewModel <: Model", function() {
        it("Passes the current values from the LocalModel to the `create` function", function() {
            var backend = ss.LocalCollection()
            var create = sinon.spy(backend, 'create');

            var m = ss.NewModel({
                name: 'me',
                attributes: { foo: 'baz' },
                create: create
            });

            assert(!create.called);
            m.attributes().foo('bizzle');
            m.save();
            assert(create.called, '`create` not called');
            
            var args = create.args[0][0];
            expect(u(args.name)).to.equal('me');
            expect(u(args.attributes.foo)).to.equal('bizzle');
        });

        it("When errors occur, stores them in errors() and returns to the initial state", function(done) {
            var create = sinon.spy(function(args) {
                var deferred = when.defer()
                deferred.reject({'__all__': 'Die'});
                return deferred.promise;
            });

            var m = ss.NewModel({
                name: 'me',
                attributes: {
                    foo: 'baz'
                },
                create: create
            });

            assert(!create.called, 'newModel called too soon');
            m.attributes().foo('bizzle');
            m.save();
            assert(create.called, 'newModel not called');
            
            var args = create.args[0][0];
            expect(args.name).to.equal('me');
            expect(u(u(args.attributes).foo)).to.equal('bizzle');

            when(m.state.reaches('initial'))
                .then(function() {
                    expect(m.errors()).to.deep.equal({'__all__': 'Die'});
                    done();
                })
                .otherwise(function(exception) {
                    console.error(exception.stack);
                });
        });

        it("Prior to a save, can still have withSubresourcesFrom proxy its attributes", function() {
            var create = sinon.spy(function(args) {
                return when.resolve(ss.LocalModel(args));
            })

            var m = ss.NewModel({
                name: 'me',
                attributes: {
                    foo: 'baz',
                    link: 'to_resource'
                },
                create: create
            });

            var m2 = m.withSubresourcesFrom({ 
                link: ss.LocalCollection({
                    models: {
                        to_resource: ss.LocalModel({ attributes: { resource_uri: 'to_resource' } })
                    }
                })
            });

            var m3 = m.withSubresourcesFrom({ link: ss.LocalCollection() });

            m3.attributes().link( ss.LocalModel({ attributes: { resource_uri: 'fake_uri' } }) );
            expect(m.attributes().link()).to.equal('fake_uri');

            m2.attributes().link( ss.LocalModel({ attributes: { resource_uri: 'to_resource' } }) );
            expect(m2.attributes().link().attributes().resource_uri()).to.equal('to_resource');
            
            m2.save();
            
            var args = create.args[0][0];
            expect(args.name).to.equal('me');
            expect(u(u(args.attributes).link)).to.equal('to_resource');
            expect(m2.attributes().link().attributes().resource_uri()).to.equal('to_resource');
        });


        it("After a save(), it acquires the behavior of the model provided by `create`, when ready", function(done) {
            var savedModel = ss.LocalModel({ attributes: { foo: 'bizzle' }});
            var savingDeferred = when.defer();

            var m = ss.NewModel({
                attributes: {
                    foo: 'baz'
                },
                create: function(args) {
                    return when(savingDeferred)
                        .then(function() {
                            var deferred = when.defer();
                            deferred.resolve(savedModel);
                            return deferred.promise
                        });
                }
            });

            expect(m.attributes().foo()).to.equal('baz');
            expect(m.state()).to.equal('initial');
            
            m.save();
            expect(m.attributes().foo()).to.equal('baz');
            expect(m.state()).to.equal('saving');

            savingDeferred.resolve(ss.LocalModel({ attributes: m.attributes }));
            
            when(m.state.reaches('ready'))
                .then(function() {
                    expect(m.attributes().foo()).to.equal('bizzle');
                    expect(m.state()).to.equal('ready');
                    m.attributes().foo('boing');
                    expect(savedModel.attributes().foo()).to.equal('boing');
                    done()
                });
        });
    });
});
