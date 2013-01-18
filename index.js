var estraverse = require('estraverse'),
    tcoLabel = {
        type: 'Identifier',
        name: 'tco'
    },
    resultIdentifier = {
        type: 'Identifier',
        name: '__tcor'
    };

function equals(a, b, s) {
    var equal,
        k;

    if(typeof a != typeof b)
        return false;

    if(typeof a == 'object' || typeof a == 'array') {
        equal = true;

        for(k in a) {
            equal = equal && equals(a[k], b[k], s);
        }

        for(k in b) {
            equal = equal && equals(a[k], b[k], s);
        }

        return equal;
    }

    return a === b;
}

function nodeAncestry(f, ast) {
    var ancestry = [],
        result;

    estraverse.traverse(ast, {
        enter: function(n) {
            if(n == f) result = ancestry.slice();
            if(result) return;

            ancestry.push(n);
        },
        leave: function() {
            ancestry.pop();
        }
    });

    return result;
}

function returnValue(r) {
    return {
        type: 'BlockStatement',
        body: [{
            type: 'ExpressionStatement',
            expression: {
                type: 'AssignmentExpression',
                operator: '=',
                left: resultIdentifier,
                right: r.argument
            }
        }, {
            type: 'BreakStatement',
            label: tcoLabel
        }]
    };
}

function isFunctionNode(n) {
    return ['FunctionDeclaration', 'FunctionExpression'].indexOf(n.type) != -1;
}

function tailCall(f, r) {
    var tmpVars = [],
        assignments = [],
        i,
        identifier;

    for(i = 0; i < f.params.length; i++) {
        identifier = {
            type: 'Identifier',
            name: '__' + f.params[i].name
        };
        tmpVars.push({
            type: 'VariableDeclarator',
            id: identifier,
            init: r.argument['arguments'][i]
        });
        assignments.push({
            type: 'ExpressionStatement',
            expression: {
                type: 'AssignmentExpression',
                operator: '=',
                left: f.params[i],
                right: identifier
            }
        });
    }

    return {
        type: 'BlockStatement',
        body: [{
            type: 'VariableDeclaration',
            declarations: tmpVars,
            kind: 'var'
        }].concat(assignments).concat({
            type: 'ContinueStatement',
            label: tcoLabel
        })
    };
}

function optimizeFunction(f, ast) {
    var id = functionId(f, ast),
        block = f.body,
        ancestry = [];

    estraverse.replace(block, {
        enter: function(n) {
            ancestry.push(n);

            if(!n || n.type != 'ReturnStatement')
                return n;

            for(i = ancestry.length - 1; i >= 0; i--) {
                if(isFunctionNode(ancestry[i]))
                    return;
            }

            if(n.argument.type == 'CallExpression' && equals(n.argument.callee, id)) {
                return tailCall(f, n);
            } else {
                return returnValue(n);
            }
        },
        leave: function(n) {
            ancestry.pop();
        }
    });

    block.body = [{
        type: 'VariableDeclaration',
        declarations: [{
            type: 'VariableDeclarator',
            id: resultIdentifier
        }],
        kind: 'var'
    }, {
        type: 'LabeledStatement',
        label: tcoLabel,
        body: {
            type: 'WhileStatement',
            test: {
                type: 'Literal',
                value: true
            },
            body: {
                type: 'BlockStatement',
                body: block.body
            }
        }
    }, {
        type: 'ReturnStatement',
        argument: resultIdentifier
    }];
}

function topLevel(n, ast) {
    var ancestry = nodeAncestry(n, ast),
        node,
        i;

    for(i = ancestry.length - 1; i >= 0; --i) {
        node = ancestry[i];

        if(isFunctionNode(node)) {
            return equals(functionId(node, ast), n.argument.callee);
        }
    }

    return false;
}

function functionId(f, ast) {
    var ancestry,
        parent;

    if(f.type == 'FunctionDeclaration') {
        return f.id;
    }

    ancestry = nodeAncestry(f, ast);
    parent = ancestry[ancestry.length - 1];
    if(parent.type == 'VariableDeclarator') {
        return parent.id;
    } else if(parent.type == 'AssignmentExpression') {
        return parent.left;
    }
}

function hasOnlyTailCalls(f, ast) {
    var accum = {
            any: false,
            all: true
        },
        ancestry = [];

    estraverse.traverse(f, {
        enter: function(n) {
	    var id;

            ancestry.push(n);

	    if(!accum.all) return;
	    if(n.type != 'ReturnStatement') return;
	    if(!n.argument) return;
	    if(n.argument.type != 'CallExpression') return;

	    id = functionId(f, ast);

	    if(!id || !equals(n.argument.callee, id)) return;

            accum = {
                any: true,
                all: accum.all && topLevel(n, ast)
            };
        },
        leave: function(n) {
            ancestry.pop();
        }
    });

    return accum.any && accum.all;
}

function mutateAST(ast) {
    estraverse.traverse(ast, {
        enter: function(n) {
            if(!isFunctionNode(n) || !hasOnlyTailCalls(n, ast))
                return;

            optimizeFunction(n, ast);
        }
    });
}

function tco(content) {
    var esprima = require('esprima'),
        escodegen = require('escodegen'),
        ast = esprima.parse(content);

    mutateAST(ast);

    return escodegen.generate(ast);
}

(function(exports) {
    exports.optimizeFunction = optimizeFunction;
    exports.mutateAST = mutateAST;
    exports.tco = tco;
})(typeof exports == 'undefined' ? this.brushtail = {} : exports);
