/*global require*/
var Tableau = require("./Tableau.js");

Tableau.prototype.countIntegerValues = function(){
    var count = 0;
    for (var r = 1; r < this.height; r += 1) {
        if (this.variablesPerIndex[this.varIndexByRow[r]].isInteger) {
            var decimalPart = this.matrix[r][this.rhsColumn];
            decimalPart = decimalPart - Math.floor(decimalPart);
            if (decimalPart < this.precision && -decimalPart < this.precision) {
                count += 1;
            }
        }
    }

    return count;
};

//-------------------------------------------------------------------
//-------------------------------------------------------------------
Tableau.prototype.isIntegral = function () {
    var integerVariables = this.model.integerVariables;
    var nIntegerVars = integerVariables.length;
    for (var v = 0; v < nIntegerVars; v++) {
        var varRow = this.rowByVarIndex[integerVariables[v].index];
        if (varRow === -1) {
            continue;
        }

        var varValue = this.matrix[varRow][this.rhsColumn];
        if (Math.abs(varValue - Math.round(varValue)) > this.precision) {
            return false;
        }
    }
    return true;
};

// Multiply all the fractional parts of variables supposed to be integer
Tableau.prototype.computeFractionalVolume = function(ignoreIntegerValues) {
    var volume = -1;
    // var integerVariables = this.model.integerVariables;
    // var nIntegerVars = integerVariables.length;
    // for (var v = 0; v < nIntegerVars; v++) {
    //     var r = this.rowByVarIndex[integerVariables[v].index];
    //     if (r === -1) {
    //         continue;
    //     }
    //     var rhs = this.matrix[r][this.rhsColumn];
    //     rhs = Math.abs(rhs);
    //     var decimalPart = Math.min(rhs - Math.floor(rhs), Math.floor(rhs + 1));
    //     if (decimalPart < this.precision) {
    //         if (!ignoreIntegerValues) {
    //             return 0;
    //         }
    //     } else {
    //         if (volume === -1) {
    //             volume = rhs;
    //         } else {
    //             volume *= rhs;
    //         }
    //     }
    // }

    for (var r = 1; r < this.height; r += 1) {
        if (this.variablesPerIndex[this.varIndexByRow[r]].isInteger) {
            var rhs = this.matrix[r][this.rhsColumn];
            rhs = Math.abs(rhs);
            var decimalPart = Math.min(rhs - Math.floor(rhs), Math.floor(rhs + 1));
            if (decimalPart < this.precision) {
                if (!ignoreIntegerValues) {
                    return 0;
                }
            } else {
                if (volume === -1) {
                    volume = rhs;
                } else {
                    volume *= rhs;
                }
            }
        }
    }

    if (volume === -1){
        return 0;
    }
    return volume;
};
