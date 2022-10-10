module.exports = class PluginConfig{
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
            let name = config.collateName;
            // default to collate.pdf
            if(!name || name.length === 0) return 'collate.pdf';
            // else remove all directory references and ensure filename ends with '.pdf'
            let ext = name.split('.').reverse()[0];

            return ext === 'pdf' ? name : name.replace(ext, 'pdf');
        })();
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