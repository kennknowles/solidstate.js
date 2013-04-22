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

    describe("FilterLink :: {attr: filter, ...} -> (Link -> Link)", function() {
        it("adds querystring filters to the target of a link", function() {
            var src = ss.LocalCollection({
                models: {
                    a: { x: 1 },
                    b: { x: 2 },
                    c: { x: null },
                    d: { x: 2 },
                    e: {}
                }
            });
            
            var withDataSpy = sinon.spy();
            var dst = new ss.Collection({ models: o({}), withData: withDataSpy });
            var link = ss.LinkToCollection(dst);

            var filteredLink = ss.FilterLink({ my_filter: function(model) { return model.x; } })(link);

            var filteredDst = filteredLink.resolve(src);
            var dataObservable = withDataSpy.args[0][0];
            expect(dataObservable()).to.deep.equal({ my_filter: [1, 2], limit: 0 });
        });
    });
});
