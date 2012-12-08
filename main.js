#!/usr/bin/env node
var brushtail = require('./index'),
    fs = require('fs'),
    content = fs.readSync(process.stdin.fd, 102400, 'utf8')[0];

process.stdin.resume();

console.log(brushtail.tco(content));
