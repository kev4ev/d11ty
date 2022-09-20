# A doc11ty do-ya

**This package is a WIP version and should not yet be used in your project. Please check back soon.**

`doc11ty` (dock-ity) exists for a sole purpose - to take your markdown files and transform them into beautiful PDFs. It does this by harnessing the power and extensibil11ty of the 11ty static site generator to first transform your markdown into HTML, and then fires up puppeteer to generate the PDF(s). 

## Usage
No need to install. Just run from your command line as such:
```sh
npx doc11ty [ -c, --collate ] 
            [ -f <configFile> ] 
            [ -o <outputDirectory>] 
            <pathOrFileSpec>
```

## Configuration
A configuration file named `.doc11ty.js` can be included in the root of your project directory. It must export a single function that resolves to an object that may contain any of the following keys: 

Key             | Description               | default value
--              | --                        | --
`output`        | path to output directory  | `.`
`collate`       | when true all `.md` will be collated into a single PDF | `false` 
