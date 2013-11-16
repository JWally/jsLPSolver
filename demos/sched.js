var solver = new Solver;

var models = [];

// Word Problem Source: http://www.algebra.com/algebra/homework/coordinate/word/THEO-2012-01-26.lesson

//Problem 2
models.push({
    optimize: "ppl",
    opType: "min",
    constraints: {
        d0: {min: 4},
        d4: {min: 8},
        d8: {min: 10},
        d12: {min: 7},
        d16: {min: 12},
        d20: {min: 4}
    },
    variables: {
        shft_0: {d0: 1, d4: 1, ppl: 1},
        shft_4: {d4: 1, d8: 1, ppl: 1},
        shft_8: {d8: 1, d12: 1, ppl: 1},
        shft_12: {d12: 1, d16: 1, ppl: 1},
        shft_16: {d16: 1, d20: 1, ppl: 1},
        shft_20: {d20: 1, d0: 1, ppl: 1}
    }
});

for(x in models){
    console.log(solver.Solve(models[x]));
    console.log("");
}


