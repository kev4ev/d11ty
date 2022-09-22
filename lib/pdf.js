const puppeteer = require('puppeteer');
const fs = require('fs/promises');

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

module.exports = {
    getPdfBuffer,
    writePdfToFs
}