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
```
{feasible: true, Yusip: 270, Exotic: 260, result: 1985}
```
##What If I Want Only Integers

Say you live in the real world and partial results aren't realistic, or are too messy.

>Steven manages a wood shop that makes money by charging people money to use its tools.
>The shop owner tells Steven that he has an extra $40,000 this year to spend on new equipment.
>After thinking of ways to get the new tools in the shop, Steven realizes that he only has 205 sqft
>to work with.
>
>The 3 pieces of equipment Steven is most interestd in are the press, the lathe, and the drill.
>A new drill will cost $8,000, take up 15 sqft, and yield about $100 in profit / week.
>A new lathe will only cost $4,000, make about $150 / wk in profit, but it takes up 30 sqft.
>Finally, Steven can get a new drill for $4,500 which takes up 14 sqft; and can expect about $80 / wk from it.
>
>What should Steven buy to maximize profit?

```javascript
 models.push({
     optimize: "profit",
     opType: "max",
     constraints: {
         space: {max: 205},
         price: {max: 40000}
     },
     variables: {
                 press: {space: 15, price: 8000, profit: 100},
                 lathe: {space: 30, price: 4000, profit: 150},
                 drill: {space: 14, price: 4500, profit: 80}
             },
     ints: {
         press: 1 ,lathe: 1 ,drill: 1
     }
 });

```
