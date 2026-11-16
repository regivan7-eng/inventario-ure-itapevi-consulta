import {selectWorkbookSheet} from './workbook-sheet.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseCentralizedMatrix,SHEET_NAME} from './public/centralized-model.js';
const origin='https://seesp-my.sharepoint.com';
const site='/personal/itp_seintec_educacao_sp_gov_br';
const share=origin+'/:x:/g'+site+'/IQCY6oGw1gOpSKowWEaizVBjAUEKmQ0LdKCpixR3wPHGFlE?e=UaPZ3Y';
const file=origin+site+"/_api/web/GetFileById('b081ea98-03d6-48a9-aa30-5846a2cd5063')";
let reader;
export async function readCentralizedWorkbook(bytes,meta={}){
 if(!reader){const module={exports:{}};vm.runInNewContext(await readFile(new URL('./public/xlsx.full.min.js',import.meta.url),'utf8'),{module,exports:module.exports,Buffer,Uint8Array,ArrayBuffer,TextDecoder,TextEncoder});reader=module.exports;}
 const book=reader.read(selectWorkbookSheet(new Uint8Array(bytes),SHEET_NAME),{type:'array',sheets:SHEET_NAME,cellFormula:false,cellStyles:false});
 const sheet=book.Sheets[SHEET_NAME];if(!sheet)throw Error('A aba Centralizados NOVO não foi encontrada.');
 for(const [address,cell]of Object.entries(sheet))if(!address.startsWith('!')&&cell.t==='e')throw Error('Centralizados NOVO!'+address+': erro de fórmula. Corrija a planilha compartilhada.');
 const rows=reader.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null});
 return parseCentralizedMatrix({sheetName:SHEET_NAME,rows,...meta});
}
export function createCentralizedSource({fetchImpl=fetch,now=Date.now,initial,readWorkbook=readCentralizedWorkbook}={}){
 let snapshot=initial,checked=0,inflight,lastNotice='',retryAfter=0;
 async function base(){return snapshot||=JSON.parse(await readFile(new URL('./public/centralized-data.json',import.meta.url),'utf8'));}
 async function refresh(){
  const previous=await base(),cookies=new Map(),signal=AbortSignal.timeout(90000);
  async function request(url,max=40*1024*1024){
   const res=await fetchImpl(url,{redirect:'manual',signal,headers:{Accept:'application/json;odata=verbose',Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')}});
   for(const cookie of res.headers.getSetCookie?.()||[]){const pair=cookie.split(';')[0],i=pair.indexOf('=');if(i>0)cookies.set(pair.slice(0,i),pair.slice(i+1));}
   if(url===share){if(!res.ok&&res.status!==302)throw Error('Não foi possível abrir o compartilhamento público.');await res.body?.cancel();return;}
   if(!res.ok)throw Error('O arquivo compartilhado recusou a leitura (HTTP '+res.status+').');
   let size=0;const chunks=[];for await(const chunk of res.body){size+=chunk.length;if(size>max)throw Error('O arquivo ultrapassa o limite de leitura segura.');chunks.push(chunk);}return Buffer.concat(chunks);
  }
  try{
   await request(share);
   const meta=JSON.parse((await request(file+'?$select=Name,TimeLastModified',1024*1024)).toString('utf8')).d;
   if(!meta?.Name||!meta.TimeLastModified)throw Error('Os metadados do arquivo não puderam ser conferidos.');
   const at=new Date(now()).toISOString();
   if(previous.sourceModified===meta.TimeLastModified){snapshot={...previous,checkedAt:at};checked=now();lastNotice='';retryAfter=0;return {...snapshot,stale:false};}
   const candidate=await readWorkbook(await request(file+'/$value'),{sourceModified:meta.TimeLastModified,checkedAt:at});
   snapshot={...candidate,sourceName:meta.Name};checked=now();lastNotice='';retryAfter=0;return {...snapshot,stale:false};
  }catch(error){retryAfter=now()+60000;lastNotice='Não foi possível atualizar Centralizados. A última base válida foi mantida. '+(error.name==='AbortError'||error.name==='TimeoutError'?'A consulta excedeu o tempo de espera.':error.name==='TypeError'?'Não foi possível conectar à origem pública.':error.message);return {...previous,stale:true,notice:lastNotice};}
 }
 return {async get({force=false,wait=true}={}){
  if(!force&&(retryAfter>now()||(checked&&now()-checked<15*60*1000)))return {...await base(),stale:!!lastNotice,refreshing:false,...(lastNotice?{notice:lastNotice}:{})};
  const previous=await base();
  if(!inflight)inflight=refresh().finally(()=>{inflight=null;});
  if(!wait&&!force)return {...previous,stale:true,refreshing:true,notice:'Exibindo a última base válida de Centralizados enquanto a origem pública é conferida.'};
  return inflight;
 }};
}
