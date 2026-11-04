import {readFile} from 'node:fs/promises';
export const templates=JSON.parse(await readFile(new URL('../templates.json',import.meta.url),'utf8'));
export const varieties=JSON.parse(await readFile(new URL('../varieties.json',import.meta.url),'utf8'));
export const newsCategories=[{id:'viata',name:'Viața în pepinieră'},{id:'lucrari',name:'Lucrări în teren'},{id:'fructe',name:'Fructe și soiuri'},{id:'sfaturi',name:'Sfaturi și îngrijire'},{id:'anunturi',name:'Evenimente și anunțuri'}];
