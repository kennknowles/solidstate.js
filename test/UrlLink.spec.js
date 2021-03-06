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

    describe("UrlLink :: {from: String} -> (Link -> Link)", function() {
        /* This is now private 
        it("Is a link from an attribute containing a Url to all related items in the other collection", function() {
            var src = ss.LocalCollection({
                models: {
                    a: ss.LocalModel({ attributes: { x: '/resource/1' } }),
                    b: ss.LocalModel({ attributes: { x: '/resource/47' } }),
                    c: ss.LocalModel({ attributes: { x: null } }),
                    d: ss.LocalModel({ attributes: { x: '/resource/1' } }),
                    e: ss.LocalModel()
                }
            });

            var dst = ss.LocalCollection();
            
            var link = ss.LinkToCollection(dst);
            var urlLink = ss.UrlLink({ from: 'x', })(link);

            var filteredDst = urlLink.resolve(src);
            expect(filteredDst.data()).to.deep.equal({ id__in: ['1', '47'], limit: 0 });
        });
        */
    });
});
