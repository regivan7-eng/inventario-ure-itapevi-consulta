import {openPublicFolder} from './public-source.mjs';
import {parsePublicFiles} from './source-import.mjs';
import {compareDatasets,compareBlueDatasets} from './public/inventory-validation.js';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
let failed=false;
for (const [kind,file] of [['inventory','dashboard_data.json.gz'],['blue-monitor','blue-monitor-data.json.gz']]) {
 try {
  const old=JSON.parse(gunzipSync(await readFile(file)).toString('utf8'));
  const folder=await openPublicFolder(kind);
  console.log(kind+': '+folder.files.length+' arquivos encontrados.');
  const next=await parsePublicFiles(kind,await folder.download());
  const comparison=kind==='inventory'?compareDatasets(old,next):compareBlueDatasets(old,next);
  console.log('RESULT '+kind+' anterior='+old.records.length+' atual='+next.records.length+' avisos='+(comparison.warnings||[]).length+' erros='+(comparison.errors||[]).length);
  if((comparison.errors||[]).length||(comparison.warnings||[]).length)failed=true;
 } catch(e) {failed=true;console.error(kind+': '+(e.problems||[e.message]).join('; '));}
}
if(failed)process.exit(1); console.log('VERIFICACAO_CONCLUIDA');
