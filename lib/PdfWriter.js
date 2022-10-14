/**
 * This module is responsible for creating PDF buffers using headless puppeteer, and
 * then writing those buffers to the filesystem. Additionally, it exports the ability
 * to create collated PDFs and write that to the file system, as well.
 */

const puppeteer = require('puppeteer');
const fs = require('fs/promises');
const pdfLib = require('pdf-lib');
const server = require('@11ty/eleventy-dev-server');
const path = require('path');
const { setTimeout } = require('node:timers/promises');
const getServePort = require('./getServePort');

class PdfWriter{

    /**
     * @param {string} servePath path to the directory that will be used to serve html that puppeteer will write to PDF;
     * @param {object} eleventyConfig passthrough of config when in plugin mode
     * @param {import('./PluginConfig').PluginConfig} pluginConfig passthrough of pluginconfig
     */
    constructor(servePath, eleventyConfig, pluginConfig){
        this.pathPrefix = eleventyConfig ? eleventyConfig.pathPrefix : '/';
        this.servePath = servePath;
        this._pdfOptions = pluginConfig.pdfOptions;
        this._serverOptions = pluginConfig.serverOptions;
    }

    set servePath(val){
        this._servePath = val;
        this.server = server.getServer('d11ty-server', val, { pathPrefix: this.pathPrefix });
        // rely upon the normalized path prefix of the dev server
        this.pathPrefix = this.server.options.pathPrefix;
    }

    get servePath(){
        return this._servePath;
    }

    get servePort(){
        return this._servePort;
    }

    async serve(){
        // get next available serve port in the event multiple dev servers running concurrently
        this._servePort = await getServePort();
        // launch dev server
        this.server.serve(this._servePort);
        // launch puppeteer
        this._ppt = await puppeteer.launch({
            headless: process.env.SHOWPPT ? false : true
        });
    }

    /**
     * 
     * @param {string} htmlContentOrUrl the html content that will be written to PDF
     * @param {boolean} isRelUrl when true the server will attempt to load from the provided relative url; 
     * @param {PDFOptions} [pdfOptions] puppeteer PDFOptions; defaults to server's configured options
     * @param {ServerOptions} [serverOptions] puppeteer PDFOptions; defaults to server's configured options
     * default is false, meaning first arg will be treated as passthrough HTML.
     * @returns {PdfProxy} instance of PdfProxy
     */
    async getPdfBuffer(htmlContentOrUrl, isRelUrl, pdfOptions={}, serverOptions={}){
        // apply target-specific pdfOptions and serverOptions atop server defaults
        let _serverOptions = Object.assign({}, this._serverOptions, serverOptions),
            _pdfOptions = Object.assign({}, this._pdfOptions, pdfOptions);

        let { waitUntil } = _serverOptions;
        waitUntil = waitUntil ? waitUntil : 'load';
        // create puppeteer page instance
        let page = await this._ppt.newPage();
        await page.setViewport({
            width: 1024, 
            height: 768
        });
        if(isRelUrl){
            let outputSource = htmlContentOrUrl, 
                fullPath = `http://localhost:${this._servePort}${this.pathPrefix}${outputSource.startsWith('/') ? outputSource.replace('/', '') : outputSource}`;
            await page.goto(fullPath, {
                waitUntil
            });
        } else{
            await page.setContent(htmlContentOrUrl, {
                waitUntil
            });
        }
        // if wait option is set, do so
        let { waitBeforeCapture } = _serverOptions;
        if(waitBeforeCapture){
            await setTimeout(waitBeforeCapture);
        }
        // page.pdf returns Promise<Buffer>
        let pdf = await page.pdf(_pdfOptions);
        // close page
        await page.close();

        return pdf;
    }

    async writePdfToFs(filePath, bufferArray, encoding='utf-8'){
        await fs.writeFile(filePath, bufferArray, encoding);
    }

    /**
     * accepts an array of PDF buffers and collates them into a single document which is written to the fs at the provided path
     * @param {Array<Buffer>} bufferArrays an array of buffered PDFs to be collated
     * @param {string} filePath absolute path where the collated file should be written
     * @returns {Promise<string>} path of the created file
     */
    async collate(bufferArrays, filePath){
        
        // init with first page
        let doc = await pdfLib.PDFDocument.load(bufferArrays.shift());
        // add subsequent pages
        for(const buffer of bufferArrays){
            let nextDoc = await pdfLib.PDFDocument.load(buffer),
                indeces = nextDoc.getPageIndices(),
                pages = await doc.copyPages(nextDoc, indeces);
            for(let page of pages){
                doc.addPage(page);
            }
        }
        // save and then write to fs
        let bytes = await doc.save();
        await this.writePdfToFs(filePath, bytes);
    }

