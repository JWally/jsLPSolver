/*global describe*/
/*global require*/
/*global module*/
/*global it*/
/*global console*/
/*global process*/

var assert = require("assert");
var JSLP = require("../src/solver");
var Model = JSLP.Model;

describe("Testing Dynamic Model Modification", function () {

    it("should be able to construct, modify and solve model 1", function () {
        //-------------------------------------------
        // TESTING DYNAMIC RESOLUTION
        // ON A 2 DIMENSIONAL PROBLEM
        //-------------------------------------------

        //-------------------------------------------
        // INITIAL MODEL
        //-------------------------------------------
        var model2d = new Model(1e-8, "dynamic model 2d").minimize();

        var x1 = model2d.addVariable(3, "x1");
        var x2 = model2d.addVariable(2, "x2");

        var cst1 = model2d.greaterThan(3).addTerm(1, x1).addTerm(1, x2);
        var cst2 = model2d.greaterThan(4).addTerm(2, x1).addTerm(1, x2);

        //-------------------------------------------
        // INITIAL SOLVING
        //-------------------------------------------
        var solution1 = model2d.solve();
        assert.deepEqual(solution1.evaluation, 7);
        assert.deepEqual(x1.value, 1);
        assert.deepEqual(x2.value, 2);

        //-------------------------------------------
        // CHANGING RHS
        //-------------------------------------------
        cst1.setRightHandSide(2.5);
        var solution2 = model2d.solve();
        assert.deepEqual(solution2.evaluation, 6.5);
        assert.deepEqual(x1.value, 1.5);
        assert.deepEqual(x2.value, 1);

        //-------------------------------------------
        // CHANGING VARIABLE COEFFICIENT
        //-------------------------------------------
        cst1.setVariableCoefficient(1.25, x1);
        var solution3 = model2d.solve();
        assert.deepEqual(solution3.evaluation, 6);
        assert.deepEqual(x1.value, 2);
        assert.deepEqual(x2.value, 0);

        //-------------------------------------------
        // CHANGING OBJECTIVE COEFFICIENT
        //-------------------------------------------
        model2d.setCost(1, x2);
        var solution4 = model2d.solve();
        assert.deepEqual(solution4.evaluation, 4);
        assert.deepEqual(x1.value, 0);
        assert.deepEqual(x2.value, 4);

        //-------------------------------------------
        // ADDING A CONSTRAINT
        //-------------------------------------------
        var cst3 = model2d.smallerThan(0).addTerm(-3, x1).addTerm(1, x2);
        var solution5 = model2d.solve();
        assert.deepEqual(solution5.evaluation, 4.8);
        assert.deepEqual(x1.value, 0.8);
        assert.deepEqual(x2.value, 2.4);

        //-------------------------------------------
        // RESETTING PARAMETERS TO INITIAL VALUES
        //-------------------------------------------
        cst1.setRightHandSide(3);
        cst1.setVariableCoefficient(1, x1);
        model2d.setCost(2, x2);
        model2d.removeConstraint(cst3);
        var solution6 = model2d.solve();
        assert.deepEqual(solution6.evaluation, 7);
        assert.deepEqual(x1.value, 1);
        assert.deepEqual(x2.value, 2);
    });


    it("should be able to construct, modify and solve model 2", function () {
        //-------------------------------------------
        // TESTING DYNAMIC RESOLUTION
        // ON A 4 DIMENSIONAL PROBLEM
        //-------------------------------------------
        var model4d = new Model(1e-8, "dynamic model 4d").maximize();

        var coat = model4d.addVariable(50, "coat");
        var pants = model4d.addVariable(40, "pants");
        var hat = model4d.addVariable(10, "hat");
        var socks = model4d.addVariable(1, "socks");

        var yard = model4d.smallerThan(150).addTerm(3, coat).addTerm(5, pants).addTerm(1, hat).addTerm(0.5, socks);
        var hours = model4d.smallerThan(200).addTerm(10, coat).addTerm(4, pants).addTerm(12, hat).addTerm(0.5, socks);

        //-------------------------------------------
        // INITIAL SOLVING
        //-------------------------------------------
        var solution1 = model4d.solve();
        assert.deepEqual(solution1.evaluation.toFixed(2), 1473.68);
        assert.deepEqual(coat.value.toFixed(2), 10.53);
        assert.deepEqual(pants.value.toFixed(2), 23.68);
        assert.deepEqual(hat.value, 0);
        assert.deepEqual(socks.value, 0);

        //-------------------------------------------
        // CHANGING RHS
        //-------------------------------------------
        yard.setRightHandSide(200);
        var solution2 = model4d.solve();
        assert.deepEqual(solution2.evaluation.toFixed(2), 1736.84);
        assert.deepEqual(coat.value.toFixed(2), 5.26);
        assert.deepEqual(pants.value.toFixed(2), 36.84);
        assert.deepEqual(hat.value, 0);
        assert.deepEqual(socks.value, 0);

        //-------------------------------------------
        // CHANGING VARIABLE COEFFICIENT
        //-------------------------------------------
        yard.setVariableCoefficient(7, pants);
        var solution3 = model4d.solve();
        assert.deepEqual(solution3.evaluation.toFixed(2), 1482.76);
        assert.deepEqual(coat.value.toFixed(2), 10.34);
        assert.deepEqual(pants.value.toFixed(2), 24.14);
        assert.deepEqual(hat.value, 0);
        assert.deepEqual(socks.value, 0);

        //-------------------------------------------
        // CHANGING OBJECTIVE COEFFICIENT
        //-------------------------------------------
        model4d.setCost(10, coat);
        var solution4 = model4d.solve();
        assert.deepEqual(solution4.evaluation.toFixed(2), 1175.00);
        assert.deepEqual(coat.value, 0);
        assert.deepEqual(pants.value.toFixed(2), 27.5);
        assert.deepEqual(hat.value.toFixed(2), 7.5);
        assert.deepEqual(socks.value, 0);

        //-------------------------------------------
        // ADDING A CONSTRAINT
        //-------------------------------------------
        var cost = model4d.smallerThan(1000).addTerm(60, coat).addTerm(70, pants).addTerm(8, hat).addTerm(2, socks);
        var solution5 = model4d.solve();
        assert.deepEqual(solution5.evaluation.toFixed(2), 638.61);
        assert.deepEqual(coat.value, 0);
        assert.deepEqual(pants.value.toFixed(2), 12.87);
        assert.deepEqual(hat.value.toFixed(2), 12.38);
        assert.deepEqual(socks.value, 0);

        //-------------------------------------------
        // REMOVING A VARIABLE
        //-------------------------------------------
        model4d.removeVariable(pants);
        var solution6 = model4d.solve();
        assert.deepEqual(solution6.evaluation.toFixed(2), 400.0);
        assert.deepEqual(coat.value, 0);
        assert.deepEqual(hat.value, 0);
        assert.deepEqual(socks.value.toFixed(2), 400.0);

        //-------------------------------------------
        // RESETTING PARAMETERS TO INITIAL VALUES
        //-------------------------------------------
        // Resetting right hand side
        yard.setRightHandSide(150);

        // Reintroducing the pants variable
        pants = model4d.addVariable(40, "pants");
        yard.addTerm(5, pants);
        hours.addTerm(4, pants);

        // Resetting objective coefficient of the coat to original value
        model4d.setCost(50, coat);

        // Removing extra cost constraint
        model4d.removeConstraint(cost);

        var solution7 = model4d.solve();
        assert.deepEqual(solution7.evaluation.toFixed(2), 1473.68);
        assert.deepEqual(coat.value.toFixed(2), 10.53);
        assert.deepEqual(pants.value.toFixed(2), 23.68);
        assert.deepEqual(hat.value, 0);
        assert.deepEqual(socks.value, 0);
    });
});
