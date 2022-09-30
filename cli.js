#! env node

const path = require('path');
const { program } = require('commander');
const pkg = require(`${__dirname}/package.json`);
const PluginConfig = require('./lib/PluginConfig');
const cliAdapter = require('./lib/cliAdapter');

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
            await cliAdapter(input, new PluginConfig({
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