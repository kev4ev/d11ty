# Make Your Markdown Pretty

> _dit &bull; ty (noun) a short, simple song_

`d11ty` is a CLI tool that doubles as an eleventy plugin. It exists for a simple sole purpose - to create beautiful PDFs from minimal markup/down.

My inspiration for creating `d11ty` was simple. markdown / strutured flows 

## Usage
No need to install. Just run from your command line as such:
```sh
npx d11ty [ -c, --collate ] 
            [ -f <configFile> ] 
            [ -o <outputDirectory>] 
            <pathOrFileSpec>
```

## Configuration
A configuration file named `.d11ty.js` can be included in the root of your project directory. It must export a single function that resolves to an object that may contain any of the following keys: 

Key             | Description               | default value
--              | --                        | --
`output`        | path to output directory  | `.`
`collate`       | when true all `.md` will be collated into a single PDF | `false` 
