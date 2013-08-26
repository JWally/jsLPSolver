jsLPSolver
==========
Simple OOP javaScript library to solve linear programs, and mixed integer linear programs


##What Can I do with it?
You can solve problems that fit the following fact pattern like this one
from [this](http://www.algebra.com/algebra/homework/coordinate/word/THEO-2012-01-26.lesson) site.

>Fred's Coffee sells two blends of beans: Yusip Blend and Exotic Blend. Yusip Blend is one-half
>Costa Rican beans and one-half Ethiopian beans. Exotic Blend is one-quarter Costa Rican beans and
>three-quarters Ethiopian beans. Profit on the Yusip Blend is $3.50 per pound, while profit on the Exotic
>Blend is $4.00 per pound. Each day Fred receives a shipment of 200 pounds of Costa Rican beans and
>330 pounds of Ethiopian beans to use for the two blends. 

>How many pounds of each blend should be
>prepared each day to maximize profit? What is the maximum profit? 

##So How Would I Do This?
Part of the reason I built this library is that I wanted to do as little thinking / setup as possible
to solve the actual problem. Instead of tinkering with arrays to solve this problem, you would create a 
model in a JavaScript object, and solver it through the object's `solve` function; like this:

```javascript
var solver = new Solver,
  results,
  model = {
    optimize: "profit",
    opType: "max",
    constraints: {
        "Costa Rican" : {max: 200},
        "Etheopian": {max: 330}
    },
    variables: {
        "Yusip": {"Costa Rican" : 0.5, "Etheopian": 0.5, profit: 3.5},
        "Exotic": {"Costa Rican" : 0.25, "Etheopian": 0.75, profit: 4}
    }
};

results = solver.solve(model);
console.log(results);
```

which should yield the following:
````
{feasible: true, Yusip: 270, Exotic: 260, result: 1985}
```
