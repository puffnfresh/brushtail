var traverse = require('traverse'),
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
    this.update({
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
    });
}

function tailCall(f, r) {
    var functionExpression = {
            type: 'FunctionExpression',
            params: [],
            body: {
                type: 'BlockStatement',
                body: []
            }
        },
        i,
        identifier;

    for(i = 0; i < f.params.length; i++) {
        identifier = {
            type: 'Identifier',
            name: '_' + f.params[i].name
        };
        functionExpression.params.push(identifier);
        functionExpression.body.body.push({
            type: 'ExpressionStatement',
            expression: {
                type: 'AssignmentExpression',
                operator: '=',
                left: f.params[i],
                right: identifier
            }
        });
    }

    this.update({
        type: 'BlockStatement',
        body: [{
            type: 'ExpressionStatement',
            expression: {
                type: 'CallExpression',
                callee: functionExpression,
                arguments: r.argument.arguments
            }
        }, {
            type: 'ContinueStatement',
            label: tcoLabel
        }]
    });
}

function optimizeFunction(f) {
    var name = f.id.name,
        block = f.body;

    traverse(block.body).forEach(function(n) {
        if(!n || n.type != 'ReturnStatement')
            return;

        if(n.argument.type == 'CallExpression' && n.argument.callee.name == name) {
            tailCall.call(this, f, n);
        } else {
            returnValue.call(this, n);
        }
    });

    block.body = [{
        type: 'VariableDeclaration',
        declarations: [{
            type: 'VariableDeclarator',
            id: resultIdentifier,
            init: null
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

function topLevel(f, n) {
    var name = f.id.name,
        parent = n;

    while(parent) {
        if(parent.node.type == 'FunctionExpression') {
            return false;
        }

        if(parent.node.type == 'FunctionDeclaration') {
            if(parent.node.id.name == name) {
                return true;
            } else {
                return false;
            }
        }

        parent = parent.parent;
    }

    return false;
}

function hasOnlyTailCalls(f) {
    var name = f.id.name,
        result = traverse(f).reduce(function(accum, n) {
            if(!accum.all || !n || n.type != 'CallExpression' || n.callee.name != name)
                return accum;

            return {
                any: true,
                all: accum.all && this.parent.node.type == 'ReturnStatement' && topLevel(f, this)
            };
        }, {
            any: false,
            all: true
        });

    return result.any && result.all;
}

function mutateAST(ast) {
    traverse(ast).forEach(function(n) {
        if(!n || n.type != 'FunctionDeclaration' || !hasOnlyTailCalls(n))
            return;

        optimizeFunction(n);
    });
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
