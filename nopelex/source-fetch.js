/**
 * Read-only, fail-closed Shopify source fetcher for NOPELEX Hoodies.
 * Node 20+. Never logs credentials or image bytes.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateSelection } from './hoodie-manifest.js';

const MAX_BYTES = 18 * 1024 * 1024;
const MIME = new Map([['image/jpeg','.jpg'],['image/png','.png'],['image/webp','.webp']]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function fetchSource({ product, color, imageId, expectedVariantIds, fetchImpl = fetch }) {
  const selected = validateSelection(product, color);
  const image = (product.images || []).find(i => String(i.id) === String(imageId));
  if (!image) throw new Error('Image does not belong to selected product');
  if (image.variant_ids?.length && !image.variant_ids.every(id => selected.includes(String(id))))
    throw new Error('Image is assigned to a different color variant');
  if (expectedVariantIds && selected.join(',') !== expectedVariantIds.map(String).join(','))
    throw new Error('Variant selection changed');
  const url = new URL(image.src);
  if (url.protocol !== 'https:' || !/(^|\\.)cdn\\.shopify\\.com$/.test(url.hostname))
    throw new Error('Unexpected image host');
  const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('Image fetch HTTP ' + res.status);
  const type = (res.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!MIME.has(type)) throw new Error('Unsupported source MIME');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('Source image size invalid');
  const valid = type === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8
    : type === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))
    : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
  if (!valid) throw new Error('Image magic bytes do not match MIME');
  return { imageId: String(imageId), bytes, mime: type, ext: MIME.get(type), sha256: sha256(bytes) };
}

export async function saveSource({ source, productId, color, side, root }) {
  if (!['FRONT','BACK'].includes(side)) throw new Error('Invalid source side');
  if (!/^\\d+$/.test(String(productId)) || !/^[A-Za-z0-9 _-]{1,40}$/.test(color))
    throw new Error('Invalid destination identifiers');
  const folder = path.join(root, 'Hoodies', String(productId), color, 'SOURCES');
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, side + '_' + source.imageId + '_' + source.sha256.slice(0,16) + source.ext);
  await writeFile(file, source.bytes, { flag: 'wx' });
  return { file, sha256: source.sha256, imageId: source.imageId };
}
