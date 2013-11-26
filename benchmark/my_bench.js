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
    
    var model = {
    optimize: "usage",
    opType: "max",
    constraints: {
            cost: {max: 120000},
            land: {max: 12},
            pool: {max: 1},
            tennis: {max: 1},
            field: {max: 1},
            gym: {max: 1}
    },
    variables: {
        pool: {land: 4, cost: 35000, usage: 300},
        tennis: {land: 2, cost: 10000, usage: 90},
        field: {land: 7, cost: 25000, usage: 400},
        gym: {land: 3, cost: 90000, usage: 150}
    },
    ints: {
        pool: 1, tennis: 1, field: 1, gym: 1
    }
}

    console.log("Beginning");


    
    
// add tests
suite.add("Primary Solver Function", function(){
    solver.MILP(model, 3);
})
.add('Rounding#_helpers', function() {
    solver._helpers.round(123456.123456789583757682375682357234723468347,3)
})
// Test _helpers "MAX" method
.add('max#_helpers', function(){
    solver._helpers.max(ary);
})
// Test Home Brew
.add('max#home_brew', function(){


})
// add listeners
.on('cycle', function(event) {
  console.log(String(event.target));
})

// run async
.run({ 'async': true });