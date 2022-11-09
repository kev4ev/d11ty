const path = require('path');
const { DEF_DIR } = require('./CONSTANTS');

module.exports = {
    // shortcodes always receive a d11ty-created ctxt variable as first arg, if they want to use it
    shortcodes: {
        collate(ctxt, ...rest){
            let outName = rest.shift(), 
                pages = rest.reduce((prev, curr) => {
                    if(curr){
                        if(curr.length) prev = prev.concat(curr);
                        else if (typeof curr === 'object') prev.push(curr);
                        else throw new Error(`Invalid value ${typeof curr} - only pages and collections (arrays) of pages may be passed`);
                    }

                    return prev;
                }, []);
            if(!outName || typeof outName !== 'string') throw new Error('You need to provide a name for your collated file');
            let { docs, ignores, caller } = ctxt;
            let { outputPath } = caller;
            let inName = path.basename(outputPath);
            outName = outName.trim().split('/').reverse()[0];
            outName = outName.endsWith('.pdf') ? outName : `${outName}.pdf`;
            outputPath = outputPath.replace(inName, outName);
            // filter out ignored pages
            pages = pages.map(page => page.inputPath).filter(inputPath => !ignores.has(inputPath));
            // add the collation object
            let collate = {
                outputPath, 
                files: pages
            };
            docs.add(collate);

            return `./${outName}`;
        },
        pb: () => `<div class="${CLASS_PAGE_BREAK}"></div>`,
        noPrint: ()=> CLASS_NO_PRINT,
        getBulmaPath(ctxt, version, min){ // for cli use only
            if(!version) version = '0.9.4';
            let { srcIsCli, writer } = ctxt;
            if(srcIsCli){
                return `http://localhost:${writer.getServerInfo().servePort}/${DEF_DIR}/css/bulma.${version}.css`;
            } else{
                throw new Error('Shortcode "getBulmaPath" may only be used in CLI context');
            }
        }
    }
}