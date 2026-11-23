# Production integration contract (not yet deployed)

The six-angle orchestrator is implemented in `hoodie-orchestrator.js` and intentionally fails closed unless real implementations of the following adapters are supplied:

- `shopify.getProduct(productId)` returns the full Shopify REST product including image URLs and variants.
- `shopify.getCollectionIds(productId)` returns verified Shopify collection IDs.
- `renderer.renderAngle({angle,product,color,source,manifest})` returns one **real** JPEG/PNG/WebP `{bytes:Buffer,mime}` per requested angle. This requires a configured image editing model that preserves the original print; the connected ChatGPT image generator is not automatically accessible from Render.
- `quality.verifyAngle(...)` returns explicit `{pass:true,artworkFaithful:true,correctColor:true,angleDistinct:true}` only after actual visual inspection. `quality.verifySet(...)` independently checks uniqueness of all six angles.
- `drive.put(key,bytes,mime)` and `drive.get(key)` write and read back the exact original bytes in the connected Drive account. A Google Drive connector visible in ChatGPT does not by itself grant credentials to a Render process.
- `shopify.publishMedia(...)` and `shopify.verifyMedia(...)` must attach only to the existing product and correct color variants, verify readback, and never touch price, inventory, fulfillment, or status.

`runHoodieJob({...,publish:false})` stages without Shopify mutations. `publish:true` is explicitly opt-in; all six images must pass QC and Drive readback first. Missing adapters or any failed check throw errors, and no success is reported.

**Not production ready:** No actual Render-side renderer, visual-QC provider, Google Drive OAuth/service account, or Shopify media publisher is implemented. No image was generated, no Drive image uploaded, and no Shopify media mutated by this branch. Do not merge or deploy until these integrations and their tests are complete.
