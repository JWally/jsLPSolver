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


var ary = 
    [[{"USD_JPY": "95.5266826", "USD_USD": "1.0000000", "JPY_EUR": "0.0081005", "BTC_USD": "135.1980374", "JPY_BTC": "0.0000865", "USD_EUR": "0.7252677", "EUR_USD": "1.1272248", "EUR_JPY": "115.4932377", "JPY_USD": "0.0104132", "BTC_BTC": "1.0000000", "EUR_BTC": "0.0098691", "BTC_JPY": "13839.7113054", "JPY_JPY": "1.0000000", "BTC_EUR": "99.7255051", "EUR_EUR": "1.0000000", "USD_BTC": "0.0077402"}
    ],[{"USD_JPY": "92.3340855", "USD_USD": "1.0000000", "JPY_EUR": "0.0083371", "BTC_USD": "132.3995437", "JPY_BTC": "0.0000891", "USD_EUR": "0.7010286", "EUR_USD": "1.1570908", "EUR_JPY": "118.5532565", "JPY_USD": "0.0107173", "BTC_BTC": "1.0000000", "EUR_BTC": "0.0101305", "BTC_JPY": "13553.2401009", "JPY_JPY": "1.0000000", "BTC_EUR": "97.6612651", "EUR_EUR": "1.0000000", "USD_BTC": "0.0074815"}
    ],[{"USD_JPY": "92.3000272", "USD_USD": "1.0000000", "JPY_EUR": "0.0083396", "BTC_USD": "132.3598053", "JPY_BTC": "0.0000891", "USD_EUR": "0.7007700", "EUR_USD": "1.1575149", "EUR_JPY": "118.5967085", "JPY_USD": "0.0107206", "BTC_BTC": "1.0000000", "EUR_BTC": "0.0101343", "BTC_JPY": "13549.1722277", "JPY_JPY": "1.0000000", "BTC_EUR": "97.6319530", "EUR_EUR": "1.0000000", "USD_BTC": "0.0074788"}
    ],[{"USD_JPY": "92.2734518", "USD_USD": "1.0000000", "JPY_EUR": "0.0083416", "BTC_USD": "132.3286124", "JPY_BTC": "0.0000891", "USD_EUR": "0.7005682", "EUR_USD": "1.1578478", "EUR_JPY": "118.6308165", "JPY_USD": "0.0107231", "BTC_BTC": "1.0000000", "EUR_BTC": "0.0101372", "BTC_JPY": "13545.9791242", "JPY_JPY": "1.0000000", "BTC_EUR": "97.6089443", "EUR_EUR": "1.0000000", "USD_BTC": "0.0074766"}
    ],[{"USD_JPY": "92.2631357", "USD_USD": "1.0000000", "JPY_EUR": "0.0083424", "BTC_USD": "132.3164597", "JPY_BTC": "0.0000891", "USD_EUR": "0.7004899", "EUR_USD": "1.1579775", "EUR_JPY": "118.6441049", "JPY_USD": "0.0107241", "BTC_BTC": "1.0000000", "EUR_BTC": "0.0101383", "BTC_JPY": "13544.7351023", "JPY_JPY": "1.0000000", "BTC_EUR": "97.5999802", "EUR_EUR": "1.0000000", "USD_BTC": "0.0074758"}
    ],[{"USD_JPY": "92.2440053", "USD_USD": "1.0000000", "JPY_EUR": "0.0083438", "BTC_USD": "132.2938577", "JPY_BTC": "0.0000891", "USD_EUR": "0.7003446", "EUR_USD": "1.1582187", "EUR_JPY": "118.6688190", "JPY_USD": "0.0107259", "BTC_BTC": "1.0000000", "EUR_BTC": "0.0101404", "BTC_JPY": "13542.4214252", "JPY_JPY": "1.0000000", "BTC_EUR": "97.5833084", "EUR_EUR": "1.0000000", "USD_BTC": "0.0074742"}
    ],[{"USD_JPY": "92.2373916", "USD_USD": "1.0000000", "JPY_EUR": "0.0083443", "BTC_USD": "132.2860241", "JPY_BTC": "0.0000891", "USD_EUR": "0.7002944", "EUR_USD": "1.1583023", "EUR_JPY": "118.6773848", "JPY_USD": "0.0107266", "BTC_BTC": "1.0000000", "EUR_BTC": "0.0101412", "BTC_JPY": "13541.6195232", "JPY_JPY": "1.0000000", "BTC_EUR": "97.5775301", "EUR_EUR": "1.0000000", "USD_BTC": "0.0074737"}
    ],[{"USD_JPY": "92.2278463", "USD_USD": "1.0000000", "JPY_EUR": "0.0083450", "BTC_USD": "132.2746998", "JPY_BTC": "0.0000891", "USD_EUR": "0.7002220", "EUR_USD": "1.1584232", "EUR_JPY": "118.6897673", "JPY_USD": "0.0107275", "BTC_BTC": "1.0000000", "EUR_BTC": "0.0101422", "BTC_JPY": "13540.4603012", "JPY_JPY": "1.0000000", "BTC_EUR": "97.5691770", "EUR_EUR": "1.0000000", "USD_BTC": "0.0074729"}
    ],[{"USD_JPY": "92.2183101", "USD_USD": "1.0000000", "JPY_EUR": "0.0083457", "BTC_USD": "132.2633650", "JPY_BTC": "0.0000891", "USD_EUR": "0.7001496", "EUR_USD": "1.1585442", "EUR_JPY": "118.7021614", "JPY_USD": "0.0107284", "BTC_BTC": "1.0000000", "EUR_BTC": "0.0101433", "BTC_JPY": "13539.2999937", "JPY_JPY": "1.0000000", "BTC_EUR": "97.5608161", "EUR_EUR": "1.0000000", "USD_BTC": "0.0074721"}
    ]]
    
    
var solve_arb = function(home_currency, rates){
    var keys = Object.keys(rates),
        constraints = {},
        model = {};
        
    for(var i = 0; i < keys.length; i++){
        // Convert the numbers to values
        //rates[keys[i]] = parseFloat(rates[keys[i]]);
        var ary = keys[i].split("_");
        var obj = {};
        obj[ary[0]] = 1;
        obj[ary[1]] = - parseFloat(rates[keys[i]]);
        
        rates[keys[i]] = obj;      
        
        // Get the key's Root
        var tmp = keys[i].match(/^.+(?=\_)/gi)[0];
        
        // Load up the Constraints Object        
        constraints[tmp] = tmp === home_currency ? {max: 1, min: 1} : {max: 0, min: 0}
    
        // Throw away the identity rates
        // aka USD_USD, BTC_BTC, etc
        if(keys[i].match(RegExp(tmp,"gi"))[1]){
            delete rates[keys[i]];
        }
    }
    
    rates["tgt"] = {};
    rates["tgt"][home_currency] = 1;
    constraints["tgt"] = {max: 100, min: 1.1}
    
    model.constraints = constraints;
    model.variables = rates;
    model.opType = "max";
    model.optimize = "tgt";
    

    return solver.Solve(model);
}



for(var i = 0; i < ary.length; i++){
    console.log("ARB: " + i + ":" , solve_arb("USD", ary[i][0]))
}
