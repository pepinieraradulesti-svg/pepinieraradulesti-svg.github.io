import{mkdtemp,readFile,mkdir}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{createReadStream}from'node:fs';
import{Releases}from'./releases.mjs';import{StateIndex}from'./state-index.mjs';import{GitHub}from'./src/github.mjs';import{Store}from'./src/store.mjs';import{Media}from'./src/media.mjs';import{validateSource,digest,REPO}from'./protocol.mjs';
// Control real al accesului runnerului; nu creează pagini, release-uri publice sau postări de test.
if(process.env.GITHUB_REPOSITORY!==REPO)throw Error('Repository neautorizat.');
const token=process.env.GITHUB_TOKEN,api=new Releases(token),gh=new GitHub({});gh.token=async()=>token;
await gh.checkPages();const snapshot=await new StateIndex(api).read();const entries=Object.values(snapshot.state.media);let checked=0;
for(const pointer of entries.slice(0,3)){
 const source=validateSource(await api.api('/releases/'+pointer.releaseId)),dir=await mkdtemp(join(tmpdir(),'pepiniera-check-')),original=join(dir,'original');await api.download(source.asset,original);
 if(digest(await readFile(original))!==source.digest)throw Error('Sursă incompletă.');const store=new Store(dir);
 try{const media=new Media({data:dir,live:false,api:'https://api.github.com',ffmpeg:'ffmpeg',ffprobe:'ffprobe'},store),input=createReadStream(original);input.headers={'content-length':source.bytes};const result=await media.receive(input,source.kind);await media.social({title:'Verificare internă',template:'template-1',mediaIds:[result.id]});checked++;}finally{store.close()}
}
// Reconstruiește aceeași versiune a site-ului: confirmă permisiunea Pages a tokenului efemer.
await gh.api('/pages/builds','POST',{});
console.log(JSON.stringify({repository:REPO,pagesSource:'main:/docs',privateSourcesProcessed:checked,siteContentChanged:false,publicTestPosts:0,pagesBuildPermission:true}));
