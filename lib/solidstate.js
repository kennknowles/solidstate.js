if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([
    './solidstate/api/Api',
    './solidstate/api/LocalApi',
    './solidstate/api/RemoteApi',

    './solidstate/model/Model',
    './solidstate/model/LocalModel',
    './solidstate/model/RemoteModel',
    './solidstate/model/NewModel',

    './solidstate/collection/Collection',
    './solidstate/collection/LocalCollection',
    './solidstate/collection/RemoteCollection',
    './solidstate/collection/CollectionForZoetrope',

    './solidstate/link/Link',
    './solidstate/link/UrlLink',
    './solidstate/link/FilterLink',
    './solidstate/link/LinkToCollection',
    './solidstate/link/FromOneFilterLink',

    './solidstate/reference/Reference',
    './solidstate/reference/ToOneReference',
    './solidstate/reference/ToManyReference',
    './solidstate/reference/JoinReference',
    './solidstate/reference/FilterReference',

    './solidstate/Relationship',
    './solidstate/State',
    './solidstate/Collections',
    './solidstate/Models',
    './solidstate/Attributes',

    './solidstate/misc'

], function(
    Api,
    LocalApi,
    RemoteApi,

    Model,
    LocalModel,
    RemoteModel,
    NewModel,

    Collection,
    LocalCollection,
    RemoteCollection,
    CollectionForZoetrope,

    Link,
    UrlLink,
    FilterLink,
    LinkToCollection,
    FromOneFilterLink,

    Reference,
    ToOneReference,
    ToManyReference,
    JoinReference,
    FilterReference,

    Relationship,
    State,
    Collections,
    Models,
    Attributes,

    misc
) {
    'use strict';
    
    // Module Exports
    // --------------

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
        NewModel: NewModel,

        // Collections
        CollectionForZoetrope: CollectionForZoetrope,
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

        // Helpers
        Attributes: Attributes,
        Models: Models,
        Collections: Collections,
        State: State,

        // Misc
        NOFETCH: misc.NOFETCH
    };
});
