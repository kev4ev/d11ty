#! env node

// command line program
const { program } = require('commander');
const chalk = import('chalk');
// logic
const { cli, PluginConfig } = require('./main.cjs');
const path = require('path');
const pkg = require(`${__dirname}/package.json`);

program
    .version(pkg.version, '-v, --version')
    .argument('[input]', 'file or directory path to markdown files for conversion', '.')
    .option('-c, --collate', 'collate multiple files from the input path into a single PDF')
    .option('-n, --name <name>', 'when collating, the name of the output PDF (defaults to "collate.pdf")')
    .option('-x, --explicit', 'only print files to PDF that explicitly include the {% d11ty %} shortcode')
    .action(async function(input, flags, cmd){
        let { collate, name, output, explicit } = flags;
        if(!output) output = path.dirname(input);

        try{
            await cli(input, new PluginConfig({
                output,
                explicit,
                collate,
                collateName: name
            }));

            process.exit(0);
        } catch(err){
            console.error(err);

            process.exit(1);
        }
    });

program.parse();