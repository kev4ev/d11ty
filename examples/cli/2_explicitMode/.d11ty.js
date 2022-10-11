/**
 * @typedef {import('puppeteer').PDFOptions} PDFOptions
 */

module.exports = ()=>{
    /** @type {PDFOptions} */
    let pdfOptions = {
        format: 'legal'
    }
    return {
        pdfOptions
    }
}