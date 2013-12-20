if (typeof define !== 'function') { var define = require('amdefine')(module); }
define([ 
    'knockout',
    'underscore',
    'URIjs',
    'when',
    '../State',
    './LocalModel',
    'require',
    './Model'
], function(ko, _, URI, when, State, LocalModel, require, Model) {
    'use strict';

    var o = ko.observable,
        u = ko.utils.unwrapObservable,
        c = ko.computed,
        w = function(v) { return ko.isObservable(v) ? v : o(v); };

    ///// NewModel
    //
    // A Model that has not been saved yet. It takes as parameters the attributes
    // for a local model and a function to create the new model. The model behaves
    // exactly as a LocalModel until the `create` succeeds, after which it behaves
    // as the returned Model (which will generally be a RemoteModel in practice).
    //
    // Current has a permanent (tiny) proxy overhead

    var NewModel = function(args) {
        // TODO: break this crap cycle
        var Model = require('./Model');

        var self = {};

        self.name = args.name || '(anonymous NewModel)';

        self.create = args.create || die('Missing required arg `create` for `NewModel`');

        self.relationships = args.relationships || {};

        // This state marches from initial -> saving -> ready
        var initializationState = State('initial');

        // Use an initial local model until first save, when we pass the gathered data on
        var initialModel = LocalModel({
            name: self.name,
            debug: args.debug,
            attributes: args.attributes,
        });

        var errors = o({});

        // This changes one before initializationState, so the internal bits that depend on it fire before the
        // external world gets a state change (depending on attributes() before checking state() means client is out of luck!)
        var createdModel = o(null);

        self.state = State(c(function() { 
            // Seems to be a bug where initializationState is 'ready' when the createdModel is not yet
            return ((initializationState() === 'ready') && createdModel()) ? createdModel().state() : initializationState(); 
        }));

        self.stateExplanation = c(function() {
            if ((initializationState() !== 'ready') || !createdModel())
                return 'NewModel ' + self.name + ' not yet successfully initialized; ' + initialModel.stateExplanation();
            else
                return 'NewModel ' + self.name + ' initialized; ' + createdModel().stateExplanation();
        });
        
        self.errors = c(function() { return createdModel() ? createdModel().errors() : errors(); });
       
        self.attributes = c({
            read: function() { return createdModel() ? createdModel().attributes() : initialModel.attributes(); },
            write: function(attrs) { return createdModel() ? createdModel().attributes(attrs) : initialModel.attributes(attrs); }
        });
        
        self.fetch = function(options) { 
            if (createdModel()) {
                createdModel().fetch(options); 
                return Model(self);
            } else {
                initialModel.fetch(options);
                return Model(self);
            }
        };

        self.save = function(options) { 
            if (createdModel() && (initializationState() === 'ready')) {
                return createdModel().save(options).then(function() {
                    return when.resolve(Model(self));
                })
                
            } else if (initializationState() === 'initial') {

                initializationState('saving');

                return self
                    .create({
                        attributes: initialModel.attributes(),
                        debug: initialModel.debug,
                        name: self.name
                    })
                    .otherwise(function(creationErrors) {
                        errors(creationErrors);
                        initializationState('initial');
                        return when.reject(creationErrors);
                    })
                    .then(function(actuallyCreatedModel) {
                        createdModel(actuallyCreatedModel);
                        errors({});
                        initializationState('ready');
                        return when.resolve(Model(self));
                    })
            } 
        };
        
        return Model(self);
    };

    return NewModel;
});
