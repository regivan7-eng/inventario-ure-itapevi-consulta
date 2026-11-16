export async function readSyncPreview(response,onProgress){
 if(!response.headers.get('content-type')?.includes('application/x-ndjson'))return {ok:response.ok,value:await response.json()};
 const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',result;
 const line=value=>{if(!value.trim())return;const event=JSON.parse(value);if(event.type==='progress')onProgress?.(event.data);else if(event.type==='result'||event.type==='error'){if(result)throw Error('Resposta duplicada da verificação.');result={ok:event.type==='result',value:event.data};}};
 try{
  while(true){const {value,done}=await reader.read();pending+=decoder.decode(value,{stream:!done});if(pending.length>64*1024*1024)throw Error('A resposta da verificação excedeu o limite permitido.');let at;while((at=pending.indexOf('\n'))>=0){line(pending.slice(0,at));pending=pending.slice(at+1);}if(done)break;}
  if(pending)line(pending);if(!result)throw Error('A conexão foi interrompida antes de concluir a verificação. A base publicada foi mantida.');return result;
 }finally{reader.releaseLock();}
}
