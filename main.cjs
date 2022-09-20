const puppeteer = require('puppeteer');
const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');

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

// module level variables
let ppt; // puppeteer
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
     * @param {boolean} [config.html] when true, will also generate PDF output (ignored when not used from CLI)
     * @param {boolean} [config.collate] whether html should be collated to a single file, or not
     * @param {string} [config.output] path spec to output directory when collating
     */
    constructor(config={}){
        this.collate = config.collate;
        this.output = config.output;
        this.html = config.html;
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

/**
 * 
 * @param {string} htmlContent the html content that will be written to PDF
 * @param {PDFOptions} [pdfOptions] puppeteer PDFOptionsclass
 * @returns 
 */
async function getPdfBuffer(htmlContent, pdfOptions, headless=true){
    if(!pdfOptions){
        // set default
        pdfOptions = { 
            printBackground: true,
            layout: 'Letter',
            margin: {
                top: '.25in', 
                bottom: '.25in'
            }
        };
    }

    // init puppeteer if this is first fn invocation
    if(!ppt){
        ppt = await puppeteer.launch({
            headless
        });
    }

    // create puppeteer page instance
    let page = await ppt.newPage(); // TODO use single page?
    await page.setContent(htmlContent, {
        waitUntil: 'networkidle2'
    });
    
    // page.pdf returns Promise<Buffer>
    return await page.pdf(pdfOptions);
}

async function writePdfToFs(filePath, bufferArray, encoding='utf-8'){
    await fs.writeFile(filePath, bufferArray, encoding);
}

// all filters and shortcodes
const PLUGIN_API = (()=>{

    // closure variable to hold bulma css when used from command line
    let bulma = {};

    return {
        shortcodes: {
            pb: () => '<div class="d11ty-page-break"></div>',
            getBulma: (version, min) =>{ // this filter is meant only for CLI layouts
                if(!version) version = '0.9.4';
                if(INPUT_RAW){
                    if(!bulma[version]){
                        let bulmaAbs = `${getDefaultAbs()}/css/bulma.${version}.${min ? 'min.' : ''}css`;

                        bulma[version] = fssync.readFileSync(bulmaAbs, 'utf-8');
                    }
    
                    return bulma[version];
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
        args = cmdStr.trim().split(' ').filter(cmd => cmd);
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
function plugin(eleventyConfig, pluginConfig){
    
    // closure variables
    let { srcIsCli, collate } = pluginConfig;
    let outputMode,
    writePdf = ()=>{
        return outputMode === 'fs' || srcIsCli; // if cli-invoked and --html flag passed, outputMode will be 'fs'
    }, 
    dir;
    let docMap = new Map();
    
    // implement a pseudo ns for all shortcodes and filters; async shortcodes have separate API
    let { shortcodes, filters } = PLUGIN_API;
    if(shortcodes){
        eleventyConfig.addShortcode(NS, function(cmdStr, ...rest){
            let { cmd, args } = interpretCmd(cmdStr, rest);
            let fn = shortcodes[cmd];
            if(args && args.length > 0){
                return fn(...args);
            }
            
            return fn();
        });
    }
    if(filters){
        eleventyConfig.addFilter(NS, async function(cmdStr, ...rest){
            let { cmd, args } = interpretCmd(cmdStr, rest);
            let fn = filters[cmd];
            if(args && args.length > 0){
                return await fn(...args);
            }

            return await fn();
        });
    }

    // paired d11ty shortcodes
    eleventyConfig.addPairedShortcode(NS, function(content, ...rest){
        const classReducer = (prev, curr)=>{
            if(curr) prev = prev + ' ' + curr; 

            return prev;
        }
        let changed = `<div class="${rest.reduce(classReducer, '')}">${content}</div>`;

        return changed;
    });
    
    
    // 'before' event listener to set closure context including output mode
    eleventyConfig.on('eleventy.before', function(args){ 
        outputMode = args.outputMode;
        dir = args.dir;
    });

    // transformer
    eleventyConfig.addTransform(NS, async function(content){
        // in all cases append the d11ty css to enable print page breaks
        content = content.replace(
            '</head>',
            pageBreakCss + '</head>'
        );

        if(!writePdf()) return content;
        
        let { inputPath, outputPath } = this;

        if(outputPath && outputPath.endsWith('.html') && content){
            // generate PDFs async and do not await each result; will Promise.all() in 'eleventy-after' listener
            docMap.set(inputPath, getPdfBuffer(content, pluginConfig.pdfOptions));
        }

        return content;
    });

    // after event listener; again, arrow function to maintain closure var access
    eleventyConfig.on('eleventy.after', async function(args){
        let { results } = args;
        
        // ensure all pdf buffers have resolved
        let buffers = await Promise.all(docMap.values());
        let docs = {},
            ctr = 0;
        for(let inputPath of Array.from(docMap.keys())){
            docs[inputPath] = buffers[ctr];
            ctr++;
        }
        
        let filename;
        if(!results || results.length === 0){ // just write the PDFs to their corresponding input path
            for(let inputPath in docs){
                filename = inputPath.replace('.md', '.pdf');
                await writePdfToFs(filename, docs[inputPath]);
            }
        } else{
            for(let result of results){
                let { inputPath, outputPath } = result;
                if(docs[inputPath]){
                    filename = outputPath.replace('.html', '.pdf');
                    await writePdfToFs(filename, docs[inputPath]);
                }
            }
        }

        // TODO handle collate here via pdf-lib
        
        // close ppt
        if(ppt){
            await ppt.close();
        }
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