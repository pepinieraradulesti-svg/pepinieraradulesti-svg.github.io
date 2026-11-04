import {createHash} from 'node:crypto';import {overlay,publicRecord,publicPath} from './render.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
export async function verifyPublic(origin,changes,fetcher=fetch){for(const [path,content]of changes){const r=await fetcher(origin+'/'+path+(content===null?'':'?v='+sha(content).slice(0,12)),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000),redirect:'error'});if(content===null){await r.body?.cancel();if(r.status!==404)return false}else {if(r.status!==200||sha(Buffer.from(await r.arrayBuffer()))!==sha(content))return false}}return true}
export class Publisher{
 constructor(cfg,store,media,github,{fetcher=fetch,delay=ms=>new Promise(r=>setTimeout(r,ms)),attempts=60}={}){Object.assign(this,{cfg,store,media,github,fetcher,delay,attempts});this.running=false;this.stopped=false}
 async execute(job){if(!this.cfg.live)throw Error('Publicarea reală este dezactivată.');await this.github.checkPages();this.store.updateJob(job.id,'working');
 let commit=job.commit_sha||await this.github.recent(job.id);let changes;
 const build=async head=>{const records=this.store.confirmed().filter(p=>p.id!==job.post).map(p=>publicRecord(p,this.store,this.cfg.media));if(job.action==='publish')records.unshift(publicRecord(job.payload,this.store,this.cfg.media));records.sort((a,b)=>b.created.localeCompare(a.created));const reader=path=>this.github.read(path,head);const map=await overlay(reader,records,this.cfg.origin,job.id);if(job.action!=='publish'){const path=publicPath(job.payload).slice(1)+'index.html';if(await reader(path))map.set(path,null)}const manifest=JSON.parse(map.get('content/publications.json'));manifest.verificationPaths=[...map.keys()].filter(path=>path!=='content/publications.json');map.set('content/publications.json',JSON.stringify(manifest,null,2));return map};
 if(commit){const reader=path=>this.github.read(path,commit);const manifest=JSON.parse(await reader('content/publications.json'));if(manifest.revision!==job.id)throw Error('Confirmarea operației nu mai poate fi stabilită.');changes=new Map();
 const legacy=['index.html','pomi-fructiferi/index.html','galerie-foto/index.html','galerie-video/index.html',...((await import('./render.mjs')).catalog.map(c=>c.path.slice(1)+'index.html')),...manifest.posts.map(post=>publicPath(post).slice(1)+'index.html')];
 const paths=manifest.verificationPaths||legacy;
 if(!Array.isArray(paths)||paths.length>500||paths.some(path=>typeof path!=='string'||!/^[-a-z0-9._/]+$/.test(path)||path.includes('..')))throw Error('Manifest de verificare nevalid.');
 for(const path of paths)changes.set(path,await reader(path));
 changes.set('content/publications.json',await reader('content/publications.json'));
 if(job.action!=='publish')changes.set(publicPath(job.payload).slice(1)+'index.html',null);

 }else{
 if(job.action==='publish'){await this.media.publish(job.payload.mediaIds);if(this.media.publishSocial)await this.media.publishSocial({...job.payload,version:job.version});}
 for(let attempt=0;attempt<3;attempt++){const head=await this.github.head();changes=await build(head);try{commit=await this.github.commit(head,changes,job.id);break}catch(e){commit=await this.github.recent(job.id);if(commit)break;if(![409,422].includes(e.status)||attempt===2)throw e}}
 }
 this.store.updateJob(job.id,'verifying',{commit});for(let n=0;n<this.attempts;n++){if(this.stopped)return;try{if(await verifyPublic(this.cfg.origin,changes,this.fetcher)&&(job.action!=='publish'||await this.media.verify(job.payload.mediaIds)&&(!this.media.verifySocial||await this.media.verifySocial({...job.payload,version:job.version})))){this.store.confirm(job,{url:job.action==='publish'?this.cfg.origin+publicPath(job.payload):null,verifiedAt:new Date().toISOString(),commit});return}}catch{}await this.delay(10000)}throw Error('GitHub a primit modificările, dar site-ul nu le-a confirmat încă. Reia verificarea; nu publica din nou.');
 }
 async tick(){if(this.running||this.stopped||!this.cfg.live)return;this.running=true;try{for(const job of this.store.pending()){if(this.stopped)break;try{await this.execute(job)}catch{this.store.updateJob(job.id,'failed',{error:'Publicarea nu a putut fi confirmată. Verifică legătura sau cere ajutor administratorului.'})}}}finally{this.running=false}}
}
