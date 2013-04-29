/* jshint -W070 */
if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([
    // Keep alphabetical for easy cross-checking with directory listing
    './Api.spec',
    './Attributes.spec',
    './BBWriteThroughObservable.spec',
    './Collection.spec',
    './Collections.spec',
    './FilterLink.spec',
    './LocalApi.spec',
    './LocalCollection.spec',
    './LocalModel.spec',
    './Model.spec',
    './Models.spec',
    './NewModel.spec',
    './RemoteModel.spec',
    './RemoteCollectionBackend.spec',
    './ToManyReference.spec',
    './ToOneReference.spec',
    './UrlLink.spec',
], function() {
    // noop, just aggregating the specs
});
