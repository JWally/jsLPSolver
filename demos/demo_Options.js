//Problem 7
var model = {
    opType: "max",
    optimize: "SP0",
    constraints: {
        SP0: {min: 0},
        SP560: {min: 0}
        ,SP585: {min: 0}
        ,SP610: {min: 0}
        ,SP1000: {min: 0}
        ,it: {max: 1, min: 1}
    },
    variables: {
        Buy_Call_580: {SP0: -1500, SP560: -1500, SP585: -1000, SP610: 1500, SP1000: 40500, it: 1}
        ,Buy_Call_585: {SP0: -1130, SP560: -1130, SP585: -1130, SP610: 1370, SP1000: 40370, it: 1}
        ,Buy_Call_590: {SP0: -1020, SP560: -1020, SP585: -1020, SP610: 980, SP1000: 39980, it: 1}
        ,Sell_Call_580: {SP0: 1500, SP560: 1500, SP585: 1000, SP610: -1500, SP1000: -40500, it: 1}
        ,Sell_Call_585: {SP0: 1130, SP560: 1130, SP585: 1130, SP610: -1370, SP1000: -40370, it: 1}
        ,Sell_Call_590: {SP0: 1020, SP560: 1020, SP585: 1020, SP610: -980, SP1000: -39980, it: 1}
        ,Buy_Put_580: {SP0: 56920, SP560: 920, SP585: -1080, SP610: -1080, SP1000: -1080, it: 1}
        ,Buy_Put_585: {SP0: 57200, SP560: 1200, SP585: -1300, SP610: -1300, SP1000: -1300, it: 1}
        ,Buy_Put_590: {SP0: 57450, SP560: 1450, SP585: -1050, SP610: -1550, SP1000: -1550, it: 1}
        ,Sell_Put_580: {SP0: -56920, SP560: -920, SP585: 1080, SP610: 1080, SP1000: 1080, it: 1}
        ,Sell_Put_585: {SP0: -57200, SP560: -1200, SP585: 1300, SP610: 1300, SP1000: 1300, it: 1}
        ,Sell_Put_590:{SP0: -57450, SP560: -1450, SP585: 1050, SP610: 1550, SP1000: 1550, it: 1}
    },
    ints: {
        SP0: 1,
        SP560: 1
        ,SP585: 1
        ,SP610: 1
        ,SP1000: 1    
    }
}

for(var i = 0; i<10000; i++){
    for(var constraint in model.constraints){
        if(constraint !== "it"){
            model.constraints[constraint] = {min: i}
        }
    }
    var solution = solver.Solve(model);
    if(!solution.feasible){
        break;
    } else {
        console.log(solution.result, solution)
    }
}
