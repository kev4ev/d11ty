The items with the `collated` tag will be collated, save for `collate3.md` which includes the `nod11ty` tag.

{% set collateLink %}
    {{ collections.collated | d11ty_collate('myCustomName') }}
{% endset %}

Download <a href="{{ collateLink }}" target="_blank">here</a>.