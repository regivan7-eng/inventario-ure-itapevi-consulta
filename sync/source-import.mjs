import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {inspectFiles,inspectDataset,inspectBlueDataset} from './public/inventory-validation.js';
import {inspectIncomingIdentity} from './public/inventory-update.js';
let readers;
async function loadReaders(){
 if(!readers)readers=(async()=>{
  const x={exports:{}};vm.runInNewContext(await readFile(new URL('./public/xlsx.full.min.js',import.meta.url),'utf8'),{module:x,exports:x.exports,Buffer,TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,setTimeout,clearTimeout});
  const readWorkbook=x.exports.read;
  x.exports.read=(data,options)=>readWorkbook(options?.type==='array'?new Uint8Array(data):data,options);
  const csv={};vm.runInNewContext(await readFile(new URL('./public/blue-monitor-csv.js',import.meta.url),'utf8'),{window:csv});
  return {XLSX:x.exports,csv:csv.blueMonitorCsv};
 })();return readers;
}
export class ValidationError extends Error{constructor(problems){super('Os arquivos não passaram na verificação.');this.name='ValidationError';this.problems=problems;}}
const check=problems=>{if(problems.length)throw new ValidationError(problems);};
export async function parsePublicFiles(collection,files,{onProgress}={}){
 const {XLSX,csv}=await loadReaders();
 if(collection==='blue-monitor'){
  check(files.length!==1||!/^Relação BLUE MONITOR\.csv$/iu.test(files[0]?.name||'')?['A pasta BlueMonitor deve conter somente o arquivo “Relação BLUE MONITOR.csv”.']:[]);
  let records;try{records=csv.parse(files[0].bytes.toString('utf8'));}catch(e){throw new ValidationError([files[0].name+': '+e.message]);}
  check(records.length>200000||records.some(row=>Object.values(row).some(value=>typeof value!=='string'||value.length>8192))?['O CSV excede os limites de registros ou de tamanho das células.']:[]);
  const dataset={source:files[0].name,records};check(inspectBlueDataset(dataset).errors);return dataset;
 }
 if(collection!=='inventory')throw new ValidationError(['Base desconhecida.']);
 const inspection=await inspectFiles(files,XLSX,{checkIdentity:true,onProgress});check(inspection.errors);
 const dataset=inspection.dataset;
 // Reuse the same inspected rows as the manual importer, including completed
 // identities and excluded residual template rows. Never aggregate raw rows again.
 check(dataset.qualidade.erros_formula.map(cell=>cell.arquivo+' · '+cell.aba+'!'+cell.celula+': erro de fórmula. Corrija a planilha original.'));
 for(const book of dataset.workbooks)book.base=book.arquivo;
 check([...inspectDataset(dataset).errors,...inspectIncomingIdentity(dataset).errors]);
 dataset.meta.fonte='Pasta pública SharePoint';dataset.meta.diretorio_fonte='InventarioRC - V2';
 return dataset;
}

