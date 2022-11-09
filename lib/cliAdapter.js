const PluginConfig = require('./PluginConfig');
const { setCliContext } = require('./cliContext');
const plugin = require('../main.cjs');
const { watch } = require('fs/promises');
const { setTimeout } = require('timers');
const { DEF_DIR } = require('./CONSTANTS');

/**
 * 
 * @param {string} input input file or directory of markdown files to convert to PDF
 * @param {PluginConfig} pluginConfig the config options passed from command line
 */
async function adapter(input, pluginConfig=new PluginConfig()){
    // set context for remainder of transaction
    const ctxt = setCliContext(input);
    // import dependency manager only *after* calling setCliContext as former depends on the latter
    const { manageDependencies } = require('./cliDependencyManager');
    // add SIGINT (supported on all platforms) and process listeners to ensure temp dir is torn down in all cases
    const throwToTeardown = async (err)=>{
        await manageDependencies(true);
        console.error(err);
        process.exit(1);
    }
    process.on('SIGINT', async (signal, err) => await throwToTeardown(err));
    process.on('uncaughtException', async (err, origin) => await throwToTeardown(err));
    try{
        // set pluginConfig cli src, passing ctxt
        pluginConfig.setSrcIsCli(ctxt);
        // dynamically import/instantiate eleventy and apply cli configs to it
        let configPath = ctxt.defaultsFileAbsolute();
        const rt = require('@11ty/eleventy');
        const eleventy = new rt(undefined, undefined, {
            configPath, // a base config file is needed
            config: function(eleventyConfig){ // "user config"
                // add the plugin
                eleventyConfig.addPlugin(plugin, pluginConfig);
            }
        });
        // cp temporary dir with _data and _includes directories
        await manageDependencies();
        // kickoff eleventy
        await eleventy.toNDJSON();
        // if watching files, setup watching and abort timeout after 5 minutes
        if(pluginConfig.cliConfig && pluginConfig.cliConfig.watch){
            // init watcher
            const watcher = watch(input);
            for await (const evt of watcher){
                let { eventType, filename } = evt;
                if(eventType === 'change' && filename !== DEF_DIR){
                    await eleventy.toNDJSON();
                }
            }
        }
        // teardown temporary dir
        await manageDependencies(true);
    } catch(err){
        // teardown symlinks
        await manageDependencies(true);

        throw err;
    }
}

module.exports = adapter;