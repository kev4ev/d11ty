CLASS_NO_PRINT = 'd11ty-no-print';
CLASS_PAGE_BREAK = 'd11ty-page-break';
const D11TY_CSS = 
    `<style>
        @media print{
            div.${CLASS_PAGE_BREAK}{
                page-break-after: always !important;
            }
        }
        @media print{
            .${CLASS_NO_PRINT}{
                display: none !important;
            }
        }
    </style>
`;    
const NS = `d11ty`;
const HTML_TAGS = {
    paired: new Set(require('html-tags')),
    unpaired: new Set(require('html-tags/void'))
};

module.exports = {
    CLASS_NO_PRINT,
    CLASS_PAGE_BREAK,
    D11TY_CSS,
    NS,
    HTML_TAGS
};