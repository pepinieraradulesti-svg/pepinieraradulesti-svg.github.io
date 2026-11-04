import {socialImages} from './social.mjs';
import {createWriteStream} from 'node:fs';import {mkdir,readFile,unlink,stat,readdir} from 'node:fs/promises';import {join} from 'node:path';import {randomUUID} from 'node:crypto';import {Transform} from 'node:stream';import {pipeline} from 'node:stream/promises';import {spawn} from 'node:child_process';
import sharp from 'sharp';import {hash} from './store.mjs';
export const LIMIT_PHOTO=20*1024*1024,LIMIT_VIDEO=100*1024*1024;
const fail=(s,status=400)=>Object.assign(Error(s),{status});
export function command(bin,args,timeout=180000){return new Promise((resolve,reject)=>{const p=spawn(bin,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>{p.kill();reject(fail('Prelucrarea videoclipului a durat prea mult.',422))},timeout);p.stdout.on('data',b=>{out+=b;if(out.length>1000000)p.kill()});p.stderr.on('data',b=>{err=(err+b).slice(-1000)});p.on('error',()=>{clearTimeout(timer);reject(fail('Instrumentele pentru video nu sunt disponibile.',503))});p.on('close',c=>{clearTimeout(timer);c===0?resolve(out):reject(fail('Fișierul video nu poate fi prelucrat.',422))})})}
export class Media{
 constructor(cfg,store){this.cfg=cfg;this.store=store;this.dir=join(cfg.data,'media');this.uploading=false;this.s3=null}
 url(file){return (this.cfg.media||this.cfg.api)+'/media/'+file}
 async receive(req,kind){if(!['photo','video'].includes(kind))throw fail('Alege fotografii sau videoclipuri.');if(this.uploading)throw fail('Un fișier este deja în prelucrare. Încearcă din nou.',429);this.uploading=true;await mkdir(this.dir,{recursive:true,mode:0o700});const id=randomUUID(),source=join(this.dir,id+'.incoming');let count=0;try{
 const limit=kind==='photo'?LIMIT_PHOTO:LIMIT_VIDEO;if(Number(req.headers?.['content-length'])>limit){req.resume();throw fail('Fișier prea mare. Limita este 20 MB pentru poze și 100 MB pentru video.',413);}
 const quota=Number(this.store.db.prepare('SELECT COUNT(*) AS n FROM media').get().n);if(quota>=1000||this.store.db.prepare("SELECT COALESCE(SUM(json_extract(data,'$.bytes')),0) AS bytes FROM media").get().bytes>=2*1024*1024*1024)throw fail('Spațiul de administrare necesită curățare.',507);
 await pipeline(req,new Transform({transform(chunk,_,cb){count+=chunk.length;cb(count>limit?fail('Fișier prea mare. Limita este 20 MB pentru poze și 100 MB pentru video.',413):null,chunk)}}),createWriteStream(source,{flags:'wx',mode:0o600}));if(!count)throw fail('Fișierul este gol.');
 const digest=hash(await readFile(source)),old=this.store.mediaByHash(digest);if(old){if(old.kind!==kind)throw fail('Tipul fișierului nu corespunde selecției.',422);return old;}
 const files=[];let media;
 if(kind==='photo'){
 const image=sharp(source,{limitInputPixels:50_000_000,failOn:'warning'});const meta=await image.metadata();if(!['jpeg','png','webp','heif','avif'].includes(meta.format)||meta.pages>1)throw fail('Folosește o fotografie JPG, PNG, WebP sau HEIC simplă.',422);
 for(const size of [640,1600]){const file=id+'-'+size+'.webp';const info=await sharp(source,{limitInputPixels:50_000_000}).rotate().resize({width:size,height:size,fit:'inside',withoutEnlargement:true}).webp({quality:86}).toFile(join(this.dir,file));files.push({file,type:'image/webp',width:info.width,height:info.height})}
 const poster=id+'-partajare.jpg';await sharp(source,{limitInputPixels:50_000_000}).rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toFile(join(this.dir,poster));files.push({file:poster,type:'image/jpeg'});
 media={id,kind,url:this.url(id+'-1600.webp'),thumbnail:this.url(id+'-640.webp'),poster:this.url(poster),files};
 }else{
 const meta=JSON.parse(await command(this.cfg.ffprobe,['-v','error','-show_format','-show_streams','-of','json',source],30000));const video=meta.streams?.find(s=>s.codec_type==='video');const duration=Number(meta.format?.duration);if(!video||!Number.isFinite(duration)||duration<=0||duration>180||video.width*video.height>34_000_000)throw fail('Videoclipul trebuie să aibă cel mult 3 minute și rezoluție obișnuită.',422);
 const file=id+'.mp4',poster=id+'-partajare.jpg';await command(this.cfg.ffmpeg,['-v','error','-y','-i',source,'-map','0:v:0','-map','0:a:0?','-vf',"scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",'-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart','-map_metadata','-1',join(this.dir,file)]);
 await command(this.cfg.ffmpeg,['-v','error','-y','-i',join(this.dir,file),'-frames:v','1','-vf','scale=1200:1200:force_original_aspect_ratio=decrease',join(this.dir,poster)],30000);files.push({file,type:'video/mp4'},{file:poster,type:'image/jpeg'});media={id,kind,duration,url:this.url(file),thumbnail:this.url(poster),poster:this.url(poster),files};
 }
 media.digest=digest;media.preview=this.cfg.api+'/v1/media/'+id+'/thumbnail';media.bytes=(await Promise.all(files.map(x=>stat(join(this.dir,x.file))))).reduce((a,s)=>a+s.size,0);return this.store.saveMedia(digest,media);
 }catch(e){if(e.status)throw e;throw fail('Fișierul nu poate fi citit. Alege altă fotografie sau alt videoclip.',422)}finally{await unlink(source).catch(()=>{});if(!this.store.media(id)){for(const file of await readdir(this.dir)){if(file.startsWith(id+'-')||file===id+'.mp4')await unlink(join(this.dir,file)).catch(()=>{});}}this.uploading=false}}
 async social(post){return socialImages(post,this.store,this.dir)}
 async publishSocial(){throw Error('Folosește publicarea GitHub.')}
 async publish(){throw Error('Folosește publicarea GitHub.')}
}
