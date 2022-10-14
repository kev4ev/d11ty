const path = require('path');
const PdfWriter = require('./lib/PdfWriter');
const PluginConfig = require('./lib/PluginConfig');
const { CLASS_NO_PRINT, CLASS_PAGE_BREAK, D11TY_CSS, HTML_TAGS, NS } = require('./lib/CONSTANTS');
const pluginApi = require('./lib/pluginApi');
// polyfill of sorts as 'page' object is not passed to transformers or events
const readFrontMatter = require('./lib/readFrontMatter');

/**
 * inspects the raw command passed to the shortcode or filter, and returns structured object
 * @param {string} cmdStr the raw argument passed to a shortcode or filter
 * @return {object} CmdStruct
 */
function interpretCmd(cmdStr, ...rest){
    let cmd, args;
    if(rest && rest.length > 0){
        cmd = cmdStr;
        args = rest;
    } else{
        args = cmdStr.trim().split(' ').filter(cmd => cmd && cmd.length > 0);
        cmd = args.shift();
    }

    return {
        cmd,
        args
    }
}

/**
 * 
 * @param {object} eleventyConfig eleventyConfiguration
 * @param {PluginConfig} pluginConfig d11ty configuration
 * @returns 
 */
function plugin(eleventyConfig, pluginConfig=new PluginConfig()){
    
    // closure variables
    let { srcIsCli, cliContext, cliConfig } = pluginConfig;
    let { collate, collateName, explicit } = cliConfig ? cliConfig : {};
    let implicitMode = srcIsCli && !explicit,
        outputMode,
        isDryRun = ()=>{
            return outputMode !== 'fs' && !srcIsCli;
        };
    let bufferMap = new Map(),
        docs = new Set(),
        ignores = new Set();
    let writer, 
        writeCount = 0,
        writeStamp = Date.now();

    // 'before' event listener to set closure context
    eleventyConfig.on('eleventy.before', async function(args){ 
        outputMode = args.outputMode;
        // initialize the writer
        if(!isDryRun()){
            let servePath = srcIsCli ? cliContext.inputAbsolute() : eleventyConfig.dir.output;
            writer = await PdfWriter(servePath, eleventyConfig, pluginConfig);
        }
    });
    
    // d11ty sync shortcodes (async shortcodes have a separate API)
    let { shortcodes, filters } = pluginApi;
    if(shortcodes){
        eleventyConfig.addShortcode(NS, function(cmdStr, ...rest){
            // if no cmd is provided - e.g. {% doc11ty %} in the template - invoke the "include" function
            if(!cmdStr){
                let { inputPath, outputPath } = this.page;
                docs.add(inputPath);

                // return the name of the pdf back to caller
                return path.basename(outputPath).replace('.html', '.pdf');
            }
            // else command / args provided
            let { cmd, args } = interpretCmd(cmdStr, ...rest);
            // get the function and bind closure variables
            let fn = shortcodes[cmd];
            // call function, always passing d11ty context as first arg
            let { inputPath, outputPath } = this.page;
            let ctxt = { 
                srcIsCli,
                docs, 
                ignores, 
                writer,
                caller: { 
                    inputPath, 
                    outputPath
                }
            };
            if(args && args.length > 0){
                return fn(ctxt, ...args);
            }
            
            return fn(ctxt);
        });
    }

    // nod11ty shortcode to ensure d11ty ignores a file
    eleventyConfig.addShortcode(`no${NS}`, function(){
        let { inputPath } = this.page;
        ignores.add(inputPath);

        return '';
    });

    // _d11ty paired shortcode
    eleventyConfig.addPairedShortcode(`_${NS}`, function(content, ...rest){
        rest = rest.length > 1 ? rest : rest[0].split(' ').map(str => str.trim()).filter(str => str.length > 0);
        let first = rest[0];
        let explicitTag = HTML_TAGS.paired.has(first) || HTML_TAGS.unpaired.has(first) ? rest.shift() : undefined;
        let unpairedTag = explicitTag ? HTML_TAGS.unpaired.has(explicitTag) : undefined;
        const classReducer = (prev, curr)=>{
            if(curr) prev = prev + ' ' + curr; 

            return prev;
        }

        let tag = explicitTag ? explicitTag : 'div',
            wrapper = `<${tag} class="${rest.reduce(classReducer, '')}" ${unpairedTag ? '/' : ''}>{{content}}${unpairedTag ? '' : `</${tag}>`}`
            changed = wrapper.replace('{{content}}', content);

        return changed;
    });

    // _nod11ty paired shortcode, wrapped content will not appear when 
    eleventyConfig.addPairedShortcode(`_no${NS}`, function(content, tag='div'){
        return `<${tag} class="${CLASS_NO_PRINT}">${content}</${tag}>`
    });

    // d11ty-* filters (future state, currently none)
    if(filters){
        Object.keys(filters).forEach(filter => {
            let name = `${NS}_${filter}`;
            eleventyConfig.addFilter(name, function(pipedValue, ...rest){
                // future state, currently no d11ty filters
                return targetFn(ctxt, pipedValue, ...rest);
            });
        });
    }

    // transformer
    eleventyConfig.addTransform(NS, async function(content){
        // in all cases append the css needed to apply d11ty styling
        content = content.replace(
            '</head>',
            D11TY_CSS + '</head>'
        );
        // only add pages in the transform if running from CLI and in implicit mode or doc explicitly added to page
        if(srcIsCli){
            let { inputPath, outputPath } = this;
    
            let eligible = !isDryRun() && outputPath && outputPath.endsWith('.html') && !ignores.has(inputPath),
                writeNow = eligible && (implicitMode || docs.has(inputPath));
    
            if(writeNow){
                docs.add(inputPath);
                let { pdfOptions, serverOptions } = await readFrontMatter(inputPath);
                bufferMap.set(inputPath, new writer.WriteTarget(inputPath, inputPath, content, pdfOptions, serverOptions));
            }
        }
        
        return content;
    });

    // after event listener, writes files to the fs
    eleventyConfig.on('eleventy.after', async function(args){
        
        if(isDryRun()) return;
        
        // if src is not cli then begin buffering all docs that need to be written
        let { results } = args;
        let resultHash;
        if(!srcIsCli && results && results.length > 0){
            // convert to a hash map
            resultHash = results.reduce((prev, curr)=>{
                if(curr && curr.inputPath){
                    let { inputPath } = curr;
                    prev[inputPath] = curr;
                }

                return prev;
            }, {});
            // iterate docs and add to buffermap from results
            const addToBufferMap = async (inputPath) =>{
                if(!resultHash[inputPath]) return;

                if(!bufferMap.has(inputPath)){ // no entry, add it
                    let { outputPath, url } = resultHash[inputPath];
                    let { pdfOptions, serverOptions } = await readFrontMatter(inputPath);
                    bufferMap.set(inputPath, new writer.WriteTarget(inputPath, outputPath, url, pdfOptions, serverOptions));
                } else{ // if file has been written since last write, update the buffer
                    let writeTarget = bufferMap.get(inputPath),
                        stale = await writeTarget.isStale(writeStamp);
                    if(stale) writeTarget.updateBuffer();
                }
            }
            for(let doc of docs){
                // skip all collates (objects)
                if(typeof doc === 'object'){
                    let { files } = doc;
                    for(let file of files){
                        await addToBufferMap(file);
                    }
                } else{
                    await addToBufferMap(doc);
                }
            }
        }

        // wait for all pdf buffers to resolve
        try{
            await Promise.all(Array.from(bufferMap.values()).map(writeTarget => writeTarget.bufferPromise)); 
        } catch(err){
            console.error(err);
            throw err;
        }
        
        // if srcIsCli and collate option passed, flatten docs to a single-item array
        if(srcIsCli && collate){
            let initial = { outputPath: `${cliContext.inputAbsolute()}/${collateName}`, files: [] };
            docs = Array.from(docs).reduce((prev, curr)=>{
                if(curr) prev[0].files.push(curr);

                return prev;
            }, [initial]);
        }

        // iterate docs and write to the fs at appropriate locations
        for(let doc of docs){
            if(typeof doc === 'string'){
                let writeTarget = bufferMap.get(doc);
                if(await writeTarget.isStale(writeStamp)){
                    await writer.write(writeTarget);
                }
            } else if(typeof doc === 'object'){ // collate
                // if any writeTargets are stale, write the entire collated file
                let { outputPath, files } = doc;
                let stale = false; 
                if(writeCount > 0){
                    for(let file of files){
                        let writeTarget = bufferMap.get(file);
                        if(await writeTarget.isStale(writeStamp)){
                            stale = true; 
                            break;
                        }
                    }
                }
                if(writeCount === 0 || stale){
                    await writer.collate(files.map(file => bufferMap.get(file)), outputPath);
                }
            }
        }

        // if not in --serve, close writer server
        let persistent = (()=>{
            let { runMode } = args;
            if(runMode === 'serve' || runMode === 'watch') return true;

            return false;
        })();
        if(!persistent){
            await writer.close();
        } else{
            writeCount++;
            writeStamp = Date.now();
        }
    });
}

module.exports = plugin;