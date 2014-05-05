var Benchmark = require("benchmark")
    ,suite = new Benchmark.Suite
    ,solver = require("../src/solver.js")
    ,solver = new solver()
    ;

   
    var ary = [];
    console.log("Loading...");
    for(i = 0; i < 10000; i++){
        ary.push(Math.random());
    }
    
    console.log("Beginning");


maxs = function(a,b,c,d){return Math.max(a,b)}    
    
// add tests
suite.add('Rounding#_helpers', function() {
    solver._helpers.round(123456.123456789583757682375682357234723468347,3)
})
// Test Home Brew
.add('max#from_class', function(){
    solver._helpers.max(ary);
})
.add('max#home_brew', function(){
    ary.reduce(maxs); 
})
.add('sort speed', function(){
    ary.sort();
})
// add listeners
.on('cycle', function(event) {
  console.log(String(event.target));
})

// run async
.run({ 'async': true });
