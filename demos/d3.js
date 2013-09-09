var solver = new Solver;

var models = [];


// http://office.microsoft.com/en-us/excel-help/using-solver-to-schedule-your-workforce-HA001124598.aspx

models.push({
    optimize: "employees",
    opType: "min",
    constraints: {
        amon: {min: 17},
        atue: {min: 13},        
        awed: {min: 15},
        athu: {min: 17},
        afri: {min: 9},
        asat: {min: 9},
        asun: {min: 12},        
    },
    variables: {
        mon:{},
        tue: {},
        wed: {},
        thu: {},
        fri: {},
        sat: {},
        sun: {}
    }
})




    for(x in models){
        console.log(solver.Solve(models[x]));
        console.log("");
    }


