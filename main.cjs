const fs = require('fs/promises');
const fssync = require('fs');
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
    },
    getDefaultAbs = () => {
        return `${getInputAbs()}/${DEF_DIR}`;
    }

class PluginConfig{
    /**
     * constructor
     * @param {object} [config] config object
     * @param {boolean} [config.collate] whether html should be collated to a single file, or not
     * @param {string} [config.output] path spec to output directory when collating
     * @param {boolean} [config.explicit] when true, only files with the {% d11ty %} shortcode will be written to PDF
     */
    constructor(config={}){
        this.collate = config.collate;
        this.output = config.output;
        this.explicit = config.explicit;
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

    // closure variable to hold bulma css when used from command line
    let bulma = {};

    return {
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
    
    // closure variables; TODO set explicit/implicit
    let { srcIsCli, collate, explicit } = pluginConfig;
    let { output } = eleventyConfig.dir;
    let outputMode,
        implicitMode,
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
    // 'before' event listener to set closure context
    eleventyConfig.on('eleventy.before', function(args){ 
        outputMode = args.outputMode;
        if(!isDryRun()) writer = new PdfWriter(srcIsCli ? output : undefined);
    });
    
    // d11ty sync shortcodes
    let { shortcodes, filters } = PLUGIN_API;
    if(shortcodes){
        eleventyConfig.addShortcode(NS, function(cmdStr, ...rest){
            // if no cmd is provided - e.g. {% doc11ty %} in the template - invoke the "include" function
            if(!cmdStr){
                let { inputPath } = this.page;
                docs.add(inputPath);

                return '';
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

    // d11ty filters (async - note that Handlebars does not support)
    if(filters){
        eleventyConfig.addFilter(NS, async function(cmdStr, ...rest){
            let { cmd, args } = interpretCmd(cmdStr, ...rest);
            let fn = filters[cmd];
            if(args && args.length > 0){
                return await fn(...args);
            }

            return await fn();
        });
    }

    // transformer
    eleventyConfig.addTransform(NS, async function(content){
        // in all cases append the d11ty css to enable print page breaks
        content = content.replace( // TODO remove
            '</head>',
            pageBreakCss + '</head>'
        );
        
        let { inputPath, outputPath } = this;

        if(isDryRun() || ignores.has(inputPath)) return content;

        if(outputPath && outputPath.endsWith('.html') && content){
            // generate PDFs async and do not await each result; will Promise.all() in 'eleventy-after' listener
            bufferMap.set(inputPath, writer.getPdfBuffer(content, pluginConfig.pdfOptions));
        }

        return content;
    });

    // after event listener; again, arrow function to maintain closure var access
    eleventyConfig.on('eleventy.after', async function(args){

        if(isDryRun()) return; // do not create PDFs on dry run

        let { results } = args;
        
        // ensure all pdf buffers have resolved
        let buffers = await Promise.all(bufferMap.values());
        let docs = {},
            ctr = 0;
        for(let inputPath of Array.from(bufferMap.keys())){
            docs[inputPath] = buffers[ctr];
            ctr++;
        }
        
        let filename;
        if(!results || results.length === 0){ // just write the PDFs to their corresponding input path
            for(let inputPath in docs){
                filename = inputPath.replace('.md', '.pdf');
                await writer.writePdfToFs(filename, docs[inputPath]);
            }
        } else{
            for(let result of results){
                let { inputPath, outputPath } = result;
                if(docs[inputPath]){
                    filename = outputPath.replace('.html', '.pdf');
                    await writer.writePdfToFs(filename, docs[inputPath]);
                }
            }
        }

        // TODO handle collate here via pdf-lib
    });
}

/**
 * 
 * @param {string} input input file or directory of markdown files to convert to PDF
 * @param {object} [flags] options and args passed from a CLI invocation
 * @param {string} [flags.output] output directory where PDF file(s) should be generated
 * @param {boolean} [flags.collate] when true, output files should be collated into a single file
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
            config: function(eleventyConfig){ // cli config, adds plugin
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
        // convert files to stream and convert to pdf with puppeteer
        let { html } = pluginConfig;
        html ? await eleventy.write() : await eleventy.toNDJSON();
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