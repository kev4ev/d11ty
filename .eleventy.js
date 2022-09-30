const d11ty = require('d11ty');

const input = 'examples/eleventy-plugin/sitedocs';

module.exports = function(eleventyConfig){
    // passthrough copy
    eleventyConfig.addPassthroughCopy(`${input}/.nojekyll`);
    eleventyConfig.addPassthroughCopy(`${input}/public`);
    // add plugins
    eleventyConfig.addPlugin(d11ty);
    return {
        dir: {
            input,
            output: 'docs'
        },
        // set nunjucks as default engine
        markdownTemplateEngine: 'njk', 
        htmlTemplateEngine: 'njk'
    }
}