const fs = require('fs');
const semver = require('semver');

// get package.js
const PKG_PATH = '../package.json';
let package = fs.readFileSync(PKG_PATH),
    obj = JSON.parse(package),
    version = obj.version, 
    next = semver.inc(version, process.env.RELEASE_TYPE);

obj.version = next;

fs.writeFileSync(PKG_PATH, JSON.stringify(obj), 'utf-8');