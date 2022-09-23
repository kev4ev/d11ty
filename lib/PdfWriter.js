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

    /**
     * constrcutor
     * @param {string} [servePath] path to the directory that will be used to serve html that puppeteer will write to PDF;
     * may be set after construction via setter.
     */
    constructor(servePath){
        this.servePath = servePath;
        this._ppt = puppeteer.launch({
            headless: true
        });
    }

    set _ppt(val){
        this._pptPromise = val;
    }

    set servePath(val){
        this._servePath = val;
        this._server = httpServer.createServer({ root: val });
    }

    set _server(val){
        if(val) this._serverPromise = val;
    }

    /**
     * 
     * @param {string} htmlContent the html content that will be written to PDF
     * @param {PDFOptions} [pdfOptions] puppeteer PDFOptionsclass
     * @returns 
     */
    async getPdfBuffer(htmlContent, pdfOptions, headless=true){
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

        // first invocation, ensure ppt and server are initialized
        if(!this.ppt || !this.server){
            let results = await Promise.all([ this._pptPromise, this._serverPromise]);
            this.ppt = results[0];
            this.server = results[1];
        }

        // create puppeteer page instance
        let page = await this.ppt.newPage(); // TODO use single page?
        await page.setContent(htmlContent, {
            waitUntil: 'networkidle2'
        });
        
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
        // TODO
    }
}

module.exports = PdfWriter;