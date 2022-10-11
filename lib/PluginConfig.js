/**
 * @typedef {object} ServerOptions
 * @param {number} ServerOptions.waitBeforeCapture introduce a delay to server process from page load to when 
 * the html is captured and converted to pdf.
 */

/**
 * @typedef {import('puppeteer').PDFOptions} PDFOptions
 */

/**
 * @type {PDFOptions} default pdf options
 */
const PDF_DEF = { 
    printBackground: true,
    format: 'Letter',
    margin: {
        top: '.25in', 
        bottom: '.25in',
        left: '.25in',
        right: '.25in'
    }
};

class BaseConfig{
    /**
     * 
     * @param {PDFOptions} pdfOptions puppeteer pdf options
     * @param {ServerOptions} serverOptions
     */
    constructor(pdfOptions=PDF_DEF, serverOptions={}){
        this.pdfOptions = Object.assign(PDF_DEF, pdfOptions);
        this.serverOptions = Object.assign({}, serverOptions);
    }
}

class CliConfig{
    /**
     * constructor
     * @param {object} [config] config object
     * @param {string} [config.output] path spec to output directory when collating
     * @param {boolean} [config.explicit] when true, only files with the {% d11ty %} shortcode will be written to PDF
     * @param {boolean} [config.collate] whether html should be collated to a single file, or not
     * @param {string} [config.collateName] when collating, the name of the output PDF (defaults to "collate.pdf")
     */
     constructor(config={}){
        this.output = config.output;
        this.explicit = config.explicit;
        this.collate = config.collate;
        this.collateName = (()=>{
            if(!this.collate) return undefined;

            let name = config.collateName;
            // default to collate.pdf
            if(!name || name.length === 0) return 'collate.pdf';
            // else remove all directory references and ensure filename ends with '.pdf'
            let ext = name.split('.').reverse()[0];

            return ext === 'pdf' ? name : name.replace(ext, 'pdf');
        })();
    }
}

/**
 * @class
 * @param {PDFOptions} pdfOptions
 * @param {ServerOptions} serverOptions
 */
class PluginConfig{
    /**
     * constructor
     * @param {BaseConfig} baseConfig base configurations
     * @param {CliConfig} [cliConfig] cli config derived from flags passed with command-line invocation
     */
    constructor(baseConfig=new BaseConfig(), cliConfig={}){
        Object.assign(this, baseConfig);
        this.cliConfig = cliConfig;
    }
    /**
     * @typedef {import('./cliContext').getCliContext()} CliContext
     */
    
    /**
     * can only be set programmatically so property assures plugin is being utilized from CLI and not
     * as eleventy plugin
     * @param {CliContext} ctxt
     */
    setSrcIsCli(ctxt){
        this._srcIsCli = true;
        this._cliContext = ctxt;
    }

    get cliContext(){
        return this._cliContext;
    }
    
    get srcIsCli(){
        return this._srcIsCli;
    }
}

module.exports = PluginConfig;
module.exports.BaseConfig = BaseConfig;
module.exports.CliConfig = CliConfig;
module.exports.PluginConfig = PluginConfig;