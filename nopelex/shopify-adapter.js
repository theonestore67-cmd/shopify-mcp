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
    // No partial mutation: variant association and verification must be available
    // before creating any Shopify media.
    throw new Error('Safe Shopify publishing unavailable until variant media association is implemented');
  }
  async verifyMedia() { throw new Error('Shopify variant association verification not implemented'); }
}
