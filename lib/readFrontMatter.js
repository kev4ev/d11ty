const matter = require('gray-matter');
const { readFile } = require('fs/promises');

function assignConfigs(target, source){
    let { pdfOptions, serverOptions } = source;
    if(pdfOptions) Object.assign(target.pdfOptions, pdfOptions);
    if(serverOptions) Object.assign(target.serverOptions, serverOptions);
}

/**
 * 
 * @param {object|import('fs').PathOrFileDescriptor} ctxt either of an object containing the page front matter, 
 * or the path to a file's front matter for retrival
 */
module.exports = async (ctx) =>{
    let base = {
        pdfOptions: {},
        serverOptions: {}
    };

    if(typeof ctxt === 'object' && ctx.d11ty){
        let { d11ty } = ctx;
        assignConfigs(base, d11ty);
    } else{
        let file = matter(await readFile(ctx)),
            d11ty = file.isEmpty ? undefined : file.data.d11ty;
        if(d11ty){
            assignConfigs(base, d11ty);
        }
    }

    return base;
}