if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'backbone', 
    'underscore',
    'URIjs',
    'when',
    './Model'
], function(Backbone, _, URI, when, Model) {
    'use strict';
    
    ///// RemoteModel
    //
    // A model that is fetched from the provided URI

    var RemoteModel = function(args) {
        if (!(this instanceof RemoteModel)) return new RemoteModel(args);

        var self = this;
        
        self.uri = args.uri;
        self.name = args.name;
        self.debug = args.debug || false;
        self.relationships = args.relationships || {};

        self.attributes = args.attributes || {};
        self.errors = args.errors || {};

        // Dependency Injection
        var BB = args.Backbone || Backbone;
        var BBModelClass = BB.Model.extend({ url: self.uri });

        var fetchWithSelf = function(self, options) {
            if (self.debug) console.log( (options && options.name) || self.name, '-->');
            var doneFetching = when.defer();
            var bbModel = new BBModelClass();

            bbModel.fetch({ 
                success: function(model, response, options) { 
                    doneFetching.resolve(Model(self).withFields({
                        attributes: model.attributes
                    }))
                },
                error: function(model, xhr, options) {
                    doneFetching.reject(); // TODO: errors
                }
            });

            return doneFetching.promise;
        };

        var saveWithSelf = function(self, attributes, options) {
            if (self.debug) console.log( (options && options.name) || self.name, '==>', attributes);
            var doneSaving = when.defer();
            
            var bbModel = new BBModelClass(attributes);

            bbModel.save({}, { 
                success: function(model, response, options) {
                    // Errors?
                    doneSaving.resolve(self); 
                },

                error: function(model, xhr, options) { 
                    var err = JSON.parse(xhr.responseText);
                    doneSaving.reject(adjustTastypieError(err));
                }
            });

            return doneSaving.promise;
        };
        
        self.fetch = function(options) { return fetchWithSelf(self, options); }

        self.save = function(attributes, options) { return saveWithSelf(self, attributes, options); }
        
        return Model(self);
    };

    return RemoteModel;
});
