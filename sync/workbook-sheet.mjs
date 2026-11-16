import {unzipSync,zipSync,strFromU8} from 'fflate';
import path from 'node:path';

const LIMIT=16*1024*1024;
const attributes=tag=>Object.fromEntries([...tag.matchAll(/([\w:]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1],m[2].replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')]));
function extract(bytes,names){
 let total=0;
 return unzipSync(bytes,{filter(entry){
  if(!names.has(entry.name))return false;
  total+=entry.originalSize;
  if(entry.originalSize>LIMIT||total>2*LIMIT)throw Error('A aba consultada excedeu o limite de leitura segura. A última base válida foi mantida.');
  return true;
 }});
}
// Filter the ZIP before inflation: SheetJS's sheets option alone still inflates
// every worksheet, including unrelated hidden sheets hundreds of MB in size.
export function selectWorkbookSheet(bytes,sheetName){
 const metadataNames=new Set(['xl/workbook.xml','xl/_rels/workbook.xml.rels']);
 const metadata=extract(bytes,metadataNames);
 if([...metadataNames].some(name=>!metadata[name]))throw Error('Estrutura do arquivo Centralizados inválida.');
 const workbook=strFromU8(metadata['xl/workbook.xml']);
 const sheets=[...workbook.matchAll(/<sheet\b[^>]*>/g)].map(m=>attributes(m[0]));
 const sheet=sheets.find(s=>s.name===sheetName);
 if(!sheet)throw Error('A aba '+sheetName+' não foi encontrada.');
 const relations=[...strFromU8(metadata['xl/_rels/workbook.xml.rels']).matchAll(/<Relationship\b[^>]*>/g)].map(m=>attributes(m[0]));
 const relation=relations.find(r=>r.Id===sheet['r:id']);
 if(!relation?.Target||relation.TargetMode==='External')throw Error('Referência da aba Centralizados inválida.');
 const target=path.posix.normalize(relation.Target.startsWith('/')?relation.Target.slice(1):'xl/'+relation.Target);
 if(!target.startsWith('xl/worksheets/')||!target.endsWith('.xml'))throw Error('Endereço da aba Centralizados inválido.');
 const names=new Set([...metadataNames,'[Content_Types].xml','_rels/.rels','xl/styles.xml','xl/sharedStrings.xml','xl/metadata.xml',target]);
 const selected=extract(bytes,names);
 if(!selected[target])throw Error('Os dados da aba '+sheetName+' não foram encontrados.');
 return zipSync(selected,{level:0});
}
