# NOPELEX Hoodies source staging (development only)

This folder is intentionally **not** a mockup generator. It acquires the exact original image bytes from Shopify, verifies ownership and selected color, hashes them, and writes a fail-closed manifest for downstream rendering.

Run on a server with existing Shopify environment credentials:

```sh
NOPELEX_PRODUCT_ID=9816989958403 \
NOPELEX_COLOR=Black \
NOPELEX_FRONT_IMAGE_ID=55728648945923 \
NOPELEX_BACK_IMAGE_ID=55728646750467 \
NOPELEX_STAGING_DIR=/tmp/nopelex-staging \
node nopelex/fetch-hoodie-sources.js
```

The script performs **read-only** Shopify requests. It checks collection ID `488643133699` and only writes to the local staging directory. If Shopify collection membership cannot be verified, it stops. It never writes to Shopify, changes variant associations, or claims six generated angles.

Remaining integration requirements before any live deployment:
- Validate exact source image orientation visually.
- Generate six genuinely different views using image editing with original artwork preserved; never substitute a re-created print.
- Upload each to Google Drive STAGING and verify readback hashes.
- Run per-image visual QC, including color, print, placement and angle uniqueness.
- Only after all six pass, attach to the exact Shopify product/color and verify media/variant association.
- Add durable job storage and secrets in Render; the current Render web service filesystem is not durable.
- Run tests and review the PR; do not merge until successful.
