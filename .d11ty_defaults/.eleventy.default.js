const ctxt = require('../lib/cliContext').getCliContext();

// sets a default config for when d11ty is invoked from cli
module.exports = function(eleventyConfig){
    let inputRaw = ctxt.inputRaw(), 
        inputDir = ctxt.inputAbsolute(), 
        defaultsDirName = ctxt.defaultsDirName();
    return {
        dir: {
            input: inputRaw,
            output: inputDir,
            data: `${defaultsDirName}/_data`, 
            includes: `${defaultsDirName}/_includes`
        },
        htmlTemplateEngine: 'njk',
        markdownTemplateEngine: 'njk'
    }
}