import {normalize,rawField,compareDatasets,summarize} from './inventory-validation.js';
import {aggregateImportedData} from './inventory-aggregate.js';
import {filenameIdentity} from './inventory-schools.js';
export {filenameIdentity} from './inventory-schools.js';
const text=v=>String(v??'').trim();
const schoolKey=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').split(' ').filter(w=>w&&!['EE','E','E.E','ESCOLA','ESTADUAL','PROFESSOR','PROFESSORA','PROF','PROFA','DOUTOR','DOUTORA','DR','DRA','PADRE','PE'].includes(w)).join(' ');
const schoolColumns=new Set(['ESCOLA','NOME DA ESCOLA','NOME ESCOLA','UNIDADE ESCOLAR','NOME DA UNIDADE ESCOLAR','NOME DA UNIDADE','NOME DA UE','ESCOLA ESTADUAL','UNIDADE DE ENSINO','UNIDADE'].map(normalize));
export function rowIdentityProblems(row,identity){
 const problems=[];const cie=rawField(row,'cie');
 if(cie&&cie!==identity.cie)problems.push('CIE esperado '+identity.cie+'; encontrado '+(cie||'vazio'));
 for(const [column,value] of Object.entries(row))if(schoolColumns.has(normalize(column))&&schoolKey(value)!==schoolKey(identity.name))problems.push(column+': escola esperada “'+identity.name+'”; encontrada “'+(text(value)||'vazia')+'”');
 return problems;
}
export function inspectIncomingIdentity(data){
 const errors=[],identities=new Map(),cies=new Set(),counts=new Map();
 const add=m=>{if(errors.length<30)errors.push(m);};
 for(const workbook of data.workbooks){const id=filenameIdentity(workbook.arquivo);if(!id){add(workbook.arquivo+': identifique o arquivo como “CIE - NOME DA ESCOLA - INVENTÁRIO.xlsx”.');continue;}
  if(cies.has(id.cie)||identities.has(workbook.arquivo))add(workbook.arquivo+': há mais de um arquivo para o CIE '+id.cie+'. Selecione somente a versão completa e atual dessa escola.');cies.add(id.cie);identities.set(workbook.arquivo,id);
 }
 const rowsPerFile=new Map();
 for(const row of data.records){const id=identities.get(row.arquivo);if(!id)continue;rowsPerFile.set(row.arquivo,(rowsPerFile.get(row.arquivo)||0)+1);const key=row.arquivo+'\0'+row.aba;counts.set(key,(counts.get(key)||1)+1);const line=Number.isInteger(row._sourceRow)&&row._sourceRow>=2?row._sourceRow:counts.get(key);
  const problems=rowIdentityProblems(row,id);if(text(row.cie)!==id.cie&&!problems.length)problems.push('CIE normalizado diferente do nome do arquivo');
  if(schoolKey(row.unidade)!==schoolKey(id.name))problems.push('identificação da escola diferente do nome do arquivo');
  if(problems.length)add(row.arquivo+' · '+row.aba+' · linha '+line+': '+problems.join('; ')+'. Corrija a planilha original.');
 }
 for(const filename of identities.keys())if(!rowsPerFile.has(filename)&&!data.workbooks.some(w=>w.arquivo===filename&&w.linhas===0&&w.sem_dados===true))add(filename+': nenhum registro válido desta escola foi encontrado.');
 return {errors,identities};
}
export function mergeSchoolInventory(current,incoming,rebuild){
 const selected=new Set(incoming.workbooks.map(w=>filenameIdentity(w.arquivo).cie));
 const isSelected=row=>selected.has(filenameIdentity(row.arquivo)?.cie||text(row.cie));
 const retained=(current?.records||[]).filter(row=>!isSelected(row));
 // The filename is authoritative, including for legacy inconsistent rows.
 // Fall back to the row CIE only when a legacy filename has no usable identity.
 const retainedFiles=new Set(retained.map(r=>r.arquivo));
 const workbooks=[...(current?.workbooks||[]).filter(w=>(retainedFiles.has(w.arquivo)||(w.sem_dados===true&&w.linhas===0))&&!selected.has(filenameIdentity(w.arquivo)?.cie)),...incoming.workbooks];
 // A legacy file can contain several CIEs: retain its metadata if unrelated
 // rows survive, unless it has the same filename as the new complete workbook.
 for(const filename of retainedFiles)if(!workbooks.some(w=>w.arquivo===filename)){
  const original=current.workbooks.find(w=>w.arquivo===filename);if(original)workbooks.unshift(original);
 }
 const counts=new Map();for(const row of [...retained,...incoming.records]){if(!counts.has(row.arquivo))counts.set(row.arquivo,{linhas:0,abas:{}});const c=counts.get(row.arquivo);c.linhas++;c.abas[row.aba]=(c.abas[row.aba]||0)+1;}
 const sources=workbooks.map(w=>({...w,...counts.get(w.arquivo)}));
 const errors=[...(current?.qualidade?.erros_formula||[]).filter(e=>retainedFiles.has(e.arquivo)),...(incoming.qualidade?.erros_formula||[])];
 return rebuild([...retained,...incoming.records],sources,errors,sources.length);
}
export function schoolUpdateReport(current,incoming,merged){
 const report=compareDatasets(current,merged),before=summarize(current),old=new Map(before.schoolList.map(s=>[s.cie,s]));
 report.mode='schools';report.affectedSchools=incoming.workbooks.map(w=>{const id=filenameIdentity(w.arquivo);return {...id,before:(current?.records||[]).filter(r=>(filenameIdentity(r.arquivo)?.cie||text(r.cie))===id.cie).length,after:incoming.records.filter(r=>r.arquivo===w.arquivo).length,isNew:!old.has(id.cie)};});
 const selected=new Set(report.affectedSchools.map(s=>s.cie));report.preservedSchools=before.schoolList.filter(s=>!selected.has(s.cie)).length;
 for(const school of report.affectedSchools)if(school.before&&school.after<school.before*.8)report.warnings.push(school.name+' · CIE '+school.cie+': registros de '+school.before+' para '+school.after+'. Confira se o arquivo contém todas as abas e os registros da escola.');
 return report;
}

