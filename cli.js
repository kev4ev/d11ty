#! env node

const path = require('path');
const { program } = require('commander');
const pkg = require(`${__dirname}/package.json`);
const { BaseConfig, CliConfig, PluginConfig } = require('./lib/PluginConfig');
const cliAdapter = require('./lib/cliAdapter');

program
    .version(pkg.version, '-v, --version')
    .argument('[input]', 'file or directory path to markdown files for conversion', '.')
    .option('-c, --collate', 'collate multiple files from the input path into a single PDF')
    .option('-n, --name <name>', 'when collating, the name of the output PDF (defaults to "collate.pdf")')
    .option('-f, --config <path>', 'relative path to .d11ty.json file containing config')
    .option('-x, --explicit', 'only print files to PDF that explicitly include the {% d11ty %} shortcode')
    .option('-w, --watch', 'watch file or directory and automatically write pdf on change')
    .action(async function(input, flags, cmd){
        let { config, collate, name, output, explicit, watch } = flags;
        if(!output) output = path.dirname(input);

        try{
            let baseConfig = new BaseConfig();
            // if config file, apply its values
            if(config){
                if(!config.trim().endsWith('.d11ty.js')){
                    throw new Error('Config file must be named ".d11ty.js" and export a single object or function');
                }
                let absPath = path.resolve(process.cwd(), path.normalize(config));
                let d11tyConfig = require(absPath),
                    configObj = await (async ()=>{
                        if(typeof d11tyConfig === 'object') return d11tyConfig;
                        if(typeof d11tyConfig === 'function') return await d11tyConfig();
                    })();
                let { pdfOptions, serverOptions } = configObj;
                if(pdfOptions) Object.assign(baseConfig.pdfOptions, pdfOptions);
                if(serverOptions) Object.assign(baseConfig.serverOptions, serverOptions);
            }
            const pluginConfig = new CliConfig({
                output,
                explicit,
                collate,
                collateName: name, 
                watch
            });
            await cliAdapter(input, new PluginConfig(baseConfig, pluginConfig));

            process.exit(0);
        } catch(err){
            console.error(err);

            process.exit(1);
        }
    });

program.parse();