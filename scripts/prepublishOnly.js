const fs = require('fs');
const semver = require('semver');
const path = require('path');

// get package.js
const PKG_PATH = `${process.cwd()}/package.json`;
let package = fs.readFileSync(PKG_PATH, 'utf-8'),
    obj = JSON.parse(package),
    version = obj.version, 
    next = semver.inc(version, process.env.RELEASE_TYPE);

obj.version = next;

fs.writeFileSync(PKG_PATH, JSON.stringify(obj), 'utf-8');