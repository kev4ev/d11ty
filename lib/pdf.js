/**
 * This module is responsible for creating PDF buffers using headless puppeteer, and
 * then writing those buffers to the filesystem. Additionally, it exports the ability
 * to create collated PDFs and write that to the file system, as well.
 */

const puppeteer = require('puppeteer');
const fs = require('fs/promises');
const pdfLib = require('pdf-lib');

// module-level for efficiency
let ppt; 

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

/**
 * accepts an array of PDF buffers and collates them into a single document which is written to the fs at the provided path
 * @param {Array<Buffer>} bufferArrays an array of buffered PDFs to be collated
 * @param {string} filePath absolute path where the collated file should be written
 * @returns {Promise<string>} path of the created file
 */
async function collate(bufferArrays, filePath){
    // TODO
}

module.exports = {
    getPdfBuffer,
    writePdfToFs
}