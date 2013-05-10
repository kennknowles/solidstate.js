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

        /* This is now private to the collection
        it("adds querystring filters to the target of a link", function() {
            var src = ss.LocalCollection({
                models: {
                    a: ss.LocalModel({ attributes: { x: 1 } }),
                    b: ss.LocalModel({ attributes: { x: 2 } }),
                    c: ss.LocalModel({ attributes: { x: null } }),
                    d: ss.LocalModel({ attributes: { x: 2 } }),
                    e: ss.LocalModel({ attributes: { x: undefined } })
                }
            });
            
            var withDataSpy = sinon.spy();
            var dst = ss.LocalCollection();
            var link = ss.LinkToCollection(dst);

            var filteredLink = ss.FilterLink({ my_filter: function(model) { return model.attributes().x(); } })(link);

            var filteredDst = filteredLink.resolve(src);

            expect(filteredDst.data().limit).to.equal(0);
            expect(filteredDst.data().my_filter.sort()).to.deep.equal([1, 2]);
        });
        */
    });
});
