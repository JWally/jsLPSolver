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

GETTING STARTED:
================


What if my Mixed-Integer Problem takes too long to Solve?
----------------------

For large scale integer problems the solving process can take increasingly long. However, oftentimes the solution to these problems does not have to be the absolute best possible solution, but rather a solution relatively close to the optimal one. 
In these cases, a variable called ```tolerance``` can be specified in the model object. The value assigned to the ```tolerance``` variable states that the solver should stop the solution process when the proportional difference between the solution found and the best theoretical objective value is guaranteed to be smaller than the given termination tolerance.

```javascript
   model = {
        "optimize": "profit",
        "opType": "max",
        "options": {
            "tolerance": 0.5
        }
        ...
    }
```

Additionally, a ```timeout``` variable can be added to the JSON model that will return the best solution after {{user-defined}} milliseconds.

```javascript
   model = {
        "optimize": "profit",
        "opType": "max",
        "options": {
            "tolerance": 0.5
        }
        ...
    }
```

How Fast is it?
----------------------
Below are the results from my home made suite of variable sized LP(s)

```javascript
{ 
  'Monster Problem': { constraints: 576, variables: 552, time: 0.017 },
  'monster_II': { constraints: 842, variables: 924, ints: 112, time: 0.323 },
  'Relaxed': { variables: 2, time: 0.004899597 },
  'Unrestricted': { constraints: 1, variables: 2, time: 0.001273972 },
  'Chevalier 1': { constraints: 5, variables: 2, time: 0.000112002 },
  'Artificial': { constraints: 2, variables: 2, time: 0.000101994 },
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
}
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
      
      // Solve the LP
      console.log(solver.Solve(model));
  });
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
            "table": {"wood": 30, "labor": 5, "profit": 1200, "table": 1, "storage": 30},
            "dresser": {"wood": 20, "labor": 10, "profit": 1600, "dresser": 1, "storage": 50}
        },
        "ints": {"table": 1, "dresser": 1}
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


