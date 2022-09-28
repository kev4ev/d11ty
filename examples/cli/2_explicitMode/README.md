# Explicit Content Advisory

d11ty defaults to _implicit mode_ by default from the command line. That is, any markdown file in the provided path argument will be written to PDF.

You can change this behavior and have d11ty run in _explicit mode_ by passing the `-e` or `--explicit` flag with your command. In this mode, only markdown files that include the **{&percnt; d11ty &percnt;}** shortcode somewhere in the file will be written to PDF.

Conversely, which in _implicit mode_, you can include the **{&percnt; nod11ty &percnt;}** tag in any file that you _do not_ want written to PDFs. 

So, you got options, you know?

<!-- {% nod11ty %} -->