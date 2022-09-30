const path = require('path');
const { getWriter } = require('./lib/PdfWriter');
const PluginConfig = require('./lib/PluginConfig');
const { CLASS_NO_PRINT, CLASS_PAGE_BREAK, D11TY_CSS, HTML_TAGS, NS } = require('./lib/CONSTANTS');

/**
 * @typedef {import('puppeteer').PDFOptions} PDFOptions
 */

// all filters and shortcodes
const PLUGIN_API = (()=>{
    return {
        // filters always receive a ctxt value from the plugin() fn, as well as the value that was piped to it in the template
        filters: {
            collate(ctxt, pages, outName){
                if(!outName) throw new Error('You need to provide a unique name for your collated file');
                let { docs, ignores, caller } = ctxt;
                let { outputPath } = caller;
                let inName = path.basename(outputPath);
                outName = outName.trim().split('/').reverse()[0];
                outName = outName.endsWith('.pdf') ? outName : `${outName}.pdf`;
                outputPath = outputPath.replace(inName, outName);
                // filter ignored pages and add each page to docs
                pages = pages.map(page => page.inputPath).filter(inputPath => !ignores.has(inputPath));
                pages.forEach(inputPath => {
                    docs.add(inputPath);
                });
                // add the collation object
                let collate = {
                    outputPath, 
                    files: pages
                };
                docs.add(collate);

                return `./${outName}`;
            }
        },
        // shortcodes always receive a d11ty-created ctxt variable as first arg, if they want to use it
        shortcodes: {
            pb: () => `<div class="${CLASS_PAGE_BREAK}"></div>`,
            noPrint: ()=> CLASS_NO_PRINT,
            getBulmaPath(ctxt, version, min){ // for cli use only
                if(!version) version = '0.9.4';
                let { srcIsCli, writer } = ctxt;
                if(srcIsCli){
                    return `http://localhost:${writer.servePort}/.d11ty_defaults/css/bulma.${version}.css`;
                } else{
                    throw new Error('Shortcode "getBulmaPath" may only be used in CLI context');
                }
            }
        }
    }
})();

/**
 * inspects the raw command passed to the shortcode or filter, and returns structured object
 * @param {string} cmdStr the raw argument passed to a shortcode or filter
 * @return {object} CmdStruct
 */
function interpretCmd(cmdStr, ...rest){
    let cmd, args;
    if(rest && rest.length > 0){
        cmd = cmdStr;
        args = rest;
    } else{
        args = cmdStr.trim().split(' ').filter(cmd => cmd && cmd.length > 0);
        cmd = args.shift();
    }

    return {
        cmd,
        args
    }
}

/**
 * 
 * @param {object} eleventyConfig eleventyConfiguration
 * @param {PluginConfig} pluginConfig d11ty configuration
 * @returns 
 */
