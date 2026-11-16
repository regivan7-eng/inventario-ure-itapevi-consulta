import {GROUPS,normalize,filterCentralized} from './centralized-model.js';
const compact=v=>normalize(v).replace(/[^a-z0-9]/g,'');
const cie=v=>{const s=String(v??'').trim();return /^\d+(?:\.0)?$/.test(s)&&Number.isSafeInteger(Number(s))&&Number(s)>0?String(Number(s)):null;};
const categoryAliases={desktop:['desktop','desktop lenovo','desktop basico educacional','computador de mesa'],notebook:['notebook','notebook sala de aula','notebook basico educacional','notebook avancado','notebook avancado educacional','notebook lenovo'],tablet:['tablet','tablet android educacional'],tv:['tv','tvs','televisor','televisao'],educatron:['educatron','educatrons'],charging:['plataforma de recarga','plataformas de recarga','plataforma de recarga movel','plataforma de recarga movel 2020 tes','plataforma de rec movel 2020 tes','plataforma de recarga movel tes','carrinho de recarga','carrinho de carregamento']};
const categoryMap=new Map(Object.entries(categoryAliases).flatMap(([key,labels])=>labels.map(label=>[compact(label),key])));
const outside=/legado|desktopoutros|smartphone|celular|switch|firewall|rack|nobreak|patchpanel|roteador|^ap$|accesspoint/;
const emptyCounts=()=>Object.fromEntries(GROUPS.map(g=>[g.key,0]));
export function samsungChromebookVariant(row){
 const model=compact(row.MODELO??row.modelo??row.Model),maker=compact(row.FABRICANTE??row.fabricante??row.Manufacturer);
 if(!maker.includes('samsung')&&!model.includes('samsung'))return null;
 const name=model.replace(/^samsung/,'').replace(/^chromebook/,'').replace(/^samsung/,'');
 if(name==='go')return 'samsungGo';
 if(name==='4'||name==='book4')return 'samsung4';
 return null;
}
export function inventoryGroup(row){
 if(samsungChromebookVariant(row))return 'notebook';
 const category=row['CATEGORIA DO EQUIPAMENTO']??row.categoria??row.Type;
 const group=categoryMap.get(compact(category));
 if(group)return group;
 // Plataforma de Recarga workbooks identify the equipment type in the sheet
 // name; unlike other sheets, they have no category/model column.
 if(!compact(category))return categoryMap.get(compact(row.aba??row.sheet??row.sheetName));
 return undefined;
}
export function inventoryModel(row,group=inventoryGroup(row)){
 if(samsungChromebookVariant(row))return 'c5';
 const model=compact(row.MODELO??row.modelo??row.Model),maker=compact(row.FABRICANTE??row.fabricante??row.Manufacturer);
 const raw=normalize(row.MODELO??row.modelo??row.Model).toUpperCase();
 if(group==='desktop')return /\bM75S\b/.test(raw)?'c2':null;
 if(group==='notebook'){
  if(/\bN(?:1110|1210)\b/.test(raw))return 'c4';
  if(model.includes('m11wprocl'))return 'c6';
  if(/ul\s*150/i.test(raw))return 'c7';
  if(/\bN(?:6440|8440)\b/.test(raw))return 'c8';
  if(/\bL14\b/.test(raw))return 'c9';
 }
 if(group==='tablet')return /\bT(?:2040|2072)\b/.test(raw)?'c12':null;
 if(group==='tv')return /\blg\b/i.test(normalize((row.MODELO??row.modelo??'')+' '+(row.FABRICANTE??row.fabricante??'')))?'c14':null;
 if(group==='educatron')return 'c15';
 if(group==='charging')return 'c17';
 return null;
}
const serialKey=row=>{const s=compact(row.serial??row['NÚMERO DE SÉRIE']);return !s||['sn','na','noc','naoconsta','naoinformado','semsn','semserial','semserie','0','null','ilegivel','outro','outros'].includes(s)||/semetiqueta|sems[eé]rie|naolocaliz|verificar/.test(s)?null:s;};
export function buildCentralizedComparison(source,current){
 if(!Array.isArray(current?.dataset?.records)||!current.dataset.records.length)throw Error('A base central do Inventário não está disponível. A comparação não pode ser calculada.');
 const records=current.dataset.records,serials=new Map();for(const r of records){const key=serialKey(r);if(key)serials.set(key,(serials.get(key)||0)+1);}
 const schoolMap=new Map(),excludedCategories=new Map();let invalidCie=0,identityConflicts=0;
 for(const r of records){
  const original=r.CIE,rawCie=cie(original),id=String(original??'').trim()?rawCie:cie(r.cie);
  if(!id){invalidCie++;continue;}if(rawCie&&cie(r.cie)&&rawCie!==cie(r.cie))identityConflicts++;
  if(!schoolMap.has(id))schoolMap.set(id,{cie:id,name:String(r.unidade||id),records:0,groups:emptyCounts(),models:{},modelVariants:{samsungGo:0,samsung4:0},unmatched:emptyCounts(),duplicates:emptyCounts(),missingSerial:emptyCounts(),unknown:0,outside:0});
  const s=schoolMap.get(id);s.records++;const group=inventoryGroup(r);
  if(!group){const category=String(r['CATEGORIA DO EQUIPAMENTO']??r.categoria??'').trim()||'Não informada',isOutside=outside.test(compact(category));s[isOutside?'outside':'unknown']++;excludedCategories.set(category,(excludedCategories.get(category)||0)+1);continue;}
  s.groups[group]++;const model=inventoryModel(r,group);if(model)s.models[model]=(s.models[model]||0)+1;else s.unmatched[group]++;const variant=samsungChromebookVariant(r);if(variant)s.modelVariants[variant]++;
  const serial=serialKey(r);if(!serial)s.missingSerial[group]++;else if(serials.get(serial)>1)s.duplicates[group]++;
 }
 const sourceIds=new Set(source.records.map(r=>cie(r.cie)));
 const schools=source.records.map(r=>({cie:r.cie,name:r.name,receivedGroups:r.groups,receivedModels:Object.fromEntries(source.columns.filter(c=>GROUPS.some(g=>g.columns.includes(c.index))).map(c=>[c.key,Number(r.cells[c.key]||0)])),inventory:schoolMap.get(cie(r.cie))||null}));
 return {version:1,inventoryUpdatedAt:current.updatedAt||null,inventoryReference:current.dataset.meta?.gerado_em||null,sourceModified:source.sourceModified,computedAt:new Date().toISOString(),inventoryRecords:records.length,inventorySchools:schoolMap.size,schools,outsideSchools:[...schoolMap.values()].filter(s=>!sourceIds.has(s.cie)).map(s=>({cie:s.cie,name:s.name,records:s.records})),quality:{invalidCie,identityConflicts,excludedCategories:[...excludedCategories].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count)}};
}
export function selectCentralizedComparison(comparison,source,filters={}){
 // Only compare official model columns with a positive receipt in each school.
 const ids=new Set(filterCentralized(source.records,{query:filters.query,school:filters.school}).map(r=>r.cie));
 const selectedColumn=filters.model?source.columns.find(c=>c.key===filters.model):null;
 const groups=GROUPS.filter(g=>selectedColumn?g.columns.includes(selectedColumn.index):!filters.category||g.key===filters.category);
 const schoolRows=comparison.schools.filter(s=>ids.has(s.cie)).map(s=>{
  const categories=groups.map(g=>{
   const columns=(selectedColumn?[selectedColumn]:source.columns.filter(c=>g.columns.includes(c.index)))
    .filter(c=>Number(s.receivedModels[c.key]||0)>0);
   const received=columns.reduce((n,c)=>n+Number(s.receivedModels[c.key]||0),0);
   const registered=columns.reduce((n,c)=>n+Number(s.inventory?.models[c.key]||0),0);
   return {key:g.key,label:g.label,received,registered,covered:Math.min(received,registered),pending:Math.max(0,received-registered),excess:Math.max(0,registered-received),unmatched:s.inventory?.unmatched[g.key]||0};
  }).filter(c=>c.received>0);
  const row={cie:s.cie,name:s.name,hasInventory:!!s.inventory,categories,received:0,registered:0,covered:0,pending:0,excess:0,duplicates:0,missingSerial:0,unmatched:0,unknown:s.inventory?.unknown||0,outside:s.inventory?.outside||0};
  for(const c of categories)for(const key of ['received','registered','covered','pending','excess','unmatched'])row[key]+=c[key];
  // Quality counts describe the selected categories; duplicate/model attribution is not guessed.
  row.duplicates=categories.reduce((n,g)=>n+(s.inventory?.duplicates[g.key]||0),0);row.missingSerial=categories.reduce((n,g)=>n+(s.inventory?.missingSerial[g.key]||0),0);
  row.coverage=row.received?row.covered/row.received:null;
  row.status=!row.hasInventory?'no-inventory':row.pending&&row.excess?'mixed':row.pending?'pending':row.excess?'excess':row.received?'balanced':'no-receipts';return row;
 }).filter(row=>row.received>0);
 const totals={received:0,registered:0,covered:0,pending:0,excess:0,duplicates:0,missingSerial:0,unmatched:0,unknown:0,outside:0,schools:schoolRows.length,noInventory:0,balanced:0};
 for(const s of schoolRows){for(const key of ['received','registered','covered','pending','excess','duplicates','missingSerial','unmatched','unknown','outside'])totals[key]+=s[key];if(!s.hasInventory)totals.noInventory++;if(s.status==='balanced')totals.balanced++;}
 totals.coverage=totals.received?totals.covered/totals.received:null;
 const categories=groups.map(g=>{const result={key:g.key,label:g.label,received:0,registered:0,pending:0,excess:0};for(const s of schoolRows){const c=s.categories.find(c=>c.key===g.key);for(const key of ['received','registered','pending','excess'])result[key]+=c?.[key]||0;}return result;}).filter(c=>c.received>0);
 return {totals,schools:schoolRows,categories,model: selectedColumn||null};
}
