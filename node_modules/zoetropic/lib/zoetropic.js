if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([
    './zoetropic/model/Model',
    './zoetropic/model/LocalModel',
    './zoetropic/model/RemoteModel',

    './zoetropic/collection/Collection',
    './zoetropic/collection/LocalCollection',
    './zoetropic/collection/RemoteCollection',

    './zoetropic/api/Api',
    './zoetropic/api/LocalApi',
    './zoetropic/api/RemoteApi',

    './zoetropic/link/Link',
    './zoetropic/link/LinkToCollection',
    './zoetropic/link/FilterLink',
    './zoetropic/link/FromOneFilterLink',
    './zoetropic/link/UrlLink',

    './zoetropic/reference/Reference',
    './zoetropic/reference/ToOneReference',
    './zoetropic/reference/ToManyReference',
    './zoetropic/reference/FilterReference',
    './zoetropic/reference/JoinReference',

    './zoetropic/misc'

], function(
    Model,
    LocalModel,
    RemoteModel,

    Collection,
    LocalCollection,
    RemoteCollection,

    Api,
    LocalApi,
    RemoteApi,

    Link,
    LinkToCollection,
    FilterLink,
    FromOneFilterLink,
    UrlLink,

    Reference,
    ToOneReference,
    ToManyReference,
    FilterReference,
    JoinReference,

    misc
) {
    'use strict';

    return {
        // Interfaces
        Model: Model,
        Collection: Collection,
        Link: Link,
        Reference: Reference,
        Api: Api,

        // Models
        LocalModel: LocalModel,
        RemoteModel: RemoteModel,

        // Collections
        LocalCollection: LocalCollection,
        RemoteCollection: RemoteCollection,

        // Links
        LinkToCollection: LinkToCollection,
        FilterLink: FilterLink,
        FromOneFilterLink: FromOneFilterLink,
        UrlLink: UrlLink,

        // References
        ToOneReference: ToOneReference,
        ToManyReference: ToManyReference,
        FilterReference: FilterReference,
        JoinReference: JoinReference,

        // Apis
        RemoteApi: RemoteApi,
        LocalApi: LocalApi,

        // Misc, probably "private"
        NOFETCH: misc.NOFETCH
    };
});
