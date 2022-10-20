---
title: Introduction
d11ty:
    pdfOptions:
        format: Letter
    serverOptions:
        waitBeforeCapture: 1000
---

<!-- print this page to pdf -->
{% set pdflink %}
    {% d11ty 'collate', 'd11ty-guide.pdf', collections.all %}
{% endset %}

{% _d11ty 'h2 title' %}

`d11ty` makes your markdown pretty

{% end_d11ty %}

{% _d11ty 'h3 subtitle' %}

(and your markup, too!)

{% end_d11ty %}

{% _nod11ty 'span' %}

<a href="{{ pdflink }}" target="_blank">View site PDF</a> (obviously)

{% end_nod11ty %}