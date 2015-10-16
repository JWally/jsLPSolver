module.exports = function(grunt){
    grunt.initConfig({
        "pkg": "package.json",
        "jshint": {
            "files": ["src/**/*.js","test/**/*.js","!src/solver.js"],
            "options": {
                "curly": true,
                "eqeqeq": true,
                "latedef": true,
                "indent": 4,
                "noempty": true,
                "quotmark": "double",
                "undef": true
            }
        },
        "mochaTest": {
            "test": {
                "options": {
                    "reporter": "json",
                    "quite": "true",
                    "captureFile": "test_results.txt"
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
        }
    });
    
    grunt.loadNpmTasks("grunt-contrib-uglify");
    grunt.loadNpmTasks("grunt-contrib-jshint");
    grunt.loadNpmTasks("grunt-mocha-test");
    grunt.loadNpmTasks("grunt-browserify");
    grunt.registerTask("default", ["jshint"]);
    grunt.registerTask("test", ["jshint","mochaTest"]);
    grunt.registerTask("speed", function(){require("./benchmark/bench.test_suite");});
    grunt.registerTask("prod", ["jshint","mochaTest","browserify"]);
    
}
