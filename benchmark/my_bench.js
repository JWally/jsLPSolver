var Benchmark = require("benchmark")
    ,suite = new Benchmark.Suite
    ,solver = require("../src/solver.js")
    ,solver = new solver()
    ;

    var max = function(ary){
        var i, 
            tmp = -1e99,
            len = ary.length;
            
        for(i=0; i < len; i++){
            if(ary[i] > tmp){
                tmp = ary[i];
            }
        }
        return tmp;
    }
    
    
    var ary = [];
    console.log("Loading...");
    for(i = 0; i < 10000; i++){
        ary.push(Math.random());
    }
    console.log("Beginning");

// add tests
suite.add('Rounding#_helpers', function() {
    solver._helpers.round(123456.123456789583757682375682357234723468347,3)
})
// Test _helpers "MAX" method
.add('max#_helpers', function(){
    solver._helpers.max(ary);
})
// Test Home Brew
.add('max#home_brew', function(){
    max(ary);
})
// add listeners
.on('cycle', function(event) {
  console.log(String(event.target));
})

// run async
.run({ 'async': true });