/*global describe*/
/*global require*/
/*global it*/
/*global console*/
/*global process*/
/*global exports*/
/*global Promise*/


// LP SOLVE CLI REFERENCE:
// http://lpsolve.sourceforge.net/5.5/lp_solve.htm
//
//

// var reformat = require("./Reformat.js");

exports.reformat = require("./Reformat.js");

function clean_data(data){

    //
    // Clean Up
    // And Reformatting...
    //
    data = data.replace("\\r\\n","\r\n");


    data = data.split("\r\n");
    data = data.filter(function(x){
        
        var rx;
        
        //
        // Test 1
        rx = new RegExp(" 0$","gi");
        if(rx.test(x) === true){
            return false;
        }

        //
        // Test 2
        rx = new RegExp("\\d$","gi");
        if(rx.test(x) === false){
            return false;
        }
        

        return true;
    })
    .map(function(x){
        return x.split(/\:{0,1} +(?=\d)/);
    })
    .reduce(function(o,k,i){
        o[k[0]] = k[1];
        return o;
    },{});
    
    return data;
}





exports.solve = function(model){
    //
    return new Promise(function(res, rej){
        //
        // Exit if we're in the browser...
        //
        if(typeof window !== "undefined"){
            rej("Function Not Available in Browser");
        }
        //
        // Convert JSON model to lp_solve format
        //
        var data = require("./Reformat.js")(model);
        
        
        if(!model.external){
            rej("Data for this function must be contained in the 'external' attribute. Not seeing anything there.");
        }
        
        // 
        // In the args, they *SHALL* have provided an executable
        // path to the solver they're piping the data into
        //
        if(!model.external.binPath){
            rej("No Executable | Binary path provided in arguments as 'binPath'");
        }
        
        //
        // They also need to provide an arg_array
        //
        if(!model.external.args){
            rej("No arguments array for cli | bash provided on 'args' attribute");
        }
        
        //
        // They also need a tempName so we know where to store
        // the temp file we're creating...
        //
        if(!model.external.tempName){
            rej("No 'tempName' given. This is necessary to produce a staging file for the solver to operate on");
        }
        
        
        
        //
        // To my knowledge, in Windows, you cannot directly pipe text into
        // an exe...
        //
        // Thus, our process looks like this...
        //
        // 1.) Convert a model to something an external solver can use
        // 2.) Save the results from step 1 as a temp-text file
        // 3.) Pump the results into an exe | whatever-linux-uses
        // 4.) 
        // 
        //
        
        var fs = require("fs");
        
        fs.writeFile(model.external.tempName, data, function(fe, fd){
            if(fe){
                rej(fe);
            } else {
                //
                // So it looks like we wrote to a file and closed it.
                // Neat.
                //
                // Now we need to execute our CLI...
                var exec = require("child_process").execFile;
                
                //
                // Put the temp file name in the args array...
                //
                model.external.args.push(model.external.tempName);
                
                exec(model.external.binPath, model.external.args, function(e,data){
                    if(e){
                        
                        if(e.code === 1){
                            res(clean_data(data));
                        } else {
                            
                            var codes = {
                                "-2": "Out of Memory",
                                "1": "SUBOPTIMAL",
                                "2": "INFEASIBLE",
                                "3": "UNBOUNDED",
                                "4": "DEGENERATE",
                                "5": "NUMFAILURE",
                                "6": "USER-ABORT",
                                "7": "TIMEOUT",
                                "9": "PRESOLVED",
                                "25": "ACCURACY ERROR",
                                "255": "FILE-ERROR"
                            };
                            
                            var ret_obj = {
                                "code": e.code,
                                "meaning": codes[e.code],
                                "data": data
                            };
                            
                            rej(ret_obj);
                        }

                    } else {
                        // And finally...return it.
                        res(clean_data(data));
                    }
                });
            }
        });
    });
};





/*
model.external = {
    "binPath": "C:/lpsolve/lp_solve.exe",
    "tempName": "C:/temp/out.txt",
    "args": [
        "-S2"
    ]
    
}

*/