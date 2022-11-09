/**
 * singleton module that enables INPUT_RAW to be written one time and then 
 * exposes directory information based on it; used when d11ty invoked from 
 * command-line only.
 */
const path = require('path');
const { DEF_DIR } = require('./CONSTANTS');

const defaultsDirName = () => DEF_DIR;
const defaultsFileName = () => '.eleventy.default.js';
const defaultsDirectoryAbsolute = () => path.resolve(__dirname, '..', defaultsDirName());
const defaultsFileAbsolute = () => `${defaultsDirectoryAbsolute()}/${defaultsFileName()}`;
let INPUT_RAW;
const inputRelative = () => INPUT_RAW.endsWith('.md') ? path.dirname(INPUT_RAW) : INPUT_RAW;
const inputAbsolute = () => path.resolve(process.cwd(), inputRelative());

function setCliContext(rawInput){
    if(INPUT_RAW) throw new Error(`Raw input has already been set to ${INPUT_RAW}`);
    INPUT_RAW = rawInput;

    return getCliContext();
}

function getCliContext(){
    if(!INPUT_RAW) throw new Error('You must first set context via setCliContext() before calling this fn');

    return {
        inputRaw(){
            return INPUT_RAW
        }, 
        inputRelative,
        inputAbsolute,
        defaultsDirName,
        defaultsDirectoryAbsolute,
        defaultsFileName,
        defaultsFileAbsolute
    }
}

module.exports = {
    setCliContext, 
    getCliContext
}
