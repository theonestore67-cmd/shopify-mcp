/**
 * Configurable reference-image editing adapter for a private OpenAI-compatible
 * image editing API. Never falls back to text-to-image (which would redraw prints).
 *
 * Environment:
 * NOPELEX_IMAGE_EDIT_URL=https://your-provider.example/v1/images/edits
 * NOPELEX_IMAGE_EDIT_API_KEY=... (secret)
 * NOPELEX_IMAGE_EDIT_MODEL=... (model supporting two reference images)
 */
import { ANGLES } from './hoodie-manifest.js';

const descriptions={
 FRONT:'straight-on front view, front chest logo in exactly its original position',
 BACK:'straight-on back view, back print preserved pixel-faithfully',
 LEFT_3Q:'left three-quarter garment view, no invented visible artwork',
 RIGHT_3Q:'right three-quarter garment view, no invented visible artwork',
 PRINT_CLOSEUP:'close-up of authentic existing print and fabric texture',
 HERO:'premium editorial garment hero shot, original art unchanged'
};
const imageMime=new Set(['image/png','image/jpeg','image/webp']);
export class ReferenceImageRenderer {
  constructor({fetchImpl=fetch}={}){this.fetch=fetchImpl;}
  async renderAngle({angle,product,color,source}){
    if(!ANGLES.includes(angle)) throw new Error('Unknown angle');
    const endpoint=process.env.NOPELEX_IMAGE_EDIT_URL;
    const key=process.env.NOPELEX_IMAGE_EDIT_API_KEY;
    const model=process.env.NOPELEX_IMAGE_EDIT_MODEL;
    if(!endpoint||!key||!model) throw new Error('Image editing provider not configured');
    const url=new URL(endpoint);
    if(url.protocol!=='https:') throw new Error('Image editing endpoint must use HTTPS');
    const form=new FormData();
    form.append('model',model);
    form.append('prompt',[
      'Create exactly one photorealistic premium ecommerce mockup of the supplied',
      product.title,'in exact color',color+'.',descriptions[angle]+'.',
      'Both attached images show the actual product. Preserve every printed letter,',
      'graphic, logo, placement, color, cut, fabric and seam. Do not redraw, replace,',
      'reinterpret, mirror or invent artwork. One image only, no collage, no watermark.'
    ].join(' '));
    for(const side of ['FRONT','BACK']){
      const src=source[side];
      if(!src?.bytes?.length||!imageMime.has(src.mime)) throw new Error('Missing '+side+' source');
      form.append('image[]',new Blob([src.bytes],{type:src.mime}),side+src.ext);
    }
    const response=await this.fetch(url,{method:'POST',
      headers:{Authorization:'Bearer '+key},body:form,signal:AbortSignal.timeout(180000)});
    if(!response.ok) throw new Error('Image editing HTTP '+response.status);
    const json=await response.json();
    const encoded=json.data?.[0]?.b64_json;
    if(typeof encoded!=='string'||encoded.length<1000)
      throw new Error('Provider did not return inline image bytes');
    const bytes=Buffer.from(encoded,'base64');
    if(bytes.length<1024||bytes.length>25*1024*1024) throw new Error('Invalid image size');
    const mime=bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))?'image/png':
      bytes[0]===0xff&&bytes[1]===0xd8?'image/jpeg':
      bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
    if(!mime) throw new Error('Invalid returned image format');
    return {bytes,mime};
  }
}
