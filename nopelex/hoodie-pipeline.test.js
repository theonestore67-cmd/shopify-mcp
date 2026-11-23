import test from 'node:test';
import assert from 'node:assert/strict';
import { manifestFor, stagingReady, publicationReady, ANGLES } from './hoodie-manifest.js';
import { fetchSource } from './source-fetch.js';

const variants = [{id:1,option1:'Black'},{id:2,option1:'Black'},{id:3,option1:'Navy'}];
const product = {id:9816989958403,status:'active',vendor:'Nopelex',product_type:'Hoodie',variants,
 images:[{id:100,src:'https://cdn.shopify.com/s/files/1/original.jpg',variant_ids:[1,2]}]};
const bytes = Buffer.from([0xff,0xd8,0xff,0xd9]);
const response = {ok:true,headers:new Headers({'content-type':'image/jpeg'}),arrayBuffer:async()=>bytes};
test('exact color and source bytes accepted',async()=>{
 const source=await fetchSource({product,color:'Black',imageId:100,fetchImpl:async()=>response});
 assert.equal(source.bytes.length,4);assert.equal(source.sha256.length,64);
});
test('rejects cross-color source assignment',async()=>{
 const changed={...product,images:[{...product.images[0],variant_ids:[3]}]};
 await assert.rejects(fetchSource({product:changed,color:'Black',imageId:100,fetchImpl:async()=>response}),/different color/);
});
test('rejects non-hoodies',async()=>{
 await assert.rejects(fetchSource({product:{...product,product_type:'T-Shirt'},color:'Black',imageId:100,fetchImpl:async()=>response}),/hoodie/);
});
test('staging gate and publication gate are distinct',()=>{
 const m=manifestFor({product,color:'Black',collectionProductIds:[product.id],
 sourceFront:{imageId:100,bytes},sourceBack:{imageId:101,bytes}});
 assert.equal(stagingReady(m),false);
 for(const angle of ANGLES) Object.assign(m.angles[angle],{status:'PASS',file:angle+'.jpg',sha256:'abc',visualQc:true,driveReadback:true});
 assert.equal(stagingReady(m),true);
 assert.equal(publicationReady(m),false);
 for(const angle of ANGLES) Object.assign(m.angles[angle],{shopifyMediaId:'gid://shopify/MediaImage/'+angle,shopifyReadback:true});
 assert.equal(publicationReady(m),true);
});
