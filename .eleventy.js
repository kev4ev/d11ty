const d11ty = require('d11ty');
const { EleventyHtmlBasePlugin } = require('@11ty/eleventy');

const input = 'examples/eleventy-plugin/sitedocs';

module.exports = function(eleventyConfig){
    // passthrough copy
    eleventyConfig.addPassthroughCopy(`${input}/.nojekyll`);
    eleventyConfig.addPassthroughCopy(`${input}/public`);
    // add plugins
    eleventyConfig.addPlugin(d11ty, {
        pdfOptions: {
            format: 'letter'
        },
        serverOptions: { // included for example purposes
            waitUntil: 'domcontentloaded',
            waitBeforeCapture: 0 
        }
    });
    eleventyConfig.addPlugin(EleventyHtmlBasePlugin);
    return {
        dir: {
            input,
            output: 'docs'
        },
        markdownTemplateEngine: 'njk', 
        htmlTemplateEngine: 'njk', 
        pathPrefix: '/d11ty/'
    }
}