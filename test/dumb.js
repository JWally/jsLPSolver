var assert = require("assert");


describe("Deep Equals", function () {
    it("Should equate 2 objects as equal", function () {
        assert.deepEqual({
            a: {
                b: {
                    c: {
                        d: 1,
                        that: 2,
                        dance: 3
                    }
                }
            }
        }, {
            a: {
                b: {
                    c: {
                        d: 1,
                        that: 2,
                        dance: 3
                    }
                }
            }
        });
    });
});
