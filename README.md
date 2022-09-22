# `d11ty` Makes Your Markdown Pretty

> _dit &bull; ty (noun) a short, simple song_

**This is a beta version with known bugs. Please check back soon for a project-ready version**

`d11ty` is a CLI tool that doubles as a plugin to the eleventy static site generator. It exists for a sole purpose - to create beautiful PDFs from minimal markdown/up. 

`d11ty` has two modes: **CLI mode** and (eleventy) **plugin** mode. If you just want a fast, simple command line tool to convert your markdown into elegant, shareable PDFs, look no further than the former. If you're an avid eleventy user for static site generation, like myself, and need a plugin to convert (all or a subset) of your sites to PDF, the latter is for you. I'm hopeful you'll find benefit in both modes. 

## CLI Mode

### Usage
No need to install. Just run from your command line as such:

```sh
npx d11ty [ -c, --collate ] [ -o <outputDirectory>] <pathOrFileSpec>
```

## Plugin Mode

## Configuration
A configuration file named `.d11ty.js` can be included in the root of your project directory. It must export a single function that resolves to an object that may contain any of the following keys: 

Key             | Description               | default value
--              | --                        | --
`output`        | path to output directory  | `.`
`collate`       | when true all `.md` will be collated into a single PDF | `false` 
