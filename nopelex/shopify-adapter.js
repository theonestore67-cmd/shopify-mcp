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
    const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
    const filename='NOPELEX-'+productId+'-'+color.replace(/[^a-z0-9]/gi,'_')+'-'+angle+'.'+ext;
    const staged=assertGraphQL(await client.executeGraphQL({
      query:`mutation Stage($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{field message}}}`,
      variables:{input:[{resource:'IMAGE',filename,mimeType:mime,httpMethod:'POST',fileSize:String(bytes.length)}]}
    }));
    const stage=staged.stagedUploadsCreate;
    if(stage.userErrors?.length || stage.stagedTargets?.length!==1) throw new Error('Staged upload failed');
    const target=stage.stagedTargets[0];
    const form=new FormData();
    for(const p of target.parameters) form.append(p.name,p.value);
    form.append('file',new Blob([bytes],{type:mime}),filename);
    const upload=await fetch(target.url,{method:'POST',body:form});
    if(!upload.ok) throw new Error('Shopify staged upload HTTP '+upload.status);
    const created=assertGraphQL(await client.executeGraphQL({
      query:`mutation AddMedia($product:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$product,media:$media){media{id status} mediaUserErrors{field message}}}`,
      variables:{product:gid('Product',productId),media:[{originalSource:target.resourceUrl,mediaContentType:'IMAGE',alt:'NOPELEX '+color+' '+angle}]}
    }));
    const out=created.productCreateMedia;
    if(out.mediaUserErrors?.length || out.media?.length!==1 || !out.media[0].id)
      throw new Error('Shopify media creation failed');
    // Media is NOT associated to variants until the exact variant association is implemented.
    // Fail closed instead of claiming correct-color publishing.
    throw new Error('Media created but variant association not yet implemented: '+out.media[0].id);
  }
  async verifyMedia() { throw new Error('Shopify variant association verification not implemented'); }
}
