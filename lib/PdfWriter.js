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

/**
 * @type {PDFWriter} module singleton
 */
let writer;

class PdfWriter{

    _servePort = 44154;

    /**
     * @param {string} servePath path to the directory that will be used to serve html that puppeteer will write to PDF;
     * @param {object} [eleventyConfig] passthrough of config when in plugin mode
     */
    constructor(servePath, eleventyConfig){
        let { SHOWPPT } = process.env;
        this.pathPrefix = eleventyConfig ? eleventyConfig.pathPrefix : '/';
        this.servePath = servePath;
        this._ppt = puppeteer.launch({
            headless: SHOWPPT ? false : true
        });
    }

    set _ppt(val){
        this._pptPromise = val;
    }

    set servePath(val){
        this._servePath = val;
        this.server = server.getServer('d11ty-server', val, {
            port: this._servePort,
            pathPrefix: this.pathPrefix
        });
        this.pathPrefix = this.server.options.pathPrefix; // rely upon the normalized path prefix of the dev server
        this.server.serve(this._servePort);
    }

    get servePort(){
        return this._servePort;
    }

    /**
     * 
     * @param {string} htmlContentOrUrl the html content that will be written to PDF
     * @param {PDFOptions} [pdfOptions] puppeteer PDFOptionsclass
     * @param {boolean} [isRelUrl=false] when true the server will attempt to load from the provided relative url; 
     * default is false, meaning first arg will be treated as passthrough HTML.
     * @returns {PdfProxy} instance of PdfProxy
     */
    async getPdfBuffer(htmlContentOrUrl, pdfOptions, isRelUrl=false){
        if(!pdfOptions){
            // set default
            pdfOptions = { 
                printBackground: true,
                layout: 'Letter',
                margin: {
                    top: '.25in', 
                    bottom: '.25in',
                    left: '.25in',
                    right: '.25in'
                }
            };
        }

        // first invocation ensure ppt is ready
        if(!this.ppt){
            let results = await Promise.all([ this._pptPromise]);
            /**
             * @type {puppeteer.Browser}
             */
            let ppt = results[0];
            this.ppt = ppt;
        }

        // create puppeteer page instance
        let page = await this.ppt.newPage(); // TODO use single page?
        await page.setViewport({
            width: 1024, 
            height: 768
        });
        if(isRelUrl){
            let outputSource = htmlContentOrUrl, 
                fullPath = `http://localhost:${this._servePort}${this.pathPrefix}${outputSource.startsWith('/') ? outputSource.replace('/', '') : outputSource}`;
            await page.goto(fullPath, {
                waitUntil: 'load'
            });
        } else{
            await page.setContent(htmlContentOrUrl, {
                waitUntil: 'load'
            });
        }
        
        // page.pdf returns Promise<Buffer>
        return await page.pdf(pdfOptions);
        // TODO close page
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
        let doc = await pdfLib.PDFDocument.load(bufferArrays.shift()), 
            ctr = 0;
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
}

/**
 * @type { import('puppeteer').PDFOptions } PDFOptions
 */

class WriteTarget{
    
    /**
     * constructor
     * @param {string} outputSource relative path to the file to be written
     * @param {string} htmlContentOrUrl html string or output url
     * @param {PDFOptions} [pdfOptions] option per-target pdf options
     */
    constructor(outputSource, htmlContentOrUrl, pdfOptions){
        this.outputSource = outputSource;
        if(htmlContentOrUrl.toLowerCase().indexOf('<html>') > -1){
            this.htmlContent = htmlContentOrUrl;
        } else{
            this.url = htmlContentOrUrl;
        }
        this.pdfOptions = pdfOptions;
        this._writeCount = 0;
        // begin buffering immediately upon initialization
        this.updateBuffer();
    }

    set outputSource(outputSource){
        // make absolute
        if(!path.isAbsolute(outputSource)) return this._outputSource = path.join(writer.servePath, outputSource);

        this._outputSource = outputSource;        
    }

    async needsWrite(){
        if(this._writeCount === 0) return true; 

        // else, compare modified timestamps
        let modified = await fs.stat(),
            modMs = modified.mtimeMs;

        return this._written < modMs;
    }

    updateBuffer(){
        this.bufferPromise = writer.getPdfBuffer(
            this.htmlContent ? this.htmlContent : this.url, 
            this.pdfOptions,
            this.url ? true : false
        );

        return this.bufferPromise;
    }

    async writeToFs(){
        this.buffer = await this.bufferPromise;
        if(!this._outputPath){
            let srcFile = this._outputSource.split('/').reverse()[0],
                ext = srcFile.split('.').reverse()[0],
                pdfFile = ext === '.pdf' ? srcFile : srcFile.replace(ext, '.pdf');

            this._outputPath = this._outputSource.replace(srcFile, pdfFile);
        }
        await writer.writeFile(this._outputPath, this.buffer);
        this._writeCount++;
        this._written = new Date().getTime();
    }
}

module.exports = (servePath, eleventyConfig) => {
    if(!writer) writer = new PdfWriter(servePath, eleventyConfig);
    
    // return wrapper api
    return {
        addWriteTarget: (outputSource) => new WriteTarget(outputSource)
    };
}