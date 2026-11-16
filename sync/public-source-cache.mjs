// Process-local optimization only; every use still requires a successful
// anonymous session and a fresh, stable folder listing. Never a fallback source.
export function createPublicFileCache({maxBytes=32*1024*1024,ttlMs=300000,now=Date.now}={}){
 const entries=new Map();let bytes=0;
 const remove=key=>{const item=entries.get(key);if(item){bytes-=item.bytes.length;entries.delete(key);}};
 return {
  get(key){const item=entries.get(key);if(!item)return null;if(now()-item.at>=ttlMs){remove(key);return null;}entries.delete(key);entries.set(key,item);return item.bytes;},
  set(key,value){if(!key||value.length>maxBytes)return;remove(key);for(const [id,item]of entries)if(now()-item.at>=ttlMs)remove(id);while(bytes+value.length>maxBytes&&entries.size)remove(entries.keys().next().value);entries.set(key,{bytes:value,at:now()});bytes+=value.length;},
  clear(){entries.clear();bytes=0;}
 };
}
export const publicFileCache=createPublicFileCache();
