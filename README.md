# Brushtail

Tail call optimisation for JavaScript.

## Examples

example.js:

    function count(from, to) {
        if(from >= to)
            return from;

        return count(from + 1, to);
    }

    console.log(count(0, 1000000));

Is rewritten into:

    function count(from, to) {
        var result;
        tco:
            while (true) {
                if (from >= to) {
                    result = from;
                    break tco;
                }
                {
                    (function (_from, _to) {
                        from = _from;
                        to = _to;
                    }(from + 1, to));
                    continue tco;
                }
            }
        return result;
    }
    console.log(count(0, 1000000));

Using the command-line tool:

    $ brushtail example.js | node
    1000000

For comparison, without the command-line tool:

    $ node example.js

    brushtail/example.js:1
    n (exports, require, module, __filename, __dirname) { function count(from, to)
                                                                        ^
    RangeError: Maximum call stack size exceeded

## API

### brushtail.tco(content)

Takes a JavaScript program as a String. Returns a String with a tail
call optimised program.

### brushtail.mutateAST(ast)

Takes a Mozilla Parser AST and mutates away tail calls.

### brushtail.optimizeFunction(functionDeclaration)

Takes a function declaration in Mozilla Parser AST form and mutates
away tail calls.

## License

MIT
