/**
 * Usage (from repo root):
 *   NOPELEX_PRODUCT_ID=9816989958403 NOPELEX_COLOR=Black \
 *   NOPELEX_FRONT_IMAGE_ID=55728648945923 NOPELEX_BACK_IMAGE_ID=55728646750467 \
 *   node nopelex/fetch-hoodie-sources.js
 *
 * Downloads verified original image bytes to local staging only.
 * NEVER uploads, mutates Shopify, or fabricates mockups.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { shopify } from '../shopify.js';
import { COLLECTION_ID, manifestFor } from './hoodie-manifest.js';
import { fetchSource, saveSource } from './source-fetch.js';

const required = key => {
  const value = process.env[key];
  if (!value) throw new Error('Missing ' + key);
  return value;
};
const id = value => {
  if (!value || !Array.from(value).every(c => c >= '0' && c <= '9')) throw new Error('Invalid numeric ID');
  return value;
};

async function main() {
  const productId = id(required('NOPELEX_PRODUCT_ID'));
  const color = required('NOPELEX_COLOR');
  const frontId = id(required('NOPELEX_FRONT_IMAGE_ID'));
  const backId = id(required('NOPELEX_BACK_IMAGE_ID'));
  const root = path.resolve(process.env.NOPELEX_STAGING_DIR || './nopelex-staging');

  // Shopify REST: prove collection membership before downloading.
  const membership = await shopify.executeRest({
    method: 'GET', endpoint: 'collects.json',
    params: { collection_id: COLLECTION_ID, product_id: productId, limit: 10 }
  });
  const collectionProductIds = (membership.collects || []).map(x => String(x.product_id));
  if (!collectionProductIds.includes(productId))
    throw new Error('Product is not verified in NOPELEX Hoodies collection');

  const product = await shopify.getProductById(productId);
  const front = await fetchSource({ product, color, imageId: frontId });
  const back = await fetchSource({ product, color, imageId: backId });
  const manifest = manifestFor({ product, color,
    sourceFront: front, sourceBack: back, collectionProductIds });

  const files = {};
  for (const [side, source] of [['FRONT',front],['BACK',back]]) {
    files[side] = await saveSource({source,productId,color,side,root});
  }
  const dir = path.join(root,'Hoodies',productId,color,'STAGING');
  await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'source-manifest.json'),
    JSON.stringify({...manifest,localSources:files},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:'SOURCE_FILES_READY',productId,color,
    sourceHashes:{FRONT:front.sha256,BACK:back.sha256},
    anglesGenerated:0,shopifyMutations:0,files},null,2));
}
main().catch(e=>{ console.error('SOURCE_FETCH_FAILED:',e.message); process.exitCode=1; });
