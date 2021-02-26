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
const path = require('path');
const WrapperPlugin = require('wrapper-webpack-plugin');


module.exports = function (grunt) {
    grunt.initConfig({
        pkg: "package.json",
        eslint: {
            target: ["src/**/*.js", "test/**/*.js", "!src/solver.js", "!test/misc/*.*", "!test/test-wip/*.*"],
        },
        mochaTest: {
            test: {
                options: {
                },
                src: ["test/solver.problems.js"]
            }
        },
        babel: {
            prod: {
                targets: {
                    es6modules: false
                },
                files: {
                    "prod/solver.js": [
                        "src/solver.js",
                    ]
                },
                options: {
                    sourceMap: true,
                    presets: [
                        "@babel/preset-env"
                    ],
                    "compact": true,
                    "minified": true
                }
            }
        },
        webpack: {
            prod: {
                mode: "production",
                entry: './src/main.js',
                output: {
                    path: path.resolve(__dirname, 'src'),
                    filename: 'solver.js',
                    library: "solver",
                },
                module: {
                    rules: [
                        {
                            test: /\.js$/,
                            include: path.resolve(__dirname, 'src'),
                            loader: 'babel-loader',
                            query: {
                                sourceMap: true,
                                presets: [
                                    "@babel/preset-env"
                                ]
                            }
                        }
                    ]
                },
                plugins: [
                    new WrapperPlugin({
                        test: /\.js$/,
                        footer: '\n(function(){if (typeof exports === "object") {module.exports =  solver.default;}})();\n'
                    })
                ]
            }
        },
    });

    grunt.loadNpmTasks("grunt-babel");
    grunt.loadNpmTasks("grunt-webpack");
    grunt.loadNpmTasks("grunt-eslint");
    grunt.loadNpmTasks("grunt-mocha-test");
    grunt.registerTask("default", ["eslint"]);

    // The args can be picked up off of process.argv[2] in
    // the file Mocha is hitting...
    //
    grunt.registerTask("test-sanity", ["eslint", "webpack", "babel", "mochaTest"]);
    grunt.registerTask("test-speed", ["eslint", "webpack", "babel", "mochaTest"]);
    grunt.registerTask("test-wip", ["eslint", "webpack", "babel", "mochaTest"]);
    grunt.registerTask("prod", ["eslint", "webpack", "babel"]);

}
