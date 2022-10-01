The items with the `collated` tag will be collated, save for `collate3.md` which includes the `nod11ty` tag.

{% set collateLink %}
    {% d11ty 'collate', 'customCollate.pdf', collections.collated %}
{% endset %}

Download <a href="{{ collateLink }}" target="_blank">here</a>.