#!/usr/bin/env node
var brushtail = require('./index'),
    fs = require('fs'),
    args = process.argv.slice(2),
    ast = false,
    content,
    result;

if(args.length && args[0] == '-c') {
    ast = true;
    args.shift();
}

if(args.length) {
    content = fs.readFileSync(args[0], 'utf8');
} else {
    process.stdin.resume();
    content = fs.readSync(process.stdin.fd, 102400, 'utf8')[0];
    process.stdin.pause();
}

if(ast) {
    content = JSON.parse(content);
    brushtail.mutateAST(content);
    result = JSON.stringify(content);
} else {
    result = brushtail.tco(content);
}

console.log(result);
