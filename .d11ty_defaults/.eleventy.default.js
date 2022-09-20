const { getCliContext } = require('../main.cjs');

// sets a default config for when d11ty is invoked from cli
module.exports = function(eleventyConfig){
    let { inputRaw, inputDir, defaultsDir } = getCliContext();
    return {
        dir: {
            input: inputRaw,
            output: inputDir,
            data: `${defaultsDir}/_data`, 
            includes: `${defaultsDir}/_includes`
        },
        htmlTemplateEngine: 'njk',
        markdownTemplateEngine: 'njk'
    }
}