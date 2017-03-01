jsLPSolver
==========
[A linear programming solver for the rest of us!](https://youtu.be/LbfMmCf5-ds?t=51)


##What Can I do with it?
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
model in a JavaScript object, and solve it through the object's `solve` function; like this:

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
> How much of each do you product to maximize profit, given that partial furniture
> isn't allowed in this dumb word problem?

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
            "table": {"wood": 30,"labor": 5,"profit": 1200,"table": 1, "storage": 30},
            "dresser": {"wood": 20,"labor": 10,"profit": 1600,"dresser": 1, "storage": 50}
        },
        "ints": {"table": 1,"dresser": 1}
    }
    
console.log(solver.Solve(model));
// {feasible: true, result: 1440-0, table: 8, dresser: 3}
```


How Fast is it?
----------------------
Below are the results from my home made suite of variable sized LP(s)

```javascript
{ Relaxed: { variables: 2, time: 0.004899597 },
  Unrestricted: { constraints: 1, variables: 2, time: 0.001273972 },
  'Chevalier 1': { constraints: 5, variables: 2, time: 0.000112002 },
  Artificial: { constraints: 2, variables: 2, time: 0.000101994 },
  'Wiki 1': { variables: 3, time: 0.000358714 },
  'Degenerate Min': { constraints: 5, variables: 2, time: 0.000097377 },
  'Degenerate Max': { constraints: 5, variables: 2, time: 0.000085829 },
  'Coffee Problem': { constraints: 2, variables: 2, time: 0.000296747 },
  'Computer Problem': { constraints: 2, variables: 2, time: 0.000066585 },
  'Generic Business Problem': { constraints: 2, variables: 2, time: 0.000083135 },
  'Generic Business Problem 2': { constraints: 2, variables: 2, time: 0.000040413 },
  'Chocolate Problem': { constraints: 2, variables: 2, time: 0.000058503 },
  'Wood Shop Problem': { constraints: 2, variables: 2, time: 0.000045416 },
  'Integer Wood Problem': { constraints: 3, variables: 2, ints: 2, time: 0.002406691 },
  'Berlin Air Lift Problem': { constraints: 3, variables: 2, time: 0.000077362 },
  'Integer Berlin Air Lift Problem': { constraints: 3, variables: 2, ints: 2, time: 0.000823271 },
  'Infeasible Berlin Air Lift Problem': { constraints: 5, variables: 2, time: 0.000411828 },
  'Integer Wood Shop Problem': { constraints: 2, variables: 3, ints: 3, time: 0.001610363 },
  'Integer Sports Complex Problem': { constraints: 6, variables: 4, ints: 4, time: 0.001151579 },
  'Integer Chocolate Problem': { constraints: 2, variables: 2, ints: 2, time: 0.000109692 },
  'Integer Clothing Shop Problem': { constraints: 2, variables: 2, ints: 2, time: 0.000382191 },
  'Integer Clothing Shop Problem II': { constraints: 2, variables: 4, ints: 4, time: 0.000113927 },
  'Shift Work Problem': { constraints: 6, variables: 6, time: 0.000127012 },
  'Monster Problem': { constraints: 576, variables: 552, time: 0.054285454 },
  monster_II: { constraints: 842, variables: 924, ints: 112, time: 0.649073406 } }
```

Alternative Model Formats
-----------

Part of the reason that I build this library is because I *hate* setting up tableaus. Sometimes though, its just easier just to work with a tableau; other times, javaScript might not be the right environment to solve linear programs in. Fear not, we (kind of) have you covered!

__USING A TABLEAU__

The tableau "style-guide" I used to parse LPs came from [LP_Solve](http://lpsolve.sourceforge.net/5.5/lp-format.htm). 

* Get LP From File *

```javascript
  var fs = require("fs"),
      solver = require("./src/solver"),
      model = {};
    
  // Read Data from File
  fs.readFile("./your/model/file", "utf8", function(e,d){
      // Convert the File Data to a JSON Model
      model = solver.ReformatLP(d);
  });

  // Solve the LP
  console.log(solver.Solve(model));
```

* Get LP From Arrays *

```javascript
    var solver = require("./src/solver"),
        model = [
                  "max: 1200 table 1600 dresser",
                  "30 table 20 dresser <= 300",
                  "5 table 10 dresser <= 110",
                  "30 table 50 dresser <= 400",
                  "int table",
                  "int dresser",
                ];
  
  // Reformat to JSON model              
  model = solver.ReformatLP(model);
  
  // Solve the model
  solver.Solve(model);
    
```

__EXPORTING A TABLEAU__

You can also exports JSON models to an [LP_Solve](http://lpsolve.sourceforge.net/5.5/lp-format.htm) format (which is convenient if you plan on using LP_Solve). 

```javascript
   var solver = require("./src/solver"),
       fs = require("fs"),
       model = {
        "optimize": "profit",
        "opType": "max",
        "constraints": {
            "wood": {"max": 300},
            "labor": {"max": 110},
            "storage": {"max": 400}
        },
        "variables": {
            "table": {"wood": 30,"labor": 5,"profit": 1200,"table": 1, "storage": 30},
            "dresser": {"wood": 20,"labor": 10,"profit": 1600,"dresser": 1, "storage": 50}
        },
        "ints": {"table": 1,"dresser": 1}
    };
    
    // convert the model to a string
    model = solver.ReformatLP(model);
    
    // Push the string to file
    fs.writeFile("./something.LP", model);

