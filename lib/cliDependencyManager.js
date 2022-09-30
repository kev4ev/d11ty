const fs = require('fs/promises');
const { inputAbsolute, defaultsDirName, defaultsDirectoryAbsolute } = require('./cliContext').getCliContext();
const linkTarget = `${inputAbsolute()}/${defaultsDirName()}`;
const defaultsDir = defaultsDirectoryAbsolute();

async function manageDependencies(rm){
    if(rm){
        await fs.rm(linkTarget, { recursive: true });
    } else{
        await fs.cp(defaultsDir, linkTarget, {
            errorOnExist: true, 
            recursive: true
        });
    }
}

module.exports = {
    manageDependencies
}