/**
 * Shopify read + safe publish adapter. Publishing is disabled unless explicitly
 * enabled by the caller and every image has passed staging checks.
 */
import { shopify as client } from '../shopify.js';

const gid = (kind,id) => 'gid://shopify/'+kind+'/'+String(id);
function assertGraphQL(res) {
  if(res.errors?.length || res.userErrors?.length) throw new Error('Shopify GraphQL error');
  return res.data;
}
export class ShopifyHoodieAdapter {
  async getProduct(productId) { return client.getProductById(productId); }
  async getCollectionIds(productId) {
    const result=assertGraphQL(await client.executeGraphQL({
      query:`query Membership($id:ID!){product(id:$id){collections(first:100){nodes{id} pageInfo{hasNextPage}}}}`,
      variables:{id:gid('Product',productId)}
    }));
    const c=result?.product?.collections;
    if(!c || c.pageInfo?.hasNextPage) throw new Error('Collection membership incomplete');
    return c.nodes.map(x=>x.id.replace('gid://shopify/Collection/',''));
  }
  async publishMedia({productId,color,variantIds,angle,bytes,mime}) {
    if(process.env.NOPELEX_ENABLE_SHOPIFY_PUBLISH!=='true')
      throw new Error('Shopify publishing disabled');
    if(!Buffer.isBuffer(bytes)||!bytes.length) throw new Error('Missing media');
    const product=await this.getProduct(productId);
    const actual=product.variants.filter(v=>v.option1===color).map(v=>String(v.id));
    if(actual.length!==variantIds.length||actual.some(v=>!variantIds.includes(v)))
      throw new Error('Variant IDs changed; refusing publish');
    const digest=(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
    const safeColor=color.replace(/[^a-z0-9]/gi,'_');
    const alt='NOPELEX|'+productId+'|'+safeColor+'|'+angle+'|'+digest;
    // REST product images supports variant_ids; create one correctly associated
    // image without touching prices, inventory, status or other product fields.
    const existing=await client.executeRest({endpoint:'products/'+productId+'/images.json',
      params:{limit:250}});
    const matches=(existing.images||[]).filter(i=>i.alt===alt);
    if(matches.length>1) throw new Error('Ambiguous duplicate Shopify media');
    if(matches.length===1) {
      const image=matches[0];
      if(!variantIds.every(v=>(image.variant_ids||[]).map(String).includes(v)))
        throw new Error('Existing media has incorrect variant association');
      return {id:String(image.id),alt,existing:true};
    }
    const created=await client.executeRest({method:'POST',
      endpoint:'products/'+productId+'/images.json',
      body:{image:{attachment:bytes.toString('base64'),alt,
        variant_ids:variantIds.map(Number)}}});
    const image=created.image;
    if(!image?.id) throw new Error('Shopify image creation returned no ID');
    if(!variantIds.every(v=>(image.variant_ids||[]).map(String).includes(v)))
      throw new Error('Shopify did not confirm variant association; media ID '+image.id);
    return {id:String(image.id),alt};
  }
  async verifyMedia({productId,color,variantIds,angle,mediaId,sha256}) {
    const image=(await client.executeRest({endpoint:
      'products/'+productId+'/images/'+mediaId+'.json'})).image;
    if(!image || String(image.product_id)!==String(productId)) return false;
    if(image.alt!=='NOPELEX|'+productId+'|'+color.replace(/[^a-z0-9]/gi,'_')+'|'+angle+'|'+sha256)
      return false;
    if(!image.src || !image.src.startsWith('https://')) return false;
    return variantIds.every(v=>(image.variant_ids||[]).map(String).includes(v));
  }
}