function plugin(eleventyConfig, pluginConfig=new PluginConfig()){
    
    // closure variables
    let { srcIsCli, cliContext, collate, collateName, explicit } = pluginConfig;
    let implicitMode = srcIsCli && !explicit,
        outputMode,
        isDryRun = ()=>{
            return outputMode !== 'fs' && !srcIsCli;
        };
    let bufferMap = new Map(),
        docs = new Set(),
        ignores = new Set();
    /**
     * @type {PdfWriter}
     */
    let writer;
    let { pdfOptions } = pluginConfig;

    // 'before' event listener to set closure context
    eleventyConfig.on('eleventy.before', function(args){ 
        outputMode = args.outputMode;
        if(!isDryRun()) writer = getWriter(srcIsCli ? cliContext.inputAbsolute() : eleventyConfig.dir.output);
    });
    
    // d11ty sync shortcodes
    let { shortcodes, filters } = PLUGIN_API;
    if(shortcodes){
        eleventyConfig.addShortcode(NS, function(cmdStr, ...rest){
            // if no cmd is provided - e.g. {% doc11ty %} in the template - invoke the "include" function
            if(!cmdStr){
                let { inputPath, outputPath } = this.page;
                docs.add(inputPath);

                // return the name of the pdf back to caller
                return path.basename(outputPath).replace('.html', '.pdf');
            }
            // else command / args provided
            let { cmd, args } = interpretCmd(cmdStr, ...rest);
            // get the function and bind closure variables
            let fn = shortcodes[cmd];
            // call function, always passing d11ty context as first arg
            let ctxt = { srcIsCli, writer };
            if(args && args.length > 0){
                return fn(ctxt, ...args);
            }
            
            return fn(ctxt);
        });
    }

    // nod11ty shortcode to ensure d11ty ignores a file
    eleventyConfig.addShortcode(`no${NS}`, function(){
        let { inputPath } = this.page;
        ignores.add(inputPath);

        return '';
    });

    // _d11ty paired shortcode
    eleventyConfig.addPairedShortcode(`_${NS}`, function(content, ...rest){
        rest = rest.length > 1 ? rest : rest[0].split(' ').map(str => str.trim()).filter(str => str.length > 0);
        let first = rest[0];
        let explicitTag = HTML_TAGS.paired.has(first) || HTML_TAGS.unpaired.has(first) ? rest.shift() : undefined;
        let unpairedTag = explicitTag ? HTML_TAGS.unpaired.has(explicitTag) : undefined;
        const classReducer = (prev, curr)=>{
            if(curr) prev = prev + ' ' + curr; 

            return prev;
        }

        let tag = explicitTag ? explicitTag : 'div',
            wrapper = `<${tag} class="${rest.reduce(classReducer, '')}" ${unpairedTag ? '/' : ''}>{{content}}${unpairedTag ? '' : `</${tag}>`}`
            changed = wrapper.replace('{{content}}', content);

        return changed;
    });

    // _nod11ty paired shortcode, wrapped content will not appear when 
    eleventyConfig.addPairedShortcode(`_no${NS}`, function(content, tag='div'){
        return `<${tag} class="${CLASS_NO_PRINT}">${content}</${tag}>`
    });

    // d11ty-* filters (note that Handlebars does not support async)
    if(filters){
        Object.keys(filters).forEach(filter => {
            let name = `${NS}_${filter}`;
            eleventyConfig.addFilter(name, function(pipedValue, ...rest){
                let { inputPath, outputPath } = this.ctx.page;
                let ctxt = {
                    docs, 
                    ignores, 
                    caller: { 
                        inputPath, 
                        outputPath
                    } 
                }; 
                let targetFn = filters[filter]; 

                return targetFn(ctxt, pipedValue, ...rest);
            });
        });
    }

    // transformer
    eleventyConfig.addTransform(NS, async function(content){
        // only add docs in the transform if running from CLI and in implicit mode or doc explicitly added to docs
        if(srcIsCli){
            let { inputPath, outputPath } = this;
    
            let eligible = !isDryRun() && outputPath && outputPath.endsWith('.html') && !ignores.has(inputPath),
                writeNow = eligible && (implicitMode || docs.has(inputPath));
    
            if(writeNow){
                docs.add(inputPath);
                bufferMap.set(inputPath, writer.getPdfBuffer(content, pdfOptions));
            }
        }
        // in all cases append the css needed to apply d11ty styling
        content = content.replace(
            '</head>',
            D11TY_CSS + '</head>'
        );
        
        return content;
    });

    // after event listener, writes files to the fs
    eleventyConfig.on('eleventy.after', async function(args){
        
        if(isDryRun()) return;
        
        // if src is not cli then begin buffering all docs that need to be written
        let { results } = args;
        let resultHash;
        if(!srcIsCli && results && results.length > 0){
            // convert to a hash map
            resultHash = results.reduce((prev, curr)=>{
                if(curr && curr.inputPath){
                    let { inputPath } = curr;
                    prev[inputPath] = curr;
                }

                return prev;
            }, {});
            // iterate docs and add to buffermap from results
            for(let doc of docs){
                // skip all collates (objects)
                if(typeof doc !== 'string' || !resultHash[doc]) continue;
                let { url } = resultHash[doc];
                // url = url.endsWith('.html') ? url : url + 'index.html';
                bufferMap.set(doc, writer.getPdfBuffer(url, pdfOptions, true));
            }
        }

        // wait for all pdf buffers have resolved and reconstitute a hash
        let buffers = await Promise.all(bufferMap.values()); 
        let fileHash = Array.from(bufferMap.keys()).reduce((prev, curr, index) => {
            if(curr) prev[curr] = buffers[index];

            return prev;
        }, {});
        
        // if srcIsCli and collate option passed, flatten docs to a single-item array
        if(srcIsCli && collate){
            let initial = { outputPath: `${getInputAbs()}/${collateName}`, files: [] };
            docs = Array.from(docs).reduce((prev, curr)=>{
                if(curr) prev[0].files.push(curr);

                return prev;
            }, [initial]);
        }

        // iterate docs and write to the fs at appropriate locations
        let filename;
        for(let doc of docs){
            let buffer = fileHash[doc];
            if(typeof doc === 'string'){
                filename = (()=>{
                    if(srcIsCli) return doc.replace('.md', '.pdf');

                    let { outputPath } = resultHash[doc];
                    return outputPath.replace('.html', '.pdf');
                })();
                await writer.writePdfToFs(filename, buffer);
            } else if(typeof doc === 'object'){ // collate
                let { outputPath, files } = doc;
                let buffers = files.map(file => fileHash[file]);
                await writer.collate(buffers, outputPath);
            }
        }
    });
}

module.exports = plugin;