/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/
/*global importScripts*/
/*global self*/
/*global postMessage*/
/*global onmessage*/
/*
importScripts("/prod/solver.js");

console.log("SELF", self);

onmessage = function(d){
    var results = solver.Solve(d.data);
    postMessage(results);
};
*/