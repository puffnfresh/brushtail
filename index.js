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

function traverseWithStack(t, o) {
    var stack = [];
    estraverse.traverse(t, {
        enter: function(n) {
            stack.unshift(n);
            if(o.enter) o.enter(n, stack);
        },
        leave: function(n) {
            stack.shift();
            if(o.leave) o.leave(n, stack);
        }
    });
}

function nodeStack(top, f) {
    var result = [];
    traverseWithStack(top, {
        enter: function(n, stack) {
            if(n != f)
                return;

            result = stack.slice();
        }
    });
    return result;
}

function isFunctionNode(n) {
    return ['FunctionDeclaration', 'FunctionExpression'].indexOf(n.type) != -1;
}

function returnValue(r, stack) {
    r.type =  'BlockStatement';
    r.body = [{
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
    }];
}

function tailCall(f, r, stack) {
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

    r.type = 'BlockStatement';
    r.body = [{
        type: 'VariableDeclaration',
        declarations: tmpVars,
        kind: 'var'
    }].concat(assignments).concat({
        type: 'ContinueStatement',
        label: tcoLabel
    });
}

function optimizeFunction(top, f) {
    var block = f.body,
        traversal = {
            enter: function(n, stack) {
                var i;

                if(n.type != 'ReturnStatement')
                    return;

                for(i = 0; i < stack.length; i++) {
                    if(isFunctionNode(stack[i]))
                        return;
                }

                if(n.argument.type == 'CallExpression' && equals(n.argument.callee, functionId(top, f))) {
                    tailCall(f, n, stack);
                } else {
                    returnValue(n, stack);
                }
            }
        },
        i;

    for(i = 0; i < block.body.length; i++) {
        traverseWithStack(block.body[i], traversal);
    }

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

function topLevel(top, n) {
    var stack = nodeStack(top, n),
        i;

    for(i = 0; i < stack.length; i++) {
        if(stack[i].type == 'FunctionExpression') {
            if(stack[i + 1].type == 'VariableDeclarator') {
                return equals(stack[i + 1].id, n.callee);
            } else if(stack[i + 1].type == 'AssignmentExpression') {
                return equals(stack[i + 1].left, n.callee);
            }
            return false;
        } else if(stack[i].type == 'FunctionDeclaration') {
            return equals(stack[i].id, n.callee);
        }
    }
}

function functionId(top, f) {
    var stack;
    if(f.type == 'FunctionDeclaration') {
        return f.id;
    }

    stack = nodeStack(top, f);
    if(stack[1].type == 'VariableDeclarator') {
        return stack[1].id;
    } else {
        return stack[1].left;
    }
}

function hasOnlyTailCalls(top, f) {
    var all = true,
        any = false,
        result = traverseWithStack(f, {
            enter: function(n, stack) {
                var id;

                if(!all || n.type != 'CallExpression')
                    return;

                id = functionId(top, f);

                if(!id || !equals(n.callee, id))
                    return;

                any = true;
                all = all && stack[1].type == 'ReturnStatement' && topLevel(top, n);
            }
        });

    return any && all;
}

function mutateAST(ast) {
    estraverse.traverse(ast, {
        enter: function(n) {
            if(!isFunctionNode(n) || !hasOnlyTailCalls(ast, n))
                return;

            optimizeFunction(ast, n);
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
