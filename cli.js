#! env node

// command line program
const { program } = require('commander');
const chalk = import('chalk');
// logic
const { cli, PluginConfig } = require('./main.cjs');
const path = require('path');

program
    .option('-c, --collate', 'collate multiple files into a single PDF')
    .option('-f, --config <path>' , 'relative path from pwd to .d11ty.js config file')
    .option('-o, --output <path>', 'relative path where PDF file(s) will be created')
    .option('--html', 'generate html as well as pdf files')
    .argument('[input]', 'file or directory path to markdown files for conversion', '.')
    .action(async function(input, flags, cmd){
        let { collate, output, html } = flags;
        if(!output) output = path.dirname(input);

        try{
            await cli(input, new PluginConfig({
                collate,
                output,
                html
            }));

            process.exit(0);
        } catch(err){
            console.error(err);

            process.exit(1);
        }
    });

program.parse();