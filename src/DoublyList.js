/**
 * DOUBLY LIST Class
 *
 * @author Brice Chevalier
 *
 * @desc Doubly list data structure
 *
 * Method      Time Complexity
 * ___________________________________
 *
 * add (front and back)    O(1)
 * pop (front and back)    O(1)
 * remove by reference     O(1)
 * remove                  O(n)
 * moveToBeginning         O(1)
 * moveToEnd               O(1)
 * clear                   O(n)
 *
 * Memory Complexity in O(n)
 */

function Node(column, value, previous, next) {
    this.value = value;
    this.column = column;
    this.sign = 1;

    this.previous = previous;
    this.next = next;
}

Node.prototype.set = function (column, value, previous, next) {
    this.value = value;
    this.column = column;
    this.sign = 1;

    this.previous = previous;
    this.next = next;
};


var garbage = [];
function DoublyList() {
    this.first  = null;
    this.last   = null;
}
module.exports = DoublyList;

DoublyList.prototype.addFront = function (column, value) {
    var newNode = new Node(column, value, null, this.first, this);
    if (this.first === null) {
        this.first = newNode;
        this.last  = newNode;
    } else {
        this.first.previous = newNode;
        this.first          = newNode;
    }

    return newNode;
};

DoublyList.prototype.add = DoublyList.prototype.addFront;

DoublyList.prototype.addBack = function (column, value) {
    var newNode = new Node(column, value, this.last, null, this);
    if (this.first === null) {
        this.first = newNode;
        this.last  = newNode;
    } else {
        this.last.next = newNode;
        this.last      = newNode;
    }

    return newNode;
};

DoublyList.prototype.popFront = function () {
    var object = this.first.object;
    this.removeByReference(this.first);
    return object;
};

DoublyList.prototype.pop = DoublyList.prototype.popFront;

DoublyList.prototype.popBack = function () {
    var object = this.last.object;
    this.removeByReference(this.last);
    return object;
};

DoublyList.prototype.addBefore = function (node, column, value) {
    var newNode = new Node(column, value, node.previous, node, this);

    if (node.previous !== null) {
        node.previous.next = newNode;
    }

    node.previous = newNode;

    if (this.first === node) {
        this.first = newNode;
    }

    return newNode;
};

DoublyList.prototype.addAfter = function (node, column, value) {
    var newNode = new Node(column, value, node, node.next, this);

    if (node.next !== null) {
        node.next.previous = newNode;
    }

    node.next = newNode;

    if (this.last === node) {
        this.last = newNode;
    }

    return newNode;
};

DoublyList.prototype.moveToTheBeginning = function (node) {
    if (!node) {
        return false;
    }

    if (node.previous === null) {
        // node is already the first one
        return true;
    }

    // Connecting previous node to next node
    node.previous.next = node.next;

    if (this.last === node) {
        this.last = node.previous;
    } else {
        // Connecting next node to previous node
        node.next.previous = node.previous;
    }

    // Adding at the beginning
    node.previous = null;
    node.next = this.first;
    node.next.previous = node;
    this.first = node;
    return true;
};

DoublyList.prototype.moveToTheEnd = function (node) {
    if (!node) {
        return false;
    }

    if (node.next === null) {
        // node is already the last one
        return true;
    }

    // Connecting next node to previous node
    node.next.previous = node.previous;

    if (this.first === node) {
        this.first = node.next;
    } else {
        // Connecting previous node to next node
        node.previous.next = node.next;
    }

    // Adding at the end
    node.next = null;
    node.previous = this.last;
    node.previous.next = node;
    this.last = node;
    return true;
};

DoublyList.prototype.remove = function (node) {
    if (node.next === null) {
        this.last = node.previous;
    } else {
        node.next.previous = node.previous;
    }

    if (node.previous === null) {
        this.first = node.next;
    } else {
        node.previous.next = node.next;
    }

    garbage.push(node);

    return null;
};

DoublyList.prototype.clear = function () {
    this.first  = null;
    this.last   = null;
};

DoublyList.prototype.forEach = function (processingFunc, params) {
    for (var node = this.first; node; node = node.next) {
        processingFunc(node.object, params);
    }
};

DoublyList.prototype.toArray = function () {
    var objects = [];
    for (var node = this.first; node !== null; node = node.next) {
        objects.push(node.object);
    }

    return objects;
};