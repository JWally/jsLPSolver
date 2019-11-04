jsLPSolver
==========
[A linear programming solver for the rest of us!](https://youtu.be/LbfMmCf5-ds?t=51)


What Can I do with it?
-----------------------

You can solve problems that fit the following fact pattern like this one
from [this](http://math.stackexchange.com/questions/59429/berlin-airlift-linear-optimization-problem) site.

>On June 24, 1948, the former Soviet Union blocked all land and water routes through East Germany to Berlin.
>A gigantic airlift was organized using American and British planes to supply food, clothing and other supplies
>to more than 2 million people in West Berlin.
>
>The cargo capacity was 30,000 cubic feet for an American plane and 20,000 cubic feet for a British plane.
>To break the Soviet blockade, the Western Allies had to maximize cargo capacity,
>but were subject to the following restrictions: No more than 44 planes could be used. The larger American planes required 16
>personnel per flight; double that of the requirement for the British planes. The total number of personnel
>available could not exceed 512. The cost of an American flight was $9000 and the cost of a British flight was $5000.
>The total weekly costs could note exceed $300,000.
>Find the number of American and British planes that were used to maximize cargo capacity.



So How Would I Do This?
-----------------------
Part of the reason I built this library is that I wanted to do as little thinking / setup as possible
to solve the actual problem. Instead of tinkering with arrays to solve this problem, you would create a
model in a JavaScript object, and solve it through the solver's `solve` function; like this:

### Install:


(in Node)
```
npm install javascript-lp-solver --save
```

(in browser through CDN)
```html
<script src="https://unpkg.com/javascript-lp-solver/prod/solver.js"></script>
```

(webpack)
```javascript
const webpack = require('webpack'); //to access built-in plugins

module.exports = {
        "mode": "development",
        "plugins": [
            new webpack.IgnorePlugin(/(fs|child_process)/),
        ]
}
```

### Use:

```javascript
var solver = require("./src/solver"),
  results,
  model = {
    "optimize": "capacity",
    "opType": "max",
    "constraints": {
        "plane": {"max": 44},
        "person": {"max": 512},
        "cost": {"max": 300000}
    },
    "variables": {
        "brit": {
            "capacity": 20000,
            "plane": 1,
            "person": 8,
            "cost": 5000
        },
        "yank": {
            "capacity": 30000,
            "plane": 1,
            "person": 16,
            "cost": 9000
        }
    },
};

results = solver.Solve(model);
console.log(results);
```

which should yield the following:
```
{feasible: true, brit: 24, yank: 20, result: 1080000}
```

What If I Want Only Integers
--------------------

Say you live in the real world and partial results aren't realistic, too messy, or generally unsafe.

> You run a small custom furniture shop and make custom tables and dressers.
>
> Each week you're limited to 300 square feet of wood, 110 hours of labor,
> and 400 square feet of storage.
>
> A table uses 30sf of wood, 5 hours of labor, requires 30sf of storage and has a
> gross profit of $1,200. A dresser uses 20sf of wood, 10 hours of work to put
> together, requires 50 square feet to store and has a gross profit of $1,600.
>
> How much of each do you produce to maximize profit, given that partial furniture
> aren't allowed in this dumb world problem?

```javascript
var solver = require("./src/solver"),
    model = {
        "optimize": "profit",
        "opType": "max",
        "constraints": {
            "wood": {"max": 300},
            "labor": {"max": 110},
            "storage": {"max": 400}
        },
        "variables": {
            "table": {"wood": 30, "labor": 5, "profit": 1200, "table": 1, "storage": 30},
            "dresser": {"wood": 20, "labor": 10, "profit": 1600, "dresser": 1, "storage": 50}
        },
        "ints": {"table": 1, "dresser": 1}
    }
    
console.log(solver.Solve(model));
// {feasible: true, result: 1440-0, table: 8, dresser: 3}
```

My problem is HUGE. Can I do this async or something? 
--------------------

Yes! Or something!

So its not truly async, but an instance of solver can be easily(?) put in an instance of a web worker.

*worker.js*
```javascript

// n.b. Solver connects itself to the global 'self'
// if its available...
//
importScripts("/prod/solver.js");

onmessage = function(d){
    var results = solver.Solve(d.data);
    postMessage(results);
};
```

*main.html*
```javascript

    var w = new Worker("./worker.js");

    w.onmessage = function(d){
        //
        // do something fun / exciting with our results!
        //
        console.log(d);
    }

    w.postMessage(lp_model);
```

How Fast Can It Go?
---------------------

Random selection of problems of "some" size / interest:

```
-----------------
-----------------
LargeFarmMIP [ 100  variables, 35  constraints,  100  integers ]
jsLPSolver: 16.475ms


-----------------
-----------------
Monster Problem [ 552  variables, 600  constraints,  0  integers ]
jsLPSolver: 18.142ms


-----------------
-----------------
monster_II [ 924  variables, 888  constraints,  112  integers ]
jsLPSolver: 308.026ms


-----------------
-----------------
Fancy Stock Cutting Problem [ 31  variables, 5  constraints,  31  integers ]
jsLPSolver: 1.396ms


-----------------
-----------------
Vendor Selection [ 1640  variables, 1641  constraints,  0  integers ]
jsLPSolver: 1222.659ms


``` 

Neat! What else can I do with it?


API / Guide
===============

Below is my first pass at describing the various parts of the model, what they do, and other miscellaneous options that might not
be super intuitive.

As much as possible, I'm trying to make all of the options / functions accessible by changing the JSON model. To me (maybe incorrectly),
it's easier to be able to just call one method to do everything based on the model its given instead of having to hit seperate functions
exposed on the solver itself.

#### optimize

This tells the model (wait for it) what to optimize (minimize or maximize). Typically (honestly, always) the thing you're optimizing is an attribute
of a variable. For example, `profit` might be a variable attribute you want to maximize. In this case, your model would look like this:

```json
    {
        "optimize": "profit",
        "opType": "max",
    }
```

_MULTI OBJECTIVE OPTIMIZATION_: This is kind of a throwaway function I added because I needed it for something. I don't know if there's a better way to do this, or if it even makes sense, so please take this with a grain of salt.

Say you have a problem where you want to eat as much "bacon", "cheddar cheese", and "french fries" as possible. To do this, set the "optimize" attribute of the model like this:

```json
    "optimize": {
        "bacon": "max",
        "cheddar cheese": "max",
        "french fries": "max"
    }
```

This will return a result where no single objective can be improved without hurting at least one other objective. It also returns the results of the "child" optimization problems 

#### opType

This tells the solver how to optimize your problem. Acceptable options are "min" for minimize and "max" for maximize.

#### variables

These are the inputs of your problem. For the word problem:

>How many chairs, tables, and desks do you need to produce given that a chair requires ...

...chairs, tables, and desks are your variables. You can assign attributes to the variables (size, cost, weight, etc) that you can use to constrain the problem.

On your model, your variables would look like this:

```json
        "variables": {
            "table": {"wood": 30, "labor": 5, "profit": 1200, "storage": 30},
            "dresser": {"wood": 20, "labor": 10, "profit": 1600, "storage": 50}
        },
```

#### constraints

Real world problems don't allow you to use an unlimited number of resources (sad). In order to solve problems like 

>Maximize Profit...

where resources are limited; constraints come into play. Here is where you put them. (In a normal LP tableau, these are the inequalities).

Using the above example, say you had at most 300 units of wood, 110 units of labour, and 400 units of storage. To represent this in JSON format, you
would set it up like this:

```json
    "constraints": {
        "wood": {"max": 300},
        "labor": {"max": 110},
        "storage": {"max": 400}
    },
```

...where for the first constraint, "wood" is the attribute you're setting a constraint on with a "maximum" of 300 units used to solve the the problem. Other options for constraints are "min" (minimum) and "equal" (equal to).

#### options

This is a catch-all place to put additional options on the model for the Solver to work with in an attempt to not clutter the "core" of the model too much.

#### options.timeout

This option is how many milliseconds you want to allow for the solver to try and solve the model you're running. You set it like this:

```json
"options": {
    "timeout": 10000
}
```

N.B. currently, it only works for mixed-integer linear programs

#### options.tolerance

For large scale integer problems the solving process can take increasingly long. However, oftentimes the solution to these problems does not have to be the absolute best possible solution, but rather a solution relatively close to the optimal one. In these cases, a variable called tolerance can be specified in the model object. The value assigned to the tolerance variable states that the solver should stop the solution process when the best solution found is within {{options.tolerance}}% of the best theoretical objective value.

It is set up like this:

```json
"options": {
    "tolerance": 0.05
}
```


External Solver Integration
===============================

(n.b. this is still very much in progress and subject to change...)

Basically I want to be able to work with "professional-grade" solver libraries through jsLPSolver; without incorporating hard dependencies / binary builds / etc.


## lpsolve

To use, incorporate the following onto your model:

```json
    "external": {
        "solver": "lpsolve",
        "binPath": "C:/lpsolve/lp_solve.exe",
        "tempName": "C:/temp/out.txt",
        "args": [
            "-s2",
            "-timeout",
            240
        ]
    }
```

Basically, its doing the following:

1. Convert your model to something lpsolve can use
2. Saves your model to a temporary file (hence the `tempName` attribute)
3. Runs everything through a command line (`require("child_process").execFile`) against the lpsolve executable (binPath) with whatever arguments you need (args)
4. Scrubs the results
5. Returns a JSON object with the results

