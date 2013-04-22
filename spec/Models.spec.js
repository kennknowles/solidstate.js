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

    describe("Models <: Observable {:Observable Model}" , function() {
        it('Writes new models to their URI, otherwise sets all their attributes', function() {
            var m = ss.LocalModel({ attributes: { foo: 'baz', resource_uri: '/fake/uri/1' } });
            var models = ss.Models({ models: { "/fake/uri/1": m } });

            expect(_(models()).keys()).to.deep.equal(['/fake/uri/1']);
            expect(models()['/fake/uri/1'].attributes().foo()).to.equal('baz');

            models({ '/fake/uri/1': ss.LocalModel({ attributes: { foo: 'bizzle', resource_uri: '/fake/uri/1'} }) });

            expect(models()['/fake/uri/1'].attributes().foo()).to.equal('bizzle');
            expect(m.attributes().foo()).to.equal('bizzle');
        });
    });
});