    async close(){
        // close dev server and puppeteer
        if(this.server) this.server.close(); 
        if(this._ppt) await this._ppt.close();
    }
}

/**
 * @typedef {import('./PluginConfig').BaseConfig} BaseConfig
 */
/**
 * @typedef {BaseConfig.pdfOptions} PDFOptions
 */
/**
 * @typedef {BaseConfig.serverOptions} ServerOptions
 */

class WriteTarget{
    
    /**
     * constructor
     * @param {string} inputPath path of the source file for this target
     * @param {string} outputSource relative path to the file to be written
     * @param {string} htmlContentOrUrl html string or output url
     * @param {PDFOptions} [pdfOptions] optional target-specific pdf options
     * @param {ServerOptions} [serverOptions] optional target-specific server options
     */
    constructor(inputPath, outputSource, htmlContentOrUrl, pdfOptions, serverOptions){
        this.inputPath = inputPath;
        this.outputSource = outputSource;
        if(htmlContentOrUrl.toLowerCase().indexOf('</html>') > -1){
            this.htmlContent = htmlContentOrUrl;
        } else{
            this.url = htmlContentOrUrl;
        }
        this.pdfOptions = pdfOptions;
        this.serverOptions = serverOptions;
        this._writeCount = 0;
        // begin buffering immediately upon initialization
        this.updateBuffer();
    }

    set outputSource(outputSource){
        if(!path.isAbsolute(outputSource)){ 
            this._outputSource = path.normalize(outputSource);
        } else{
            this._outputSource = outputSource;        
        }

        // set outputPath accordingly
        let srcFile = this._outputSource.split('/').reverse()[0],
            ext = srcFile.split('.').reverse()[0],
            pdfFile = ext === 'pdf' ? srcFile : srcFile.replace(ext, 'pdf');

        this._outputPath = this._outputSource.replace(srcFile, pdfFile);
    }

    get outputSource(){
        return this._outputSource;
    }

    get outputPath(){
        return this._outputPath;
    }

    /**
     * determines if the write target is stale based on modified time of input file (this.inputPath)
     * versus the provided timestamp
     * @param {number} compareTo timestamp to compare against
     * @returns {boolean}
     */
    async isStale(compareTo){
        if(!this.buffer) return true; 

        // else, compare modified timestamps
        let absPath = path.resolve(process.cwd(), this.inputPath),
            modified = await fs.stat(absPath),
            modMs = modified.mtimeMs, 
            stale = modMs > compareTo;

        return stale;
    }

    updateBuffer(){
        if(!this._buffering){ // only refresh buffer if not already buffering
            this._buffering = true;
            this.bufferPromise = new Promise((res, rej) => {
                writer.getPdfBuffer(
                    this.htmlContent ? this.htmlContent : this.url, 
                    this.url ? true : false,
                    this.pdfOptions,
                    this.serverOptions
                ).then(buffer => {
                    this.buffer = buffer;
                    res(buffer);
                }).catch(err =>{
                    rej(err);
                }).finally(()=> {
                    this._buffering = false;
                });
            });
        }

        return this.bufferPromise;
    }
}

/**
 * 
 * @param {Array<WriteTarget>} writeTargets targets in collate order
 * @param {string} filePath the filepath where the collated PDF will be written
 */
async function collate(writeTargets, filePath){
    // ensure done buffering
    for(let target of writeTargets) await target.bufferPromise;
    // write file(s)
    let buffers = writeTargets.map(target => target.buffer);
    await writer.collate(buffers, filePath);
}

/**
 * writes a single target to the file system; implements single-file collate() internally
 * @param {WriteTarget} writeTarget the target to write to the file system
 */
async function write(writeTarget){
    return await collate([writeTarget], writeTarget.outputPath);
}

/**
 * @type {PdfWriter} module singleton
 */
let writer;

async function init(servePath, eleventyConfig, pluginConfig){
    if(!writer){
        writer = new PdfWriter(servePath, eleventyConfig, pluginConfig);
        await writer.serve();
    }
    
    // return wrapper api
    return {
        WriteTarget,
        collate,
        getServerInfo(){
            let { servePort, servePath } = writer;
            return {
                servePath, 
                servePort
            }
        },
        write,
        close: async ()=> await writer.close()
    };
}

module.exports = init;