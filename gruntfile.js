module.exports = function(grunt){
    grunt.initConfig({
        "pkg": "package.json",
        "jshint": {
            "files": ["src/**/*.js","test/**/*.js"],
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
                    "reporter": "json"
                },
                "src": ["test/**/*.js"]
            }
        },
        "jsbeautifier" : {
            "default": {
                src: ["src/**/*.js", "test/**/*.js", "src/**/*.html","*/**.json"]
            },
            "options": {
                "html": {
                    "brace_style": "collapse",
                    "indent_char": " ",
                    "indent_scripts": "keep",
                    "indent_size": 4,
                    "max_preserve_newlines": 10,
                    "preserve_newlines": true,
                    "unformatted": ["a", "sub", "sup", "b", "i", "u"],
                    "wrap_line_length": 0
                },
                "js": {
                    "brace_style": "collapse",
                    "break_chained_methods": false,
                    "e4x": false,
                    "eval_code": false,
                    "indent_char": " ",
                    "indent_level": 0,
                    "indent_size": 4,
                    "indent_with_tabs": false,
                    "jslint_happy": true,
                    "keep_array_indentation": false,
                    "keep_function_indentation": false,
                    "max_preserve_newlines": 10,
                    "preserve_newlines": true,
                    "space_before_conditional": true,
                    "space_in_paren": false,
                    "unescape_strings": false,
                    "wrap_line_length": 80                    
                }
            }
        }       
    });
    
    grunt.loadNpmTasks("grunt-contrib-uglify");
    grunt.loadNpmTasks("grunt-jsbeautifier");
    grunt.loadNpmTasks("grunt-contrib-jshint");
    grunt.loadNpmTasks("grunt-mocha-test");
    grunt.registerTask("default", ["jsbeautifier:default", "jshint"]);
    grunt.registerTask("test", ["jsbeautifier:default", "jshint","mochaTest"]);
    grunt.registerTask("speed", function(){require("./benchmark/solver.play");});
}
