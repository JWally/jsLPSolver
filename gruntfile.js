// --------------------------------
// PLEASE TRY RUNNING EVERYTHING THROUGH
// HERE, NO?
//
// 1.) TO TEST: grunt test-sanity
// 2.) TO TEST SPEED: grunt test-speed
// 3.) TO TEST AD-HOC / WIP: grunt test-wip
// 3.) TO BUILD EVERYTHING: grunt prod
//
// kthxbye!
//

module.exports = function(grunt){
    grunt.initConfig({
        "pkg": "package.json",
        "jshint": {
            "files": ["src/**/*.js","test/**/*.js","!src/solver.js","!test/misc/*.*","!test/test-wip/*.*"],
            "options": {
                "curly": true,
                "eqeqeq": true,
                "latedef": true,
                "indent": 4,
                "noempty": true,
                "quotmark": "double",
                "undef": true,
                "globals": {"define": true, "window" :true}
            }
        },
        "mochaTest": {
            "test": {
                "options": {
                    "reporter": "spec",
                    "quite": "false"
                },
                "src": ["test/solver.problems.js"]
            }
        },
        "browserify": {
            "dist": {
                "files": {
                    "src/solver.js": ["./src/main.js"]
                },
                "options": {
                    "banner": "(function(){if (typeof exports === \"object\") {module.exports =  require(\"./main\");}})();"
                }
            }
        },
        "uglify": {
            "prod": {
                "options": {
                    "sourceMap": true,
                },
                "files": {
                    "prod/solver.js": [
                        "src/solver.js"
                    ]
                }
            }
        }
    });

    grunt.loadNpmTasks("grunt-contrib-uglify");
    grunt.loadNpmTasks("grunt-contrib-jshint");
    grunt.loadNpmTasks("grunt-mocha-test");
    grunt.loadNpmTasks("grunt-browserify");
    grunt.registerTask("default", ["jshint"]);
    
    // The args can be picked up off of process.argv[2] in
    // the file Mocha is hitting...
    //
    grunt.registerTask("test-sanity", ["jshint","mochaTest"]);
    grunt.registerTask("test-speed", ["jshint","mochaTest"]);
    grunt.registerTask("test-wip", ["jshint","mochaTest"]);
    
    grunt.registerTask("prod", ["jshint","browserify", "uglify"]);

}
