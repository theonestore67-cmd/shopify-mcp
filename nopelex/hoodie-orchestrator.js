/**
 * Fail-closed six-angle orchestration. All integrations are injected adapters.
 * This module never claims that image generation exists unless the caller supplies it.
 */
import { createHash } from 'node:crypto';
import { ANGLES, manifestFor, stagingReady, publicationReady } from './hoodie-manifest.js';
import { fetchSource } from './source-fetch.js';

const hash = b => createHash('sha256').update(b).digest('hex');
function requireFn(obj, key) {
  if (typeof obj?.[key] !== 'function') throw new Error('Missing integration: ' + key);
}
function assertImage(image, angle) {
  if (!image || !Buffer.isBuffer(image.bytes) || image.bytes.length < 1024)
    throw new Error(angle + ': missing image bytes');
  if (!['image/jpeg','image/png','image/webp'].includes(image.mime))
    throw new Error(angle + ': unsupported image type');
}
export async function runHoodieJob({productId,color,frontImageId,backImageId,adapters,publish=false}) {
  const {shopify,renderer,quality,drive} = adapters || {};
  for (const [obj,methods] of [[shopify,['getProduct','getCollectionIds']],
    [renderer,['renderAngle']],[quality,['verifyAngle','verifySet']],
    [drive,['put','get']]]) for(const method of methods) requireFn(obj,method);
  if (!/^\\d+$/.test(String(productId))) throw new Error('Invalid product ID');
  if (typeof color !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/.test(color))
    throw new Error('Unsafe or invalid color');
  const product=await shopify.getProduct(String(productId));
  const collectionIds=await shopify.getCollectionIds(String(productId));
  const front=await fetchSource({product,color,imageId:frontImageId});
  const back=await fetchSource({product,color,imageId:backImageId});
  const manifest=manifestFor({product,color,sourceFront:front,sourceBack:back,
    collectionProductIds:collectionIds.includes('488643133699')?[String(productId)]:[]});
  const source={FRONT:front,BACK:back};
  const prefix='NOPELEX/Product Mockups/Hoodies/'+String(productId)+'/'+color+'/STAGING/';
  // Originals are stored separately and checked by byte hash.
  for(const side of ['FRONT','BACK']) {
    const key=prefix+'SOURCES/'+side+'-'+source[side].sha256+source[side].ext;
    await drive.put(key,source[side].bytes,source[side].mime);
    const check=await drive.get(key);
    if(!Buffer.isBuffer(check)||hash(check)!==source[side].sha256)
      throw new Error(side+': source readback mismatch');
  }
  const staged=[];
  for(const angle of ANGLES) {
    const result=await renderer.renderAngle({angle,product,color,source,manifest});
    assertImage(result,angle);
    const verdict=await quality.verifyAngle({angle,result,product,color,source});
    if(verdict?.pass!==true || verdict?.artworkFaithful!==true ||
      verdict?.correctColor!==true || verdict?.angleDistinct!==true)
      throw new Error(angle+': visual QC failed');
    const digest=hash(result.bytes);
    const key=prefix+angle+'-'+digest+'.'+(result.mime==='image/png'?'png':result.mime==='image/webp'?'webp':'jpg');
    await drive.put(key,result.bytes,result.mime);
    const readback=await drive.get(key);
    if(!Buffer.isBuffer(readback)||hash(readback)!==digest)
      throw new Error(angle+': Drive readback mismatch');
    Object.assign(manifest.angles[angle],{status:'PASS',file:key,sha256:digest,
      visualQc:true,driveReadback:true});
    staged.push({angle,key,sha256:digest,mime:result.mime,bytes:result.bytes});
  }
  if((await quality.verifySet({product,color,staged,source}))?.pass!==true)
    throw new Error('Six-angle set QC failed');
  if(!stagingReady(manifest)) throw new Error('Staging gate failed');
  if(!publish) return {status:'STAGED_NOT_PUBLISHED',manifest};
  for(const method of ['publishMedia','verifyMedia']) requireFn(shopify,method);
  // Publication is explicitly opt-in and must preserve existing product fields.
  for(const item of staged) {
    const media=await shopify.publishMedia({productId:String(productId),color,
      variantIds:manifest.variantIds,angle:item.angle,bytes:item.bytes,mime:item.mime});
    if(!media?.id) throw new Error(item.angle+': missing Shopify media ID');
    const ok=await shopify.verifyMedia({productId:String(productId),color,
      variantIds:manifest.variantIds,angle:item.angle,mediaId:media.id,sha256:item.sha256});
    if(ok!==true) throw new Error(item.angle+': Shopify readback failed');
    Object.assign(manifest.angles[item.angle],{shopifyMediaId:media.id,shopifyReadback:true});
  }
  if(!publicationReady(manifest)) throw new Error('Publication gate failed');
  return {status:'PUBLISHED_VERIFIED',manifest};
}
