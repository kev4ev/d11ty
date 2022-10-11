/**
 * @typedef {import('puppeteer').PDFOptions} PDFOptions
 */

module.exports = ()=>{
    /** @type {PDFOptions} */
    let pdfOptions = { format: 'legal' },
        serverOptions = { waitBeforeCapture: 5000 };
    return {
        pdfOptions,
        serverOptions
    }
}