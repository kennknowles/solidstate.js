if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'when',
    './Model'
], function(when, Model) {
    'use strict';
    
    ///// LocalModel
    // 
    // A model that exists only in memory

    var LocalModel = function(args) {
        if (!(this instanceof LocalModel)) return new LocalModel(args);
        var self = this;
        args = args || {};
            
        self.uri = args.uri || ('fake:' + Math.random(1000).toString());
        self.name = args.name || "(anonymous zoetropic.LocalModel)";
        self.debug = args.debug || false;
        self.attributes = args.attributes || {};
        self.errors = args.errors || {};

        self.relationships = args.relationships || {};

        self.fetch = function(options) { return when.resolve(Model(self)); };

        self.save = function(attributes, options) { 
            var newAttributes = attributes || {};
            return when.resolve(Model(self).withFields({ attributes: newAttributes })); 
        };

        Object.freeze(self);

        return Model(self);
    };

    return LocalModel;
});
