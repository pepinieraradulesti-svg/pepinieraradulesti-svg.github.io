import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const brand=await readFile(new URL('../brand.svg',import.meta.url));
const esc=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function lines(text,max=27){const result=[];for(const word of String(text).split(/\s+/)){if(!result.length||result.at(-1).length+word.length+1>max)result.push(word);else result[result.length-1]+=' '+word}return result.slice(0,4)}
export async function socialImages(post,store,dir){
 const first=post.mediaIds.map(id=>store.media(id)).find(Boolean);
 const source=first?.files.find(f=>f.type==='image/jpeg')?.file||first?.files.find(f=>f.type==='image/webp')?.file;
 const layout=Number((post.template||'template-1').split('-').at(-1));
 async function draw(width,height,story){
  const dark=[1,3,7,10].includes(layout),bg=dark?'#15281c':'#faf7f0',fg=dark?'#faf7f0':'#15281c';
  const photoWidth=story?width-100:layout===9?400:[2,5,8].includes(layout)?590:width-100;
  const photoHeight=story?1040:layout===9?280:300;
  const x=story?50:layout===9?740:[2,5,8].includes(layout)?560:50,y=story?220:layout===9?220:140;
  const overlays=[];
  if(source){const photo=await sharp(join(dir,source)).rotate().resize({width:photoWidth,height:photoHeight,fit:'contain',background:bg,withoutEnlargement:false}).jpeg({quality:90}).toBuffer();overlays.push({input:photo,left:x,top:y});}
  const titleX=story?60:layout===9?60:[2,5,8].includes(layout)?60:60,titleY=story?1360:layout===9?180:[2,5,8].includes(layout)?240:490;
  const font=story?76:[2,5,8,9].includes(layout)?48:36,max=story?23:[2,5,8].includes(layout)||layout===9?18:45;
  const text=lines(post.title,max).slice(0,story||[2,5,8,9].includes(layout)?4:2).map((line,i)=>`<text x="${titleX}" y="${titleY+i*(font+10)}" fill="${fg}" font-size="${font}" font-family="Georgia,serif">${esc(line)}</text>`).join('');
  const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="60" y="108" width="88" height="3" fill="#c8a45f"/><text x="150" y="68" fill="${fg}" font-family="sans-serif" font-size="${story?27:25}">PEPINIERA RĂDULEȘTI</text>${text}<text x="60" y="${height-34}" fill="${fg}" font-family="sans-serif" font-size="${story?26:21}">Pomicolă · Vrancea</text></svg>`);
  overlays.push({input:await sharp(brand).resize(64,64).png().toBuffer(),left:60,top:24},{input:svg,left:0,top:0});
  return sharp({create:{width,height,channels:3,background:bg}}).composite(overlays).jpeg({quality:90}).toBuffer();
 }
 return{og:await draw(1200,630,false),story:await draw(1080,1920,true)};
}