export function completeInventoryIdentity(row,identity,line){
 if(!identity||!row||typeof row!=='object')return row;
 const originalCie=rawField(row,'cie'),originalUre=rawField(row,'ure');
 const result={...row,CIE:originalCie,'URE / DIRETORIA':originalUre,cie:originalCie||identity.cie,ure:originalUre||'ITAPEVI'};
 if(line!==undefined)result._sourceRow=line;
 return result;
}
export function identityReviewRows(records){
 const issues=[];
 for(const row of records||[]){
  const id=filenameIdentity(row?.arquivo);if(!id)continue;
  const fields=[];if(!rawField(row,'cie'))fields.push({field:'CIE',value:id.cie});
  if(!rawField(row,'ure'))fields.push({field:'URE',value:'ITAPEVI'});
  if(fields.length)issues.push({cie:id.cie,name:row.unidade||id.name,file:row.arquivo,sheet:row.aba,line:Number.isInteger(row._sourceRow)?row._sourceRow:null,fields});
 }
 return issues;
}
export function completeInventoryDataset(data){
 if(!Array.isArray(data?.records)||!Array.isArray(data?.workbooks)||!data.meta||!Array.isArray(data.qualidade?.erros_formula))return data;
 const rows=data.records.map(row=>completeInventoryIdentity(row,filenameIdentity(row?.arquivo)));
 if(rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))return data;
 if(rows.some(row=>normalize(row.ure)!=='ITAPEVI'))return {...data,records:rows};
 const built=aggregateImportedData(rows,data.workbooks,data.qualidade.erros_formula,data.workbooks.length);
 return {...data,...built,meta:{...data.meta}};
}

export function identityReviewDataset(data){
 const rows=identityReviewRows(data?.records).map(row=>({...row,treatment:'Completado no sistema'}));
 for(const book of data?.workbooks||[]){
  const id=filenameIdentity(book.arquivo);if(!id||!Array.isArray(book.residualIdentityRows))continue;
  for(const note of book.residualIdentityRows)if(Number.isInteger(note?.line)&&note.line>=2&&typeof note.sheet==='string')rows.push({cie:id.cie,name:id.name,file:book.arquivo,sheet:note.sheet,line:note.line,fields:[{field:'CIE',value:id.cie},{field:'URE',value:'ITAPEVI'}],treatment:'Linha residual não importada'});
 }
 return rows;
}
