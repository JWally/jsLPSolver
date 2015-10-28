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



##So How Would I Do This?
Part of the reason I built this library is that I wanted to do as little thinking / setup as possible
to solve the actual problem. Instead of tinkering with arrays to solve this problem, you would create a
model in a JavaScript object, and solver it through the object's `solve` function; like this:

```javascript
var solver = new Solver,
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
##What If I Want Only Integers

Say you live in the real world and partial results aren't realistic, or are too messy.

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

##How Fast is it?

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

##Incorporating a "Big-Boy" Solver

Part of the reason that I build this library is because I *hate* setting up
tableaus. Unfortunately, I'm not a CS wizard, and this solver probably should not
be used for real calculation intensive problems. However, I'm in the process of
building out functionality to convert a JSON object into a tableau. Its in a pretty
primitive state right now, but if you

```javascript
var awesome = solver.ReformatLP(model);
    fs = require("fs");
    
fs.writeFile("model.lp", fs);
```

you can convert a JSON model into a string that can be used by [LP_Solve](http://lpsolve.sourceforge.net/5.5/).
