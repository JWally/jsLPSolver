var solver = new Solver;

var models = [],
    milps = [];


// Word Problem Source: http://www.algebra.com/algebra/homework/coordinate/word/THEO-2012-01-26.lesson

//Problem 2
models.push({
    optimize: "profit",
    opType: "max",
    constraints: {
        "Costa Rican" : {max: 200},
        "Etheopian": {max: 330}
    },
    variables: {
        "Yusip": {"Costa Rican" : 0.5, "Etheopian": 0.5, profit: 3.5},
        "Exotic": {"Costa Rican" : 0.25, "Etheopian": 0.75, profit: 4}
    }
})


//Problem 3
models.push({
    optimize: "profit",
    opType: "max",
    constraints: {
        cost: {max: 70000},
        size: {max: 1000}
    },
    variables: {
        computer: {size: 12, cost: 1000, profit: 1000},
        printer: {size: 8, cost: 300, profit: 350}
    }
})

//Problem 4a
models.push({
    optimize: "profit",
    opType: "max",
    constraints: {
        size : {max: 2400},
        units: {min: 50}
    },
    variables: {
        large: {size: 60, units: 1, profit: 250},
        small: {size: 40, units: 1, profit: 150}
    }
})

//Problem 4b
models.push({
    optimize: "profit",
    opType: "max",
    constraints: {
        size : {max: 2400},
        units: {min: 40}
    },
    variables: {
        large: {size: 60, units: 1, profit: 250},
        small: {size: 40, units: 1, profit: 150}
    }
})


//Problem 5
models.push({
    optimize: "cost",
    opType: "min",
    constraints: {
        "semisweet": {min: 30000},
        "milk chocolate": {min: 60000}
    },
    variables: {
        Kansas: {"semisweet": 3000, "milk chocolate": 2000, cost: 1000},
        Oklahoma: {"semisweet": 1000, "milk chocolate": 6000, cost: 1500}
    }
})

//Ops Research Problem
models.push({
    optimize: "profit",
    opType: "max",
    constraints: {
        wood: {max: 300},
        labor: {max: 110}
    },
    variables: {
        "table" : {wood: 30, labor: 5, profit: 6},
        "chair" : {wood: 20, labor: 10, profit: 8}
    }
})

//Ops Research Problem 2a
models.push({
    optimize: "profit",
    opType: "max",
    constraints: {
        wood: {max: 300},
        labor: {max: 110}
    },
    variables: {
        "table" : {wood: 30, labor: 5, profit: 6},
        "chair" : {wood: 20, labor: 10, profit: 8}
    }
})



//Ops Research Problem
milps.push({
    optimize: "profit",
    opType: "max",
    constraints: {
        wood: {max: 300},
        labor: {max: 110},
        chair: {max: 8}
    },
    variables: {
        "table" : {wood: 30, labor: 5, profit: 6},
        "chair" : {wood: 20, labor: 10, profit: 8}
    },
    ints: {table: 1, chair: 1}
})

//Berlin Air Lift Problem
models.push({
  optimize : "capacity"
  ,opType : "max"
  ,constraints : {
    plane: {max: 44}
    ,person: {max: 512}
    ,cost: {max: 300}
    ,yank: {max: 0, min: 0}
  }
  ,variables : {
    "brit" : {capacity: 20000, plane: 1, person: 8, cost: 5, yank: -2}
    ,"yank" : {capacity: 30000, plane: 1, person: 16, cost: 9, brit: -1}
 }
 //,ints: {brit: 1, yank:1}
})


milps.push({
    optimize: "profit",
    opType: "max",
    constraints: {
        space: {max: 205},
        price: {max: 40000}        
    },
    variables: {
                press: {space: 15, price: 8000, profit: 100},
                lathe: {space: 30, price: 4000, profit: 150},
                drill: {space: 14, price: 4500, profit: 80}
            },
    ints: {
        press: 1 ,lathe: 1 ,drill: 1
    }
});


milps.push({
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
})

//Problem 5
milps.push({
    optimize: "cost",
    opType: "min",
    constraints: {
        "semisweet": {min: 30000},
        "milk chocolate": {min: 60000}
    },
    variables: {
        Kansas: {"semisweet": 3000, "milk chocolate": 2000, cost: 1000},
        Oklahoma: {"semisweet": 1000, "milk chocolate": 6000, cost: 1500}
    },
    ints: {Kansas: 1, Oklahoma: 1}
});

//Problem 6
milps.push({
    optimize: "profit",
    opType: "max",
    constraints: {
        yards: {max: 150},
        hours: {max: 200}
    },
    variables: {
        coat: {hours: 10, yards: 3, profit: 50},
        pants: {hours: 4, yards: 5, profit: 40}
    },
    ints: {
        coat: 1, pants: 1
    }
})

milps.push({
    optimize: "profit",
    opType: "max",
    constraints: {
        yards: {max: 150},
        hours: {max: 200}
    },
    variables: {
        coat: {hours: 10, yards: 3, profit: 50},
        pants: {hours: 4, yards: 5, profit: 40},
        hat: {hours: 12, yards: 1, profit: 10},
        socks: {hours: 0.5, yards: 0.5, profit: 0.50}
    },
    ints: {
        coat: 1, pants: 1, hat: 1, socks: 1
    }
})


    for(x in models){
        console.log(solver.Solve(models[x]));
        console.log("");
    }

    for(x in milps){
        console.log(solver.MILP(milps[x]));
        console.log("");
    }
