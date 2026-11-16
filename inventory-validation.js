import {aggregateImportedData} from './inventory-aggregate.js';
import {inventorySchools,filenameIdentity} from './inventory-schools.js';
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
const text = value => String(value ?? '').trim();
const groups={cie:['CIE'],ure:['URE / DIRETORIA','URE','DIRETORIA'],status:['STATUS DO EQUIPAMENTO','STATUS'],category:['CATEGORIA DO EQUIPAMENTO','TIPO DE EQUIPAMENTO'],serial:['NÚMERO DE SÉRIE','NUMERO DE SERIE','NÚMERO SERIE','SERIAL'],model:['MODELO','TIPO / MODELO'],maker:['FABRICANTE','MARCA','MARCA / FABRICANTE'],assessment:['AVALIAÇÃO TÉCNICA','AVALIACAO TÉCNICA','AVALIAÇÃO','AVALIACAO'],environment:['AMBIENTE']};
const aliases=Object.fromEntries(Object.entries(groups).map(([key,values])=>[key,values.map(normalize)]));
export function inspectHeaders(headers,{allowMissingIdentity=false}={}){
 const set=new Set(headers.map(normalize));const has=key=>aliases[key].some(x=>set.has(x));
 const missing=(allowMissingIdentity?['status']:['cie','ure','status']).filter(k=>!has(k)).map(k=>({cie:'CIE',ure:'URE / DIRETORIA',status:'STATUS DO EQUIPAMENTO'}[k]));
 const evidence=['category','serial','model','maker','assessment','environment'].filter(has);
 if(evidence.length<2)missing.push('ao menos dois campos próprios do inventário (categoria, serial, modelo, fabricante, avaliação ou ambiente)');
 return {valid:!missing.length,missing};
}
export function rawField(row,group){if(group==='cie'&&Object.hasOwn(row,'CIE'))return text(row.CIE);if(group==='ure'&&Object.hasOwn(row,'URE / DIRETORIA'))return text(row['URE / DIRETORIA']);for(const [k,v]of Object.entries(row))if(aliases[group].includes(normalize(k))&&text(v))return text(v);return '';}
const validCie=value=>/^[1-9]\d{0,11}$/.test(text(value));
export function inspectDataset(data){
 const errors=[];const add=message=>{if(errors.length<20&&!errors.includes(message))errors.push(message);};
 if(!data||!Array.isArray(data.records)||!Array.isArray(data.workbooks)||!data.workbooks.length||!data.meta||!Array.isArray(data.qualidade?.erros_formula))return {errors:['Os arquivos não geraram uma base de inventário completa e válida.']};
 if(data.records.length>200000)add('A base excede 200.000 registros.');
 const schemas=new Map();let validIds=0;
 for(const row of data.records){
  if(!row||typeof row!=='object'||Array.isArray(row)){add('A base contém registros inválidos.');continue;}
  const keys=Object.keys(row),key=keys.join('\u0000');let schema=schemas.get(key);if(!schema){schema=inspectHeaders(keys);schemas.set(key,schema);}
  const source=[text(row.arquivo),text(row.aba)].filter(Boolean).join(' · ')||'Registro sem origem';
  if(!schema.valid){add(source+': estrutura incompatível. Faltam '+schema.missing.join(', ')+'.');continue;}
  const filenameCie=text(row.arquivo).match(/^(?:CIE\s*)?([1-9]\d{0,11})\s*[-–—_]/i)?.[1];
  if(normalize(row.ure)!=='ITAPEVI'||normalize(rawField(row,'ure')||(filenameCie?'ITAPEVI':''))!=='ITAPEVI'){add(source+': registro fora da URE Itapevi ou identificação inconsistente.');continue;}
  const cie=text(row.cie),rawCie=rawField(row,'cie');if(cie!==(rawCie||filenameCie||''))add(source+': CIE inconsistente entre o registro e a coluna original.');
  if(cie&&!validCie(cie))add(source+': CIE inválido ('+cie.slice(0,40)+').');else if(validCie(cie))validIds++;
  if(!text(row.arquivo)||!text(row.aba)||!text(row.unidade))add(source+': falta identificação do arquivo, aba ou escola.');
  for(const v of Object.values(row))if(v!==null&&typeof v==='object')add(source+': conteúdo de célula inválido.');
 }
 if(!validIds&&!inventorySchools(data).length)add('Nenhum CIE válido foi encontrado.');
 const files=new Set(data.workbooks.map(f=>text(f?.arquivo)));if(files.has(''))add('Há arquivos sem identificação.');
 for(const row of data.records)if(row&& !files.has(text(row.arquivo)))add('Há registros sem correspondência nos arquivos de origem.');
 return {errors};
}
const serialMissing=new Set(['','-','--','SN','NA','N/A','NOC','NAOCONSTA','NAOINFORMADO','NAOIDENTIFICADO','SEMSN','SEMSERIAL','SEMSERIE','SEMNUMERODESERIE','SEMNUMEROSERIE','SEMIDENTIFICACAO','0','NULL','ILEGIVEL']);
const serialIssue=value=>{const raw=text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(),compact=raw.replace(/[^A-Z0-9]/g,'');return serialMissing.has(raw.replace(/\s+/g,''))||serialMissing.has(compact)||/POSSIVEL|CAIXOTE|TRANCAD|DENTRO DE|NAO FOI|NAO TEM|SEM ACESSO|NAO LOCALIZAD|INEXISTENTE|VERIFICAR|ETIQUETA AUSENTE|SEM ETIQUETA/.test(raw);};
const noAssessment=value=>['','-','NA','N/A','NAO INFORMADO','SEM AVALIACAO','NAO AVALIADO','SEM INFORMACAO'].includes(text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase());
export function summarize(data){
 const rows=Array.isArray(data?.records)?data.records:[],schools=new Map(),categories=new Set(),statuses=new Set();let missingSerial=0,missingAssessment=0,missingCie=0;
 for(const school of inventorySchools(data).filter(s=>s.sem_dados))schools.set(school.cie,new Set([school.name]));
 for(const r of rows){const cie=text(r.cie);if(validCie(cie)){if(!schools.has(cie))schools.set(cie,new Set());if(text(r.unidade))schools.get(cie).add(text(r.unidade));}else missingCie++;
 if(text(r.categoria))categories.add(text(r.categoria));if(text(r.status))statuses.add(text(r.status));if(serialIssue(r.serial))missingSerial++;if(noAssessment(r.avaliacao))missingAssessment++;}
 return {records:rows.length,schools:schools.size,files:data?.workbooks?.length||0,missingSerial,missingAssessment,missingCie,schoolList:[...schools].sort(([a],[b])=>a.localeCompare(b,'pt-BR',{numeric:true})).map(([cie,names])=>({cie,name:[...names].sort().join(' / ')})),categories:[...categories].sort(),statuses:[...statuses].sort()};
}
export function compareDatasets(current,next){
 const before=summarize(current),after=summarize(next),old=new Map(before.schoolList.map(s=>[s.cie,s])),now=new Map(after.schoolList.map(s=>[s.cie,s]));
 const addedSchools=after.schoolList.filter(s=>!old.has(s.cie)),removedSchools=before.schoolList.filter(s=>!now.has(s.cie));
 const renamedSchools=after.schoolList.filter(s=>old.has(s.cie)&&normalize(s.name)!==normalize(old.get(s.cie).name)).map(s=>({...s,previousName:old.get(s.cie).name}));
 const warnings=[];if(removedSchools.length)warnings.push(removedSchools.length+' escola(s) da base atual não constam na seleção. Confira se a pasta está completa.');
 if(before.records&&after.records<before.records*.8)warnings.push('O total de registros caiu '+new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format((1-after.records/before.records)*100)+'% em relação à base atual.');
 if(before.files&&after.files<before.files)warnings.push('A seleção tem menos arquivos que a base atual ('+after.files+' de '+before.files+').');
 if(renamedSchools.length)warnings.push(renamedSchools.length+' CIE(s) apresentam nome de escola diferente. Confira as identificações.');
 if(after.missingCie)warnings.push(after.missingCie+' registro(s) sem CIE precisam de conferência.');
 return {before,after,addedSchools,removedSchools,renamedSchools,addedCategories:after.categories.filter(c=>!before.categories.includes(c)),warnings};
}
export async function inspectFiles(files,XLSX,{checkIdentity=false,onProgress}={}){
 const identityGuard=checkIdentity?await import('./inventory-update.js'):null,positions=new Map(),selectedCies=new Set();
 const errors=[],seen=new Map(),records=[],workbooks=[],formulaErrors=[];let itapevi=0,ignoredRows=0,sheets=0,processedFiles=0;
 const supported=[...files].filter(f=>/\.(xlsx|xls|csv)$/i.test(f.name)&&!f.name.startsWith('~$'));
 if(!supported.length)return {errors:['Nenhum arquivo Excel ou CSV foi encontrado. A base atual permanece intacta.']};
 if(supported.length!==[...files].filter(f=>!f.name.startsWith('~$')).length)errors.push('A seleção inclui arquivos de formato incompatível. Use apenas Excel ou CSV.');
 for(const file of supported){
  const identity=identityGuard?.filenameIdentity(file.name);if(checkIdentity&&!identity){errors.push(file.name+': identifique o arquivo como “CIE - NOME DA ESCOLA - INVENTÁRIO.xlsx”.');continue;}
  if(identity){if(selectedCies.has(identity.cie)){errors.push(file.name+': mais de um arquivo para o CIE '+identity.cie+'. Selecione somente a versão completa e atual da escola.');continue;}selectedCies.add(identity.cie);}
  try{
   const bytes=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   const duplicateOf=seen.get(hash);if(duplicateOf&&!identity){errors.push(file.name+': conteúdo idêntico a '+seen.get(hash)+'. Remova a cópia repetida.');continue;}seen.set(hash,file.name);
   const book=XLSX.read(bytes,{type:'array',cellDates:false});let fileSheets=0,fileRows=0,nonResidualRows=0,hasContent=false;const counts={},residualIdentityRows=[];
   for(const name of book.SheetNames){
    if(normalize(name)==='LISTAS')continue;const sheet=book.Sheets[name];if(!sheet?.['!ref'])continue;
    for(const [address,cell]of Object.entries(sheet)){if(address.startsWith('!'))continue;if(cell?.t==='e'||/#REF!|#VALUE!|#NAME\?|#DIV\/0!|#N\/A|#NUM!|#NULL!|#SPILL!|#CALC!/i.test(String(cell?.f??'')+' '+String(cell?.v??'')+' '+String(cell?.w??'')))formulaErrors.push({arquivo:file.name,aba:name,celula:address,formula:cell.f||text(cell.v)});}
    const rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:true}).filter(r=>Object.values(r).some(value=>text(value)));
    if(rows.length)hasContent=true;
    if(!rows.length){const headers=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true})[0]||[];if(inspectHeaders(headers,{allowMissingIdentity:checkIdentity}).valid){fileSheets++;sheets++;counts[name]=0;}continue;}
    const check=inspectHeaders(Object.keys(rows[0]),{allowMissingIdentity:checkIdentity});
    if(!check.valid){errors.push(file.name+' · '+name+': arquivo incompatível. Faltam '+check.missing.join(', ')+'.');continue;}fileSheets++;sheets++;counts[name]=0;const lines=[];
    for(const source of rows){
     // Unassigned template remnants are not equipment records.
     const anchored=['status','serial','model','maker','assessment','environment'].some(key=>rawField(source,key));
     if(!rawField(source,'cie')&&!rawField(source,'ure')&&!anchored){ignoredRows++;residualIdentityRows.push({sheet:name,line:source.__rowNum__+1});continue;}
     nonResidualRows++;
     const line=Number.isInteger(source.__rowNum__)?source.__rowNum__+1:undefined;
     const row=identity?identityGuard.completeInventoryIdentity(source,identity,line):source;
     if(identity&&errors.length<30){const problems=identityGuard.rowIdentityProblems(row,identity);if(problems.length)errors.push(file.name+' · '+name+' · linha '+line+': '+problems.join('; ')+'. Corrija a planilha original.');}
     const cie=text(row.cie||rawField(row,'cie')),ure=text(row.ure||rawField(row,'ure'));
     if(cie&&!validCie(cie)){errors.push(file.name+' · '+name+': CIE inválido ('+cie.slice(0,40)+').');continue;}
     if(normalize(ure)!=='ITAPEVI'){ignoredRows++;continue;}
     itapevi++;fileRows++;counts[name]++;lines.push(line);
     records.push({...row,arquivo:file.name,unidade:identity?.name||file.name,aba:name,cie,ure,categoria:rawField(row,'category'),status:rawField(row,'status'),avaliacao:rawField(row,'assessment'),serial:rawField(row,'serial'),_sourceRow:line});
    }
    positions.set(file.name+'\0'+name,lines);
   }
   const emptySchool=Boolean(identity)&&fileRows===0&&nonResidualRows===0&&(fileSheets>0||!hasContent);
   if(duplicateOf&&!emptySchool)errors.push(file.name+': conteúdo idêntico a '+duplicateOf+'. Remova a cópia repetida.');
   if(!fileSheets&&!emptySchool)errors.push(file.name+': nenhuma aba com registros de inventário compatíveis.');
   workbooks.push({arquivo:file.name,linhas:fileRows,abas:counts,residualIdentityRows,sem_dados:emptySchool});
  }catch{errors.push(file.name+': arquivo ilegível ou corrompido.');}
  try{onProgress?.({phase:'validation',completed:++processedFiles,total:supported.length,file:file.name,message:'Planilhas verificadas: '+processedFiles+' de '+supported.length});}catch{}
 }
 if(!itapevi&&!workbooks.some(w=>w.sem_dados))errors.push('Nenhum registro identificado como URE Itapevi foi encontrado.');
 const dataset=aggregateImportedData(records,workbooks,formulaErrors,supported.length);
 return {errors:errors.slice(0,30),ignoredRows,files:supported.length,sheets,positions,dataset,identityCompletion:identityGuard?identityGuard.identityReviewRows(records):[]};
}
export function inspectBlueDataset(data){
 const errors=[];if(!data||!text(data.source)||!Array.isArray(data.records)||!data.records.length)return {errors:['O CSV não gerou uma base Blue Monitor válida.']};
 let identified=0;for(const row of data.records){if(!row||typeof row!=='object'){errors.push('O CSV contém registros inválidos.');break;}const cie=text(row['Unit CIE Code']);if(cie&&!validCie(cie)){errors.push('CIE inválido no CSV Blue Monitor: '+cie.slice(0,40)+'.');break;}if(validCie(cie)&&text(row['Unit Name']))identified++;}
 if(!identified)errors.push('O CSV não contém equipamentos com CIE válido e nome de escola. Confira as colunas Unit CIE Code e Unit Name.');
 return {errors};
}
export function compareBlueDatasets(current,next){
 const map=d=>d?{records:d.records.map(r=>({cie:text(r['Unit CIE Code']),unidade:text(r['Unit Name']),categoria:text(r.Type),status:text(r.Status),serial:text(r['Serial Number'])})),workbooks:[{arquivo:d.source}]}:null;
 const report=compareDatasets(map(current),map(next));
 report.before.missingSync=(current?.records||[]).filter(r=>!text(r['Last Sync'])||['NA','NAO INFORMADO'].includes(normalize(r['Last Sync']))).length;
 report.after.missingSync=next.records.filter(r=>!text(r['Last Sync'])||['NA','NAO INFORMADO'].includes(normalize(r['Last Sync']))).length;
 report.source=next.source;report.collection='blue-monitor';return report;
}
