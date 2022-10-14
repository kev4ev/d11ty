const fs = require('fs');
const semver = require('semver');
const path = require('path');

const PKG_PATH = `${process.cwd()}/package.json`;
const pkg = require(PKG_PATH);

// get version and increment according to semver
let version = pkg.version, 
    next = semver.inc(version, process.env.RELEASE_TYPE);

pkg.version = next;

// write back to package.json
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 4), 'utf-8');