var solver = new Solver();
//Problem 7
var model = {
    opType: "max",
    optimize: "x13",
    constraints: {
        SP0: {min: 0, max: 1},
        SP560: {min: 0, max: 1}
        ,SP585: {min: 0, max: 1}
        ,SP610: {min: 0, max: 1}
        ,SP1000: {min: 0, max: 1}
        ,it: {max: 1, min: 1}
    },
    variables: {
        Buy_Call_580: {SP0: -1500, SP560: -1500, SP585: -1000, SP610: 1500, SP1000: 40500, it: 1 }
        ,Buy_Call_585: {SP0: -1130, SP560: -1130, SP585: -1130, SP610: 1370, SP1000: 40370, it: 1 }
        ,Buy_Call_590: {SP0: -1020, SP560: -1020, SP585: -1020, SP610: 980, SP1000: 39980, it: 1 }
        ,Sell_Call_580: {SP0: 1500, SP560: 1500, SP585: 1000, SP610: -1500, SP1000: -40500, it: 1 }
        ,Sell_Call_585: {SP0: 1130, SP560: 1130, SP585: 1130, SP610: -1370, SP1000: -40370, it: 1 }
        ,Sell_Call_590: {SP0: 1020, SP560: 1020, SP585: 1020, SP610: -980, SP1000: -39980, it: 1 }
        ,Buy_Put_580: {SP0: 56920, SP560: 920, SP585: -1080, SP610: -1080, SP1000: -1080, it: 1 }
        ,Buy_Put_585: {SP0: 57200, SP560: 1200, SP585: -1300, SP610: -1300, SP1000: -1300, it: 1 }
        ,Buy_Put_590: {SP0: 57450, SP560: 1450, SP585: -1050, SP610: -1550, SP1000: -1550, it: 1 }
        ,Sell_Put_580: {SP0: -56920, SP560: -920, SP585: 1080, SP610: 1080, SP1000: 1080, it: 1 }
        ,Sell_Put_585: {SP0: -57200, SP560: -1200, SP585: 1300, SP610: 1300, SP1000: 1300, it: 1 }
        ,Sell_Put_590:{SP0: -57450, SP560: -1450, SP585: 1050, SP610: 1550, SP1000: 1550, it: 1 }
        ,x13: {SP0: -1, SP560: -1, SP585: -1, SP610: -1, SP1000: -1}
    }
}

console.log(solver.Solve(model));



var model = {
    opType: "max",
    optimize: "x13",
    constraints: {
        SP0: {min: 0, max: 1},
        SP560: {min: 0, max: 1}
        ,SP585: {min: 0, max: 1}
        ,SP610: {min: 0, max: 1}
        ,SP1000: {min: 0, max: 1}
        ,it: {min: 1, max: 100}
    },
    ints: {
        Buy_Call_580: 1
        ,Buy_Call_585: 1
        ,Buy_Call_590: 1
        ,Sell_Call_580: 1
        ,Sell_Call_585: 1
        ,Sell_Call_590: 1
        ,Buy_Put_580: 1
        ,Buy_Put_585: 1
        ,Buy_Put_590: 1
        ,Sell_Put_580: 1
        ,Sell_Put_585: 1
        ,Sell_Put_590: 1 
    }
    ,variables: {
        Buy_Call_580: {SP0: -1500, SP560: -1500, SP585: -1000, SP610: 1500, SP1000: 40500, it: 1 }
        ,Buy_Call_585: {SP0: -1130, SP560: -1130, SP585: -1130, SP610: 1370, SP1000: 40370, it: 1 }
        ,Buy_Call_590: {SP0: -1020, SP560: -1020, SP585: -1020, SP610: 980, SP1000: 39980, it: 1 }
        ,Sell_Call_580: {SP0: 1500, SP560: 1500, SP585: 1000, SP610: -1500, SP1000: -40500, it: 1 }
        ,Sell_Call_585: {SP0: 1130, SP560: 1130, SP585: 1130, SP610: -1370, SP1000: -40370, it: 1 }
        ,Sell_Call_590: {SP0: 1020, SP560: 1020, SP585: 1020, SP610: -980, SP1000: -39980, it: 1 }
        ,Buy_Put_580: {SP0: 56920, SP560: 920, SP585: -1080, SP610: -1080, SP1000: -1080, it: 1 }
        ,Buy_Put_585: {SP0: 57200, SP560: 1200, SP585: -1300, SP610: -1300, SP1000: -1300, it: 1 }
        ,Buy_Put_590: {SP0: 57450, SP560: 1450, SP585: -1050, SP610: -1550, SP1000: -1550, it: 1 }
        ,Sell_Put_580: {SP0: -56920, SP560: -920, SP585: 1080, SP610: 1080, SP1000: 1080, it: 1 }
        ,Sell_Put_585: {SP0: -57200, SP560: -1200, SP585: 1300, SP610: 1300, SP1000: 1300, it: 1 }
        ,Sell_Put_590:{SP0: -57450, SP560: -1450, SP585: 1050, SP610: 1550, SP1000: 1550, it: 1 }
        ,x13: {SP0: -1, SP560: -1, SP585: -1, SP610: -1, SP1000: -1}
    }
}

console.log(solver.Solve(model, 3));


/*
 http://mattmcd.github.io/2013/03/30/FX-Arbitrage-CLP.html
 http://fx.priceonomics.com/v1/rates/
 http://priceonomics.com/jobs/puzzle/
*/


var model = {
    optimize: "d",
    opType: "max",
    constraints: {
        d_1: {max: 1, min: 1},
        e_1: {max: 0, min: 0},
        p_1: {max: 0, min: 0},
        y_1: {max: 0, min: 0},
        d: {max: 10000, min: 1.1}
    },
    variables: {
        d: {d_1: 1},
        de: {d_1: 1, e_1: -1.1486},
        dp: {d_1: 1, p_1: -0.7003},
        dy: {d_1: 1, y_1: -133.33},
        ed: {e_1: 1, d_1: -0.8706},
        ep: {e_1: 1, p_1: -0.6097},
        ey: {e_1: 1, y_1: -116.14},
        pd: {p_1: 1, d_1: -1.4279},
        pe: {p_1: 1, e_1: -1.6401},
        py: {p_1: 1, y_1: -190.480},
        yd: {y_1: 1, d_1: -0.0075},
        yp: {y_1: 1, p_1: -0.00525},
        ye: {y_1: 1, e_1: -0.00861}    
    }
};

console.log(solver.Solve(model, 2));