#!/usr/bin/env node
var brushtail = require('./index'),
    fs = require('fs'),
    content;

process.stdin.resume();

if(process.argv.length > 2) {
    content = fs.readFileSync(process.argv[2], 'utf8');
} else {
    content = fs.readSync(process.stdin.fd, 102400, 'utf8')[0];
}
console.log(brushtail.tco(content));

process.stdin.pause();