```



Multi-Objective Optimization
----------------------------

__What is it?__

Its a way to "solve" linear programs with multiple objective functions. Basically, it solves each objective function independent of one another and returns an object with:

* The mid-point between those solutions (midpoint)
* The solutions themselves (vertices)
* The range of values for each variable in the solution (ranges)

__Caveats__

I have no idea if this is right or not. Proceed with caution.

__Use Case__

Say you're a dietitician and have a client that has the following constraints in their diet:

* 375g of carbohydrates / day
* 225g of protein / day
* 66.66g of fat / day

They're also a bit of a junk-food glutton and would like you to create a meal for them containing the following ingredients which meets their nutrition specifications outlined above:

* egg whites
* whole eggs
* cheddar cheese
* bacon
* potato
* fries

They also mention they want to eat as much bacon, cheese, and fries as possible. After losing your appetite, you build the following linear program: 

```javascript
{ 
    "optimize": {
        "bacon": "max",
        "cheddar cheese": "max",
        "french fries": "max"
    },
    "constraints": { 
        "carb": { "equal": 375 },
        "protein": { "equal": 225 },
        "fat": { "equal": 66.666 }
    },
    "variables": { 
         "egg white":{ "carb": 0.0073, "protein": 0.109, "fat": 0.0017, "egg white": 1 },
         "egg whole":{ "carb": 0.0072, "protein": 0.1256, "fat": 0.0951, "egg whole": 1 },
         "cheddar cheese":{ "carb": 0.0128, "protein": 0.249, "fat": 0.3314, "cheddar cheese": 1 },
         "bacon":{ "carb": 0.00667, "protein": 0.116, "fat": 0.4504, "bacon": 1 },
         "potato": { "carb": 0.1747, "protein": 0.0202, "fat": 0.0009, "potato": 1 },
         "french fries": { "carb": 0.3902, "protein": 0.038, "fat": 0.1612, "french fries": 1 }
    } 
}
```

which is solved by the ```solver.MultiObjective``` method. The result for this problem is:

```javascript
{ midpoint: 
   { feasible: true,
     result: -0,
     'egg white': 1494.64994046,
     potato: 1788.20687788,
     bacon: 46.02690209,
     'cheddar cheese': 63.03985067,
     'french fries': 129.61405521 },
  vertices: 
   [ { bacon: 138.08070627,
       'egg white': 1532.31628515,
       potato: 2077.23579169,
       'cheddar cheese': 0,
       'french fries': 0 },
     { 'cheddar cheese': 189.119552,
       'egg white': 1246.61767465,
       potato: 2080.58935724,
       bacon: 0,
       'french fries': 0 },
     { 'french fries': 388.84216563,
       'egg white': 1705.0158616,
       potato: 1206.79548473,
       bacon: 0,
       'cheddar cheese': 0 } ],
  ranges: 
   { bacon: { min: 0, max: 138.08070627 },
     'egg white': { min: 1246.61767465, max: 1705.0158616 },
     potato: { min: 1206.79548473, max: 2080.58935724 },
     'cheddar cheese': { min: 0, max: 189.119552 },
     'french fries': { min: 0, max: 388.84216563 } } }
```

__Reading the Results__

midpoint: This is the solution that maximizes the amount of bacon, cheese, and fries your client can eat *simultaneously*. No single objective can be improved without hurting at least one other objective.

vertices: The solutions to the individual objective functions

ranges: This tells you the absolute minimum and absolute maximum values for each variable that was encountered while solving the objective functions. For instance, I can have between 0 and 138 grams of bacon. If I have 0 grams, I can have more cheese and more fries. If I have 138 grams, I can have no cheese and no fries. 


Using commercial solvers with NEOS Server
----------------------------

__What is it?__
The [NEOS Server](https://neos-server.org/neos/) is a free internet-based service for solving different kinds of numerical optimisation problems. Most interestingly, it provides free access to a number of commercial solvers that feature significantly lower run times on large scale optimisation problems (see [Meindl and Templ (2012)](https://pdfs.semanticscholar.org/4946/08a6837147f8168e2bd371a4bb5ac0a54513.pdf) for a detailed comparison).

By using the ```solveNEOS``` function on the models JavaScript object, the model is reformatted into a modelling language NEOS can read (in this case GAMS), and then submitted to the NEOS server where it is solved using IBMs CPLEX solver. The results are then again converted to a handy JavaScript object similar to the one generated by the ```solve``` function.

__When should I use it?__
When dealing with large scale mixed interger problems, one might experience jsLPSolvers ```solve``` function to freeze or become numerically unstable. Also the UI will be blocked throughout the solving process. 
As the CPLEX solver hosted at the NEOS servers is one of the fastest solvers available, it makes sense (or even might be the only option) to use it in order to solver large scale optimisation problems.

__What to consider__
The model is sent to the NEOS server in order to be solved. Even though it is transferred using the https protocol and secured with a job number and password, keep in mind that it is leaving your server when working with sensitive information. 
The usage of the CPLEX solver requires an E-Mail address to be sent with the inquiry, wich is then forwarded to IBM and may be used for promotional purposes on their end. Additionally you have to comply with the [Terms of Use](https://neos-server.org/neos/termofuse.html) of the NEOS server.

__How to use it__
As the ```solver.solveNEOS``` method makes an AJAX call to the NEOS servers, we have to wait for the results. The function is therefore (partially) promise based an can be used as follows:

```javascript
var results = solver.solveNEOS(model, optcr, status, email).then(function(result) {
    console.log("Success!", response);
}, function(error) {
    console.error("Failed!", error);
})
```

where the parameters are defined as

```javascript
model // The model to be solved
optcr // (Optional) Termination tolerance, GAMS default value is 0.1
status // HTML element to have the current status of the solving job posted to it
email // E-Mail address required by IBM CPLEX
```