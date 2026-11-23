/**
 * Google Drive adapter: OAuth refresh token, exact folder hierarchy and binary readback.
 * Requires GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET,
 * GOOGLE_DRIVE_REFRESH_TOKEN, GOOGLE_DRIVE_ROOT_FOLDER_ID.
 * No credentials are committed to source control.
 */
import { createHash } from 'node:crypto';

const sha = b => createHash('sha256').update(b).digest('hex');
const requireEnv = k => { if(!process.env[k]) throw new Error('Missing '+k); return process.env[k]; };
const quote = s => String(s).replaceAll('\\','\\\\').replaceAll("'","\\'");
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export class DriveAdapter {
  constructor({fetchImpl=fetch}={}) { this.fetch=fetchImpl; this.cache=new Map(); this.token=null; this.expires=0; }
  async accessToken() {
    if(this.token && Date.now()<this.expires) return this.token;
    const body=new URLSearchParams({client_id:requireEnv('GOOGLE_DRIVE_CLIENT_ID'),
      client_secret:requireEnv('GOOGLE_DRIVE_CLIENT_SECRET'),
      refresh_token:requireEnv('GOOGLE_DRIVE_REFRESH_TOKEN'),grant_type:'refresh_token'});
    const r=await this.fetch('https://oauth2.googleapis.com/token',{method:'POST',body});
    if(!r.ok) throw new Error('Drive OAuth token failed: '+r.status);
    const j=await r.json();this.token=j.access_token;this.expires=Date.now()+(j.expires_in-120)*1000;return this.token;
  }
  async request(url,options={}) {
    const token=await this.accessToken();
    const r=await this.fetch(url,{...options,headers:{Authorization:'Bearer '+token,...options.headers}});
    if(!r.ok) throw new Error('Drive HTTP '+r.status+' on '+new URL(url).pathname);
    return r;
  }
  async folder(parent,name) {
    const key=parent+'/'+name;if(this.cache.has(key)) return this.cache.get(key);
    const q=`name = '${quote(name)}' and '${quote(parent)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const u=new URL(DRIVE+'/files');u.searchParams.set('q',q);u.searchParams.set('fields','nextPageToken,files(id,name)');
    u.searchParams.set('page_size','100');
    const result=await (await this.request(u)).json();
    if(result.nextPageToken) throw new Error('Folder listing pagination unsupported: fail closed');
    if(result.files.length>1) throw new Error('Ambiguous Drive folder '+name);
    let id=result.files[0]?.id;
    if(!id) {
      const created=await this.request(DRIVE+'/files',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parent]})});
      id=(await created.json()).id;
    }
    if(!id) throw new Error('Drive folder ID missing');
    this.cache.set(key,id);return id;
  }
  async parentFor(key) {
    const parts=key.split('/');if(parts.some(p=>!p||p==='.'||p==='..')) throw new Error('Unsafe Drive key');
    if(parts.shift()!=='NOPELEX') throw new Error('Drive path must start with NOPELEX');
    let parent=requireEnv('GOOGLE_DRIVE_ROOT_FOLDER_ID');
    for(const part of parts.slice(0,-1)) parent=await this.folder(parent,part);
    return {parent,name:parts.at(-1)};
  }
  async locate(parent,name) {
    const q=`name = '${quote(name)}' and '${quote(parent)}' in parents and trashed = false`;
    const u=new URL(DRIVE+'/files');u.searchParams.set('q',q);u.searchParams.set('fields','nextPageToken,files(id,name,size,md5Checksum)');
    const result=await (await this.request(u)).json();
    if(result.nextPageToken||result.files.length>1) throw new Error('Ambiguous Drive file');
    return result.files[0];
  }
  async put(key,bytes,mime) {
    if(!Buffer.isBuffer(bytes)||!bytes.length) throw new Error('Empty upload');
    const {parent,name}=await this.parentFor(key);
    const existing=await this.locate(parent,name);
    if(existing) {
      const current=await this.get(key);
      if(sha(current)!==sha(bytes)) throw new Error('Drive filename conflict with different content');
      return {id:existing.id,sha256:sha(bytes)};
    }
    const boundary='nopelex_'+crypto.randomUUID().replaceAll('-','');
    const meta=JSON.stringify({name,parents:[parent]});
    const body=Buffer.concat([
      Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+meta+'\r\n'),
      Buffer.from('--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n'),bytes,
      Buffer.from('\r\n--'+boundary+'--\r\n')]);
    const r=await this.request(UPLOAD+'/files?uploadType=multipart&fields=id,name,size',{method:'POST',
      headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
    const file=await r.json();if(!file.id) throw new Error('Drive upload ID missing');
    return {id:file.id,sha256:sha(bytes)};
  }
  async get(key) {
    const {parent,name}=await this.parentFor(key);const file=await this.locate(parent,name);
    if(!file) throw new Error('Drive readback missing '+name);
    return Buffer.from(await (await this.request(DRIVE+'/files/'+encodeURIComponent(file.id)+'?alt=media')).arrayBuffer());
  }
}
