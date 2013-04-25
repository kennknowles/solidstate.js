/* global describe, it */
/* jshint -W070 */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([
    'underscore',
    'knockout', 
    'solidstate',
    'sinon',
    'chai',
    'claire',
    'when',
], function(_, ko, ss, sinon, chai, claire, when) {
    "use strict";
    var o = ko.observable,
    u = ko.utils.unwrapObservable,
    c = ko.computed,
    expect = chai.expect,
    assert = chai.assert;

    describe("LocalCollection <: Collection", function() {
        it("Is constructed directly from a dictionary of models and other options", function() {
            var c = ss.LocalCollection({
                name: 'fooey'
            });

            expect(c.name).to.equal('fooey');
        });
    });
});
