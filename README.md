SolidState.js
=============

A high-level, fluent, state-machine-based, automatic dependency-driven REST client library for Javascript.

Quick Intro
-----------

This module builds upon Backbone and Knockout, providing an even more convenient
interface for accessing your backend API. 

 - `Model`: A single resource with observable `state` and `attributes`.
 - `Collection`: Multiple `Model`s stored _by URL_, with an overall observable `state`
 - `Relationship`: Describes how to move from one `Collection` to another.
 - `Api`: Multiple `Collection`s stored _by name_ with relationships built in.

What you will not find elsewhere:

 - Fluent interfaces, such as `RemoteCollection({ url: url }).withData({age: 45}).withRelatedSubresources('friends')`
 - Observable state machines for all classes, so displaying spinners, etc, is trivial.
 - The `Api` class that discovers all your collections _automatically_ from your backend root endpoint (current only Tastypie)


Interface in pseudo-types
-------------------------

This summarizes the module pretty concisely. I write `*` to mean "anything".

These are the important interfaces.

```javascript
URL = String

Model = {
  state       : observable ( "initial" | "ready" | "fetching" | "saving")
  attributes  : observable { String: observable * }
  fetch       : () -> Model // self
  save        : () -> Model // self

  withAttributes          : ( observable { String: observable } ) -> Model
  withSubresourcesFrom    : {String: Collection | {URL: *}} -> Model
}


Collection = {
  state   : observable ( "initial" | "ready" | "fetching" | "saving")
  models  : observable {URL : Model}
  fetch   : () -> Collection // self
  save    : () -> Collection // self

  withSubresourcesFrom    : {String: Collection | {URL: *}} -> Model
  withRelatedSubresources : (String, ...) -> Model
}

Relationship = {
  relatedCollection : (Collection, Collection) -> Collection // relatedCollection(from, to) adds the right filters
}

Api = {
  state       : observable ("initial" | "fetching" | "ready")
  collections : observable {String: Collection}
  fetch       : () -> undefined

  relatedCollection :: (String, String, Collection) -> Collection  // Keyed on source name, attribute name, and taking particular src collection too
}
```

And these are the implementations provided. You are free to add your own; just
pass it like `new Collection(implementation)` to add the fluent interface.

```javascript
RemoteModel      : { url : String } -> Model
RemoteCollection : { url : String, relationships : ... } -> Collection
RemoteApi        : { url : String, relationships : ... } -> Api

JoinRelationship : { 
  type               : "toOne" | "toMany" | "fromOne" | "fromMany",
  sourceKey          : String | ({String: observable *} -> String), // Either an attribute or a way to extract the transformed attribute
  sourceKeyTransform : ("uri" | undefined | (String -> String)),    // either "uri" 
  destFilter         : String,
} -> Relationship

ToOneUrl      : String -> Relationship // JoinRelationship that directly dereferences a URL attribute
ToManyUrls    : String -> Relationship // JoinRelationship that directly derferences an array of URL attributes
FromManyByUrl : String -> Relationship // JoinRelationship that filters the destination collection by the URL of the current

idFromUri : String -> {String: observable *} -> String
```


Copyright & License
-------------------

Copyright 2012 Kenneth Knowles

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed
under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License.
