require([ 
    "jquery", 
    "jasmine", 
    "jasmine-html", 
    "spec.js" ], 
function($, jasmine) {
    $(document).ready(function() {
        jasmine.getEnv().addReporter( new jasmine.HtmlReporter() );
        jasmine.getEnv().execute();
    });
});
