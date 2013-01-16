var estraverse = require('estraverse'),
    esprima = require('esprima'),
    escodegen = require('escodegen'),
    tcoLabel = {
        type: 'Identifier',
        name: 'tco'
    },
    resultIdentifier = {
        type: 'Identifier',
        name: '__tcor'
    };

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

function optimizeFunction(f) {
    var name = f.id.name,
        block = f.body;

    estraverse.replace(block, {enter: function(n) {
        if(!n || n.type != 'ReturnStatement')
            return n;

        if(n.argument.type == 'CallExpression' && n.argument.callee.name == name) {
            return tailCall(f, n);
        } else {
            return returnValue(n);
        }
    }});

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

function topLevel(f, ancestry) {
    var name = f.id.name, node;

    for(var i = ancestry.length; i; --i) {
        node = ancestry[i - 1];

        if(node.type == 'FunctionExpression') {
            return false;
        }

        if(node.type == 'FunctionDeclaration') {
            if(node.id.name == name) {
                return true;
            } else {
                return false;
            }
        }
    }

    return false;
}

function hasOnlyTailCalls(f) {
    var name = f.id.name,
        accum = {
            any: false,
            all: true
        },
        ancestry = [];

    estraverse.traverse(f, {
        enter: function(n) {
            ancestry.push(n);
            if(accum.all && n && n.type == 'ReturnStatement' && n.argument && n.argument.type == 'CallExpression' && n.argument.callee.name == name)
                accum = {
                    any: true,
                    all: accum.all && topLevel(f, ancestry)
                };
        },
        leave: function(n) {
            ancestry.pop();
        }
    });

    return accum.any && accum.all;
}

function mutateAST(ast) {
    estraverse.traverse(ast, {enter: function(n) {
        if(!n || n.type != 'FunctionDeclaration' || !hasOnlyTailCalls(n))
            return;

        optimizeFunction(n);
    }});
}

function tco(content) {
    var ast = esprima.parse(content);
    mutateAST(ast);
    return escodegen.generate(ast);
}

(function(exports) {
    exports.optimizeFunction = optimizeFunction;
    exports.mutateAST = mutateAST;
    exports.tco = tco;
})(typeof exports == 'undefined' ? this.brushtail = {} : exports);
