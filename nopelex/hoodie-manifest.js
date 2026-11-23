/**
 * NOPELEX hoodie-only, read-only source manifest.
 * No mutation, no image synthesis, no implicit publishing.
 * Node 20+; inject a Shopify REST client rather than storing secrets here.
 */
import { createHash } from 'node:crypto';

export const COLLECTION_ID = '488643133699';
export const ANGLES = Object.freeze(['FRONT','BACK','LEFT_3Q','RIGHT_3Q','PRINT_CLOSEUP','HERO']);

export function validateSelection(product, color) {
  if (!product || String(product.status).toLowerCase() !== 'active') throw new Error('Product must be ACTIVE');
  if (String(product.vendor).toLowerCase() !== 'nopelex') throw new Error('Not NOPELEX');
  if (!/hoodie/i.test(product.product_type || '')) throw new Error('Not a hoodie');
  const variants = (product.variants || []).filter(v => v.option1 === color);
  if (!variants.length) throw new Error('Exact color not found');
  return variants.map(v => String(v.id));
}

export function manifestFor({ product, color, sourceFront, sourceBack, collectionProductIds }) {
  if (!collectionProductIds.map(String).includes(String(product.id))) throw new Error('Outside NOPELEX Hoodies collection');
  const variantIds = validateSelection(product, color);
  if (!sourceFront?.bytes?.length || !sourceBack?.bytes?.length) throw new Error('Both original source files required');
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  return {
    schema: 'nopelex-hoodie-mockups/v1', productId: String(product.id), color, variantIds,
    collectionId: COLLECTION_ID, complete: false, publishAllowed: false,
    sources: {
      FRONT: { imageId: String(sourceFront.imageId), sha256: hash(sourceFront.bytes) },
      BACK: { imageId: String(sourceBack.imageId), sha256: hash(sourceBack.bytes) }
    },
    angles: Object.fromEntries(ANGLES.map(angle => [angle, {
      status: 'PENDING', file: null, sha256: null,
      visualQc: false, driveReadback: false, shopifyMediaId: null, shopifyReadback: false
    }]))
  };
}

export function stagingReady(m) {\n  return ANGLES.every(a => {\n    const x = m.angles?.[a];\n    return x?.status === 'PASS' && x.file && x.sha256 && x.visualQc && x.driveReadback;\n  });\n}\n\nexport function publicationReady(m) {\n  if (!stagingReady(m)) return false;
  return ANGLES.every(a => {
    const x = m.angles?.[a];
    return x?.status === 'PASS' && x.file && x.sha256 && x.visualQc &&
      x.driveReadback && x.shopifyMediaId && x.shopifyReadback;
  });
}
