const fs = require('fs/promises');
const path = require('path');
const PdfWriter = require('./lib/PdfWriter');

/**
 * @typedef {import('puppeteer').PDFOptions} PDFOptions
 */

const DEF_DIR = '.d11ty_defaults';
const pageBreakCss = 
    `<style>
        @media print{
            div.d11ty-page-break{
                page-break-after: always !important;
            }
        }
    </style>
`;
const NS = `d11ty`;
const HTML_TAGS = {
    paired: new Set(require('html-tags')),
    unpaired: new Set(require('html-tags/void'))
};

// module level variables
let INPUT_RAW,
    _inputDir,
    _inputAbs,
    getInputDir = () => {
        if(!_inputDir) _inputDir = INPUT_RAW.endsWith('.md') ? path.dirname(INPUT_RAW) : INPUT_RAW;

        return _inputDir;
    },
    getInputAbs = () => {
        if(!_inputAbs) _inputAbs = path.resolve(process.cwd(), getInputDir());

        return _inputAbs;
    };

class PluginConfig{
    /**
     * constructor
     * @param {object} [config] config object
     * @param {string} [config.output] path spec to output directory when collating
     * @param {boolean} [config.explicit] when true, only files with the {% d11ty %} shortcode will be written to PDF
     * @param {boolean} [config.collate] whether html should be collated to a single file, or not
     * @param {string} [config.collateName] when collating, the name of the output PDF (defaults to "collate.pdf")
     */
    constructor(config={}){
        this.output = config.output;
        this.explicit = config.explicit;
        this.collate = config.collate;
        this.collateName = (()=>{
            let name = config.collateName;
            // default to collate.pdf
            if(!name || name.length === 0) return 'collate.pdf';
            // else remove all directory references and ensure filename ends with '.pdf'
            let rawFname = path.basename(name),
                ext = rawFname.split('.').reverse()[0];

            return rawFname === ext ? `${rawFname}.pdf` : rawFname.replace(ext, '.pdf');
        })();
    }
    
    /**
     * can only be set programmatically so property assures plugin is being utilized from CLI and not
     * as eleventy plugin
     */
    setSrcIsCli(){
        this._srcIsCli = true;
    }
    
    get srcIsCli(){
        return this._srcIsCli;
    }
}



// all filters and shortcodes
const PLUGIN_API = (()=>{
    return {
        // filters always receive a ctxt value from the plugin() fn, as well as the value that was piped to it in the template
        filters: {
            collate: function(ctxt, collection){
                let { docs, caller } = ctxt;
                let suffix = caller.split('.').reverse()[0],
                    outputPath = caller.replace(suffix, '.pdf');
                docs.add({
                    outputPath, 
                    files: collection.map(page => page.inputPath)
                });

                return outputPath;
            }
        },
        // shortcodes always receive a d11ty-created ctxt variable as first arg, if they want to use it
        shortcodes: {
            pb: () => '<div class="d11ty-page-break"></div>',
            getBulmaPath: (ctxt, version, min) =>{ // for cli use only
                if(!version) version = '0.9.4';
                if(INPUT_RAW){
                    return `http://localhost:${ctxt.writer.servePort}/.d11ty_defaults/css/bulma.${version}.css`;
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
    let { srcIsCli, collate, collateName, explicit } = pluginConfig;
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
        if(!isDryRun()) writer = new PdfWriter(srcIsCli ? getInputDir() : eleventyConfig.dir.output);
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
            let ctxt = { writer };
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

    // d11ty-* filters (note that Handlebars does not support async)
    if(filters){
        Object.keys(filters).forEach(filter => {
            let name = `${NS}-${filter}`;
            eleventyConfig.addFilter(name, async (pipedValue) => {
                let { inputPath } = this;
                let ctxt = { docs, caller: inputPath }, 
                    targetFn = filters[filter]; 

                return await targetFn(ctxt, pipedValue);
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
        // in all cases append the d11ty page break css and return content
        content = content.replace(
            '</head>',
            pageBreakCss + '</head>'
        );
        
        return content;
    });

    // after event listener, writes files to the fs
    eleventyConfig.on('eleventy.after', async function(args){
        
        if(isDryRun()) return;

        // convert docs from Set to straight Array
        docs = Array.from(docs);
        
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
            docs = docs.reduce((prev, curr)=>{
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

/**
 * 
 * @param {string} input input file or directory of markdown files to convert to PDF
 * @param {PluginConfig} pluginConfig the config options passed from command line
 */
async function runFromCli(input, pluginConfig=new PluginConfig()){
    try{
        // set pluginConfig cli invoaction
        pluginConfig.setSrcIsCli();
        // set singleton so that it can be retrieved; can only be one per process invocation
        INPUT_RAW = input;
        // dynamically import/instantiate eleventy and apply cli configs to it
        const rt = require('@11ty/eleventy');
        const eleventy = new rt(undefined, undefined, {
            configPath: `${__dirname}/${DEF_DIR}/.eleventy.default.js`, // a base config file is needed
            config: function(eleventyConfig){ // "user config"
                // add the plugin
                eleventyConfig.addPlugin(plugin, pluginConfig);
            }
        });
        // cp temporary dir with _data and _includes directories
        await manageDependencies(input);
        // add SIGINT (supported on all platforms) and process listeners to ensure temp dir is torn down in all cases
        const throwToTeardown = async (err)=>{
            await manageDependencies(input, true);

            process.exit(1);
        }
        process.on('SIGINT', async (signal, err) => await throwToTeardown(err));
        process.on('uncaughtException', async (err, origin) => await throwToTeardown(err));
        // kickoff eleventy 
        await eleventy.toNDJSON();
        // teardown temporary dir
        await manageDependencies(input, true);
    } catch(err){
        // teardown symlinks
        await manageDependencies(input, true);

        throw err;
    }
}

async function manageDependencies(input, rm){
    let linkTarget = `${getInputDir()}/${DEF_DIR}`;
    if(rm){
        await fs.rm(linkTarget, { recursive: true });
    } else{
        await fs.cp(`${__dirname}/${DEF_DIR}`, linkTarget, {
            errorOnExist: true, 
            recursive: true
        });
    }
}

module.exports = plugin;
module.exports.cli = runFromCli;
module.exports.PluginConfig = PluginConfig;
module.exports.getCliContext = () => {
    return {
        inputRaw: INPUT_RAW, 
        inputDir: getInputDir(),
        defaultsDir: DEF_DIR
    }
}