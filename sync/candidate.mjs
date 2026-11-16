import {openPublicFolder} from './public-source.mjs';
import {parsePublicFiles} from './source-import.mjs';
import {compareDatasets,compareBlueDatasets} from './public/inventory-validation.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
await mkdir('candidate',{recursive:true});
for (const [kind,file] of [['inventory','dashboard_data.json.gz'],['blue-monitor','blue-monitor-data.json.gz']]) {
 const old=JSON.parse(gunzipSync(await readFile(file)).toString('utf8'));
 const folder=await openPublicFolder(kind);
 const next=await parsePublicFiles(kind,await folder.download());
 const comparison=kind==='inventory'?compareDatasets(old,next):compareBlueDatasets(old,next);
 if((comparison.errors||[]).length||(comparison.warnings||[]).length)throw Error(kind+': revisão manual necessária: '+JSON.stringify(comparison.warnings||comparison.errors));
 const payload=gzipSync(Buffer.from(JSON.stringify(next)),{level:9});
 await writeFile('candidate/'+kind+'.json.gz',payload);
 const metadata={collection:kind,generatedAt:new Date().toISOString(),records:next.records.length,files:folder.files.length,sha256:createHash('sha256').update(payload).digest('hex'),sourceFingerprint:folder.fingerprint,baselineRecords:old.records.length};
 await writeFile('candidate/'+kind+'.metadata.json',JSON.stringify(metadata,null,2));
 console.log(JSON.stringify(metadata));
}
