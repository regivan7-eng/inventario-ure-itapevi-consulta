import {createCentralizedSource} from './centralized-source.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const source=await createCentralizedSource().get({force:true,wait:true});
if(source.stale) throw new Error(source.notice||'Falha ao conferir a origem.');
if(!Array.isArray(source.records) || !source.records.length || !source.sourceModified) throw new Error('Conteúdo de Centralizados inválido; base anterior mantida.');
await mkdir('candidate',{recursive:true});
await writeFile('candidate/centralized.json',JSON.stringify(source));
console.log('Centralizados confirmado:',source.records.length,'registros; fonte:',source.sourceModified);
