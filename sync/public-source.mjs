import {createHash} from 'node:crypto';
import {publicFileCache} from './public-source-cache.mjs';
const origin='https://seesp-my.sharepoint.com';
const site='/personal/itp_seintec_educacao_sp_gov_br';
export const PUBLIC_SOURCES={
 inventory:{link:origin+'/:f:/g'+site+'/IgB8vpIGfSrASqjEmj6GOt1qAQkde-of1KFn02Exzl6miyc?e=FJdlY7',folder:site+'/Documents/INVENTARIO 2026/InventarioRC - V2'},
 'blue-monitor':{link:origin+'/:f:/g'+site+'/IgCIjJ6wthalSYrJjVhKT_8jAQ-KvHYSBmWVuWy5NEBTbCc?e=iYkS7J',folder:site+'/Documents/INVENTARIO 2026/BlueMonitor'}
};
export class SourceError extends Error {constructor(message,{retryable=false,status=null}={}){super(message);this.name='SourceError';this.problems=[message];this.retryable=retryable;this.status=status;}}
const odata=p=>encodeURIComponent(p.replace(/'/g,"''"));
export const fingerprint=files=>createHash('sha256').update(JSON.stringify(files.map(f=>[f.name,f.modified,f.size]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
const temporaryStatus=status=>[408,425,429,500,502,503,504].includes(status);
const backoff=(attempt,retryAfter)=>{
 const value=String(retryAfter||'').trim();let requested=0;
 if(/^\d+$/.test(value))requested=Number(value)*1000;
 else if(value){const date=Date.parse(value);if(Number.isFinite(date))requested=Math.max(0,date-Date.now());}
 return Math.min(10000,Math.max(400*2**attempt,requested));
};
export async function openPublicFolder(collection,{fetchImpl=fetch,sleepImpl=ms=>new Promise(resolve=>setTimeout(resolve,ms)),cache=publicFileCache,onProgress}={}){
 const source=PUBLIC_SOURCES[collection];if(!source)throw new SourceError('Base de origem desconhecida.');
 const cookies=new Map(),deadline=AbortSignal.timeout(120000);
 const progress=value=>{try{onProgress?.(value);}catch{}};
 async function request(address,max=2*1024*1024,signal){
  let url=new URL(address,origin);
  for(let redirect=0;redirect<10;redirect++){
   if(url.protocol!=='https:'||url.origin!==origin)throw new SourceError('O SharePoint solicitou login ou redirecionou para um endereço não autorizado. Confira o link público de leitura.');
   let response,attempt=0;
   while(true){
    try{response=await fetchImpl(url,{headers:{Accept:'application/json;odata=verbose','Cookie':[...cookies].map(([k,v])=>k+'='+v).join('; ')},redirect:'manual',signal:AbortSignal.any([deadline,AbortSignal.timeout(45000),...(signal?[signal]:[])])});}
    catch{
     if(signal?.aborted||deadline.aborted)throw new SourceError('A leitura da pasta foi interrompida ou excedeu o tempo limite. A base publicada foi mantida.',{retryable:true});
     if(attempt<2){await sleepImpl(backoff(attempt));attempt++;continue;}
     throw new SourceError('Não foi possível consultar o SharePoint por uma falha temporária de conexão. A base publicada foi mantida; a automação tentará novamente na próxima janela.',{retryable:true});
    }
    if(temporaryStatus(response.status)){
     const status=response.status,wait=backoff(attempt,response.headers.get('retry-after'));
     await response.body?.cancel().catch(()=>{});
     if(attempt<2){await sleepImpl(wait);attempt++;continue;}
     throw new SourceError('O SharePoint respondeu HTTP '+status+' e está temporariamente indisponível. A base publicada foi mantida; a automação tentará novamente na próxima janela.',{retryable:true,status});
    }
    break;
   }
   for(const cookie of response.headers.getSetCookie?.()||[]){
    const pair=cookie.split(';')[0],equal=pair.indexOf('=');if(equal>0)cookies.set(pair.slice(0,equal),pair.slice(equal+1));
   }
   if([301,302,303,307,308].includes(response.status)){const to=response.headers.get('location');await response.body?.cancel();if(!to)break;url=new URL(to,url);continue;}
   if(!response.ok){await response.body?.cancel();throw new SourceError('O SharePoint recusou a leitura da pasta (HTTP '+response.status+'). Confira o compartilhamento público de leitura; a base publicada foi mantida.',{status:response.status});}
   const chunks=[];let size=0;
   for await(const chunk of response.body){size+=chunk.length;if(size>max){await response.body.cancel().catch(()=>{});throw new SourceError('O arquivo ou a listagem ultrapassou o limite de leitura segura.');}chunks.push(chunk);}
   return {bytes:Buffer.concat(chunks),type:response.headers.get('content-type')||''};
  }
  throw new SourceError('O link público excedeu o limite de redirecionamentos.');
 }
 // A fresh anonymous sharing session is established on every run; no user login is used.
 progress({phase:'source',message:'Conectando à pasta pública…'});
 await request(source.link);
 async function list(){
  const url=origin+site+"/_api/web/GetFolderByServerRelativeUrl('"+odata(source.folder)+"')/Files?$select=Name,ServerRelativeUrl,TimeLastModified,Length&$top=500";
  const result=await request(url);let body;
  try{body=JSON.parse(result.bytes.toString('utf8'));}catch{throw new SourceError('O SharePoint não retornou uma listagem pública de arquivos válida.');}
  const rows=body.d?.results??body.value;if(!Array.isArray(rows)||body.d?.__next||body['@odata.nextLink'])throw new SourceError('Não foi possível conferir a lista completa da pasta. Nenhuma atualização foi publicada.');
  if(!rows.length)throw new SourceError('A pasta pública está vazia. A base anterior foi mantida.');
  if(rows.length>300)throw new SourceError('A pasta ultrapassou o limite de 300 arquivos por verificação.');
  return rows.filter(f=>!f.Name?.startsWith('~$')).map(f=>{
   if(typeof f.Name!=='string'||typeof f.ServerRelativeUrl!=='string'||!f.ServerRelativeUrl.startsWith(source.folder+'/'))throw new SourceError('A listagem contém um arquivo fora da pasta autorizada.');
   return {name:f.Name,serverPath:f.ServerRelativeUrl,modified:f.TimeLastModified,size:Number(f.Length)};
  });
 }
 progress({phase:'listing',message:'Conferindo os arquivos da pasta…'});
 const files=await list();
 return {files,fingerprint:fingerprint(files),async download(){
  let total=0,next=0,completed=0,reused=0;const downloaded=new Array(files.length),staged=[],stop=new AbortController();let failure;
  progress({phase:'download',completed,total:files.length,reused,message:'Preparando a leitura de '+files.length+' arquivo(s)…'});
  async function worker(){
   while(!stop.signal.aborted){
    const index=next++;if(index>=files.length)return;const file=files[index];
    try{
     const key=file.modified&&Number.isFinite(file.size)?JSON.stringify([collection,file.serverPath,file.modified,file.size]):null;
     let bytes=key?cache.get(key):null;
     if(bytes)reused++;
     else{
      const response=await request(origin+site+"/_api/web/GetFileByServerRelativeUrl('"+odata(file.serverPath)+"')/$value",25*1024*1024,stop.signal);
      if(/text\/html/i.test(response.type))throw new SourceError(file.name+': o SharePoint retornou uma página de acesso em vez do arquivo.');
      bytes=response.bytes;if(key)staged.push([key,bytes]);
     }
     total+=bytes.length;if(total>80*1024*1024)throw new SourceError('A pasta excede 80 MB. A atualização automática foi bloqueada.');
     downloaded[index]={...file,bytes,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
     completed++;progress({phase:'download',completed,total:files.length,reused,file:file.name,message:'Arquivos conferidos: '+completed+' de '+files.length+(reused?' · '+reused+' sem alteração':'')});
    }catch(error){failure??=error;stop.abort();return;}
   }
  }
  // Four transfers hide network latency without flooding the public source.
  await Promise.all(Array.from({length:Math.min(4,files.length)},worker));
  if(failure)throw failure;
  progress({phase:'consistency',completed,total:files.length,reused,message:'Confirmando que a pasta permaneceu estável…'});
  if(fingerprint(await list())!==fingerprint(files))throw new SourceError('A pasta mudou durante a leitura. Confira os arquivos e refaça a atualização manual.');
  for(const [key,bytes]of staged)cache.set(key,bytes);
  return downloaded;
 }};
}


