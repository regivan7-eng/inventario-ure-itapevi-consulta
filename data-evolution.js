import {filenameIdentity} from './inventory-update.js';
import {inventorySchools} from './inventory-schools.js';
import {displaySchoolName} from './school-display.js';
const text=v=>String(v??'').trim();
const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function summarizeEvolution(dataset){
 const schools=new Map(),categories=new Map();let available=0,attention=0;
 for(const row of dataset?.records||[]){
  const cie=text(row.cie),category=text(row.categoria||row.aba)||'Não informado',status=norm(row.status);
  if(status==='disponivel')available++;
  if(['danificado','em manutencao','inservivel'].includes(status))attention++;
  if(cie){if(!schools.has(cie))schools.set(cie,{cie,name:text(row.unidade)||filenameIdentity(row.arquivo)?.name||'Escola não informada',records:0,available:0,attention:0,files:new Set()});
   const school=schools.get(cie);school.records++;school.files.add(text(row.arquivo));if(status==='disponivel')school.available++;if(['danificado','em manutencao','inservivel'].includes(status))school.attention++;
  }
  categories.set(category,(categories.get(category)||0)+1);
 }
 for(const school of inventorySchools(dataset).filter(s=>s.sem_dados))schools.set(school.cie,{cie:school.cie,name:school.name,records:0,available:0,attention:0,files:new Set(school.files)});
 return {records:dataset?.records?.length||0,schoolCount:schools.size,available,attention,schools:[...schools.values()].map(s=>({...s,name:displaySchoolName(s.name),files:[...s.files]})),categories:[...categories].map(([name,records])=>({name,records}))};
}
export function compareEvolution(previous,current){
 const before=summarizeEvolution(previous),after=summarizeEvolution(current);
 const compare=(oldRows,newRows,key)=>{const old=new Map(oldRows.map(r=>[r[key],r])),now=new Map(newRows.map(r=>[r[key],r]));
  return [...new Set([...old.keys(),...now.keys()])].map(id=>({...(now.get(id)||old.get(id)),before:old.get(id)?.records||0,after:now.get(id)?.records||0,delta:(now.get(id)?.records||0)-(old.get(id)?.records||0),availableDelta:(now.get(id)?.available||0)-(old.get(id)?.available||0),attentionDelta:(now.get(id)?.attention||0)-(old.get(id)?.attention||0),kind:!old.has(id)?'Incluída':!now.has(id)?'Ausente':'Presente nas duas'})).filter(r=>r.delta||r.availableDelta||r.attentionDelta||r.kind!=='Presente nas duas').sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||String(a[key]).localeCompare(String(b[key]),'pt-BR'));};
 return {before,after,schools:compare(before.schools,after.schools,'cie'),categories:compare(before.categories,after.categories,'name')};
}
export function stampSchoolImports(current,incoming,merged,{mode,email,name,at}){
 const result={...merged};
 // Only the server calls this after approval; imported files cannot set authors or dates.
 const source=mode==='restore'?incoming?.schoolImports:current?.schoolImports;
 const imports=Object.create(null);
 for(const school of summarizeEvolution(merged).schools){
  const prior=source?.[school.cie];
  if(prior&&typeof prior.at==='string'&&Number.isFinite(Date.parse(prior.at)))imports[school.cie]={at:prior.at,name:text(prior.name),email:text(prior.email),files:Array.isArray(prior.files)?prior.files.map(text):[]};
 }
 if(mode!=='restore'){
  const selected=new Set((incoming.workbooks||[]).map(w=>filenameIdentity(w.arquivo)?.cie).filter(Boolean));
  for(const school of summarizeEvolution(merged).schools)if(mode==='replace'||selected.has(school.cie))imports[school.cie]={at,name:text(name)||text(email),email:text(email),files:school.files};
 }
 result.schoolImports=imports;return result;
}
