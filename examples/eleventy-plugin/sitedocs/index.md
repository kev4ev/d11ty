---
title: Introduction
---

<!-- print this page to pdf -->
{% set pdflink %}
    {% d11ty %}
{% endset %}

{% _d11ty 'h2 title' %}

`d11ty` makes your markdown pretty

{% end_d11ty %}

{% _d11ty 'h3 subtitle' %}

(and your markup, too!)

{% end_d11ty %}

<a href="{{ pdflink }}" target="_blank">View as PDF</a>

