var solver = require("../src/solver"),
    helper = solver._helpers;



function dork(){
    var ary = new Array(100).join().split(",").map(function(o,i){return i});

     helper.chomper(ary, 
        function(i, c){
            setTimeout(function(){
                console.log(i);
                if(Math.random() > 0.75){
                    ary.push(100 + i);
                }
                c();
            }, 0);
        }
        ,function(){
            return "One-Hundo buddy!";
        }
    );
}

console.log(dork());

