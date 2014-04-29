Zoetropic.js
=============

[![Build status](https://travis-ci.org/kennknowles/zoetropic.js.png)](https://travis-ci.org/kennknowles/zoetropic.js)
[![Test coverage](https://coveralls.io/repos/kennknowles/zoetropic.js/badge.png?branch=master)](https://coveralls.io/r/kennknowles/zoetropic.js)
[![NPM version](https://badge.fury.io/js/zoetropic.png)](http://badge.fury.io/js/zoetropic)
[![Dependencies badge](https://gemnasium.com/kennknowles/zoetropic.js.png)](https://gemnasium.com/kennknowles/zoetropic.js)

https://github.com/kennknowles/zoetropic.js

A futuristic Javascript library for interacting with REST APIs.

Quick Intro
-----------

Zoetropic interacts with REST APIs in a value-oriented way using _promises_ (close cousins of _futures_).

Zoetropic features the following core concepts:

 - `Model`: A single resource such as you might find at a url http://api.example.com/users/45
 - `Collection`: A compound resource, generally with filtering, such as might be found at http://api.example.com/users/
 - `Relationship`: Describes how to move from one `Collection` to another.
 - `Api`: A root of the API that stores the `Collection`s by name, such as might be found at http://api.example.com/

For advanced use, it also has two new concepts to aid in relationship management:

 - `Link`: A link from one collection to another. Analogous to a simple hyperlink, but for sets of URLs.
 - `Reference`: A reference from one object to one or many objects in another collections. This is complementary to `Link`.


Terse Interface
---------------

The interface of zoetropic in a nutshell:

```javascript
URL = String

Attributes = {String: *}

Relationships = String -> Relationship | undefined

Model = {

  // Core Fields
  // -----------

  uri           : URL
  attributes    : { String: * }
  errors        : { String: String } // Errors collected by attribute

  fetch         : ()         -> Promise Model 
  save          : Attributes -> Promise Model
  relationships : Relationships

  // Combinators
  // -----------

  withFields : {...} -> Model   // Override any of the above fields

  overlayRelationships : Relationships                     -> Model
  overlayAttributes    : Attributes                        -> Model
  overlayRelated       : ([String] | {String: Collection}) -> Model

  relatedCollection : String -> Collection
  relatedModel      : String -> Model
}


Collection = {

  // Core Fields
  // -----------

  uri           : URL
  data          : {...}  // "data" can be anything, but is intended for querystring parameters; passed to fetch
  models        : {URL : Model}

  fetch         : {...}      -> Promise Collection
  create        : Attributes -> Promise Model
  relationships : Relationships

  // Combinators
  // -----------

  withFields : {...} -> Model   // Override any of the above fields

  overlayData          : {...}                             -> Collection
  overlayRelationships : Relationships                     -> Collection
  overlayRelated       : ([String] | {String: Collection}) -> Collection

  relatedCollection    : String -> Collection
}

Link = { resolve: Collection -> Collection } // How do we go from one collection to another? (it might overapproximate due to REST interface limitations)

Relationship = {
  link  : Link
  deref : Collection -> [Model] | Model  // Once we have the other collection fetched, how do we actually get the related models out?
}


Api = {
  
  // Core Fields
  // -----------

  uri         : URL
  collections : {String: Collection}

  fetch       : () -> Promise Api
}
```

Implementations
---------------

The most important implementations are `RemoteModel`, `RemoteCollection`, and `RemoteApi`, which form a REST API client.

 - `RemoteApi` represents your `/api/`. It understands Django Tastypie schemas and can generate all of your collections simply by calling `fetch`.
 - `RemoteCollection` represents a list endpoint like `/api/book/`. It has additional methods `withData` and `withParam` for adjusting the HTTP requests.
 - `RemoteModel` represents a particular resource like `/api/book/25`.

In addition, there are `Local*` implementations of each, which are handy for testing with minimal mocking.

 - `LocalModel` where `fetch` and `save` each do their work in-memory.
 - `LocalCollection` which just contains the models you give it.
 - `LocalApi` which just contains the collections you give it.


Caveats (Special Features?)
---------------------------

 - Though used in large projects, Zoetropic.js is still new. It might be a bit crufty!
 - The module system is assumed to be AMD or Node. Pull requests welcome for other adapters.
 - There is a certain amount of direct support for Django Tastypie. This is a "feature" but means that it may be less helpful for other backends, without some customization. Again, pull requests welcome.


Copyright & License
-------------------

Copyright 2013 Kenneth Knowles

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed
under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License.
