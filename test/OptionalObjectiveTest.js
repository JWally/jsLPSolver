/*global require*/
/*global describe*/
/*global it*/

var assert = require("assert");
var solver = require("../src/main.js");

describe("Testing if optional objectives are taken into account", function () {

	it("should be able to construct and solve UI model", function () {

		// Elements composing the UI
		var nUIElements = 0;
		function UIElement(model){
			this.varULCornerX = model.addVariable(0, "varULCornerX"+nUIElements, false, false);
			this.varULCornerY = model.addVariable(0, "varULCornerY"+nUIElements, false, false);

			this.varWidth = model.addVariable(0, "varWidth"+nUIElements, false, false);
			this.varHeight = model.addVariable(0, "varHeight"+nUIElements, false, false);

			nUIElements += 1;
		}


		function setMinWidth(model, element, minWidth){
			return [model.greaterThan(minWidth).addTerm(1, element.varWidth)];
		}
		function setMaxWidth(model, element, maxWidth){
			return [model.smallerThan(maxWidth).addTerm(1, element.varWidth)];
		}
		function setMinHeight(model, element, minHeight){
			return [model.greaterThan(minHeight).addTerm(1, element.varHeight)];
		}
		function setMaxHeight(model, element, maxHeight){
			return [model.smallerThan(maxHeight).addTerm(1, element.varHeight)];
		}

		function setMinXPosition(model, element, minXPosition){
			return [model.greaterThan(minXPosition).addTerm(1, element.varULCornerX)];
		}
		function setMaxXPosition(model, element, maxXPosition){
			return [model.smallerThan(maxXPosition).addTerm(1, element.varULCornerX)];
		}
		function setMinYPosition(model, element, minYPosition){
			return [model.greaterThan(minYPosition).addTerm(1, element.varULCornerY)];
		}
		function setMaxYPosition(model, element, maxYPosition){
			return [model.smallerThan(maxYPosition).addTerm(1, element.varULCornerY)];
		}

		function noOverlap(model, element1, element2){
			var constraintSet = [];

			var xC1 = element1.varULCornerX;
			var yC1 = element1.varULCornerY;
			var xC2 = element2.varULCornerX;
			var yC2 = element2.varULCornerY;

			var W1 = element1.varWidth;
			var H1 = element1.varHeight;
			var W2 = element2.varWidth;
			var H2 = element2.varHeight;

			var MWidth = 1920;
			var MHeight = 1080;

			var binXC1 = model.addVariable(0, "bx"+xC1.id, true, false);

			constraintSet.push(model.smallerThan(0).addTerm(1, xC1).addTerm(1, W1).addTerm(-1, xC2).addTerm(-MWidth, binXC1));


			var binYC1 = model.addVariable(0, "by"+yC1.id, true, false);

			constraintSet.push(model.smallerThan(0).addTerm(1, yC1).addTerm(1, H1).addTerm(-1, yC2).addTerm(-MHeight, binYC1));


			var binXC2 = model.addVariable(0, "bx"+xC2.id, true, false);

			constraintSet.push(model.smallerThan(0).addTerm(1, xC2).addTerm(1, W2).addTerm(-1, xC1).addTerm(-MWidth, binXC2));


			var binYC2 = model.addVariable(0, "by"+yC2.id, true, false);

			constraintSet.push(model.smallerThan(0).addTerm(1, yC2).addTerm(1, H2).addTerm(-1, yC1).addTerm(-MHeight, binYC2));


			var equality = model.equal(3).addTerm(1, binXC1).addTerm(1, binYC1).addTerm(1, binXC2).addTerm(1, binYC2);

			return constraintSet;
		}


		function respectRightSide(model, element, displayWidth, offset){
			return [model.smallerThan(displayWidth-offset).addTerm(1, element.varULCornerX).addTerm(1, element.varWidth)];
		}


		function setConstraintSetPriority(constraintSet, priority){
			for(var constraintIndex = 0; constraintIndex < constraintSet.length; constraintIndex += 1){
				var constraint = constraintSet[constraintIndex];
				constraint.relax(1,priority);
			}
		}





		var displayWidth = 500;
		var displayheight = 728;

		// Setting up solver
		var Model = solver.Model;
		var model = new Model(1e-8, "model").minimize();

		nUIElements = 0;

		// Creating UI elements
		var elt1 = new UIElement(model);
		setMinWidth(model, elt1, 100);
		setMaxWidth(model, elt1, 200);
		setMinHeight(model, elt1, 200);
		setMaxHeight(model, elt1, 200);

		setMinXPosition(model, elt1, 100);
		setMaxXPosition(model, elt1, 200);
		setMinYPosition(model, elt1, 300);
		setMaxYPosition(model, elt1, 300);


		var elt2 = new UIElement(model);
		setMinWidth(model, elt2, 200);
		setMaxWidth(model, elt2, 300);
		setMinHeight(model, elt2, 50);
		setMaxHeight(model, elt2, 50);

		setMinXPosition(model, elt2, 150);
		setMaxXPosition(model, elt2, 400);
		setMinYPosition(model, elt2, 400);
		setMaxYPosition(model, elt2, 400);


		respectRightSide(model, elt2, displayWidth, 50);

		var cstSet = noOverlap(model, elt1, elt2);

		setConstraintSetPriority(cstSet,1);

		if (model.tableauInitialized === false) {
			model.tableau.setModel(model);
			model.tableauInitialized = true;
		}

		var d = model.solve();

		assert.deepEqual(elt1.varULCornerX.value, 100);
		assert.deepEqual(elt1.varULCornerY.value, 300);
		assert.deepEqual(elt1.varWidth.value, 150);
		assert.deepEqual(elt1.varHeight.value, 200);
		assert.deepEqual(elt2.varULCornerX.value, 250);
		assert.deepEqual(elt2.varULCornerY.value, 400);
		assert.deepEqual(elt2.varWidth.value, 200);
		assert.deepEqual(elt2.varHeight.value, 50);
	});
});
