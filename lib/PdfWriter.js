/**
 * This module is responsible for creating PDF buffers using headless puppeteer, and
 * then writing those buffers to the filesystem. Additionally, it exports the ability
 * to create collated PDFs and write that to the file system, as well.
 */

const puppeteer = require('puppeteer');
const fs = require('fs/promises');
const pdfLib = require('pdf-lib');
const httpServer = require('http-server');

class PdfWriter{

    _servePort = 44154;

    /**
     * constrcutor
     * @param {string} [servePath] path to the directory that will be used to serve html that puppeteer will write to PDF;
     */
    constructor(servePath){
        this.servePath = servePath;
        let { SHOWPPT } = process.env;
        this._ppt = puppeteer.launch({
            headless: SHOWPPT ? false : true
        });
    }

    set _ppt(val){
        this._pptPromise = val;
    }

    set servePath(val){
        this._servePath = val;
        this.server = httpServer.createServer({ root: val });
        this.server.listen(this._servePort);
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
     * @returns 
     */
    async getPdfBuffer(htmlContentOrUrl, pdfOptions, isRelUrl=false){
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
            let path = htmlContentOrUrl;
            await page.goto(`http://localhost:${this._servePort}${path.startsWith('/') ? '' : '/'}${path}`, {
                waitUntil: 'networkidle2'
            });
        } else{
            await page.setContent(htmlContentOrUrl, {
                waitUntil: 'networkidle2'
            });
        }
        
        // page.pdf returns Promise<Buffer>
        return await page.pdf(pdfOptions);
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

let writer;

function getWriter(servePath){
    if(!writer) writer = new PdfWriter(servePath);

    return writer;
}

module.exports = {
    getWriter
}