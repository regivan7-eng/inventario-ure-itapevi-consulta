export const SHEET_NAME='Centralizados NOVO';
export const GROUPS=[
 {key:'desktop',label:'Desktops',columns:[2],color:'#146d91'},
 {key:'notebook',label:'Notebooks',columns:[4,5,6,7,8,9],subtotal:10,color:'#26b9e5'},
 {key:'tablet',label:'Tablets',columns:[12],color:'#254d7c'},
 {key:'tv',label:'TVs',columns:[14],color:'#d9a139'},
 {key:'educatron',label:'Educatrons',columns:[15],color:'#8175ac'},
 {key:'charging',label:'Plataformas de recarga',columns:[17],color:'#5c9b8b'}
];
export const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const text=v=>String(v??'').trim();
export function parseCentralizedMatrix({sheetName,rows,sourceModified=null,checkedAt=new Date().toISOString()}){
 if(sheetName!==SHEET_NAME)throw Error('Selecione exclusivamente a aba “Centralizados NOVO”. A versão anterior foi mantida.');
 const header=rows?.[2],models=rows?.[3];
 if(!header||normalize(header[0])!=='cie'||normalize(header[1])!=='nome_escola'||normalize(models?.[10])!=='total'||!normalize(header[18]).includes('total de equipamentos'))throw Error('A estrutura da aba Centralizados NOVO mudou. Confira os cabeçalhos antes de atualizar.');
 const columns=header.map((label,index)=>({index,key:'c'+index,label:text(label),model:text(models?.[index]),group:GROUPS.find(g=>g.columns.includes(index)||g.subtotal===index)?.key||null})).filter(c=>c.label);
 const records=[],seen=new Set(),summaryRows=[];
 for(let i=4;i<rows.length;i++){
  const row=rows[i];if(!row?.some(v=>v!==null&&v!==undefined&&v!==''))continue;
  if(!text(row[0])&&!text(row[1])){summaryRows.push({line:i+1,values:row});continue;}
  if(!/^[1-9]\d*$/.test(text(row[0])))throw Error('Centralizados NOVO, linha '+(i+1)+': CIE inválido ou ausente.');
  const cie=text(row[0]);if(seen.has(cie))throw Error('Centralizados NOVO, linha '+(i+1)+': CIE '+cie+' repetido.');seen.add(cie);
  if(!text(row[1]))throw Error('Centralizados NOVO, linha '+(i+1)+': falta o nome da escola.');
  const cells=Object.fromEntries(columns.map(c=>[c.key,row[c.index]??null]));
  for(const c of columns.filter(c=>c.index>=2)){
   const v=cells[c.key];if(v!==null&&v!==''&&(typeof v!=='number'||!Number.isFinite(v)||v<0||!Number.isInteger(v)))throw Error('Centralizados NOVO, linha '+(i+1)+', coluna '+(c.index+1)+': quantidade inválida.');
  }
  const groups=Object.fromEntries(GROUPS.map(g=>{
   const sum=g.columns.reduce((n,c)=>n+Number(row[c]||0),0);
   if(g.subtotal!==undefined&&row[g.subtotal]!==sum)throw Error('Centralizados NOVO, linha '+(i+1)+': subtotal de '+g.label+' não confere com os modelos.');
   return [g.key,sum];
  }));
  if(typeof row[18]!=='number')throw Error('Centralizados NOVO, linha '+(i+1)+': total informado ausente.');
  records.push({cie,name:text(row[1]),sourceRow:i+1,cells,groups,reportedTotal:row[18],categoryTotal:Object.values(groups).reduce((a,b)=>a+b,0)});
 }
 if(!records.length)throw Error('A aba Centralizados NOVO não contém escolas válidas.');
 if(summaryRows.length>1)throw Error('Há mais de uma linha de totais sem identificação. Confira a aba Centralizados NOVO.');
 for(const summary of summaryRows)for(const col of columns.filter(c=>c.index>=2)){
  const total=records.reduce((n,r)=>n+Number(r.cells[col.key]||0),0);
  if(summary.values[col.index]!==null&&summary.values[col.index]!==undefined&&summary.values[col.index]!==total)throw Error('Linha '+summary.line+': o total da coluna '+col.label+' não confere com as escolas.');
 }
 const reportedScope=records.every(r=>r.reportedTotal===r.groups.tablet+r.groups.tv+r.groups.educatron+r.groups.charging)?'delivered-subset':records.every(r=>r.reportedTotal===r.categoryTotal)?'all-categories':'mixed';
 return {sheetName,reportedScope,sourceName:'Equipamentos_Centralizados_V2.xlsx',sourceModified,checkedAt,columns,records};
}
export function filterCentralized(records,{query='',school='',category='',model=''}={}){
 const q=normalize(query);
 return records.filter(r=>(!q||normalize(r.name+' '+r.cie).includes(q))&&(!school||r.cie===school)&&(!category||r.groups[category]>0)&&(!model||Number(r.cells[model]||0)>0));
}
export function centralizedOptions(data,filters={}){
 const schools=filterCentralized(data.records,{...filters,school:''}).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 // Changing a category clears its model; offer only categories present for these schools.
 const categoryRows=filterCentralized(data.records,{...filters,category:'',model:''});
 const categories=GROUPS.filter(g=>categoryRows.some(r=>r.groups[g.key]>0));
 const modelRows=filterCentralized(data.records,{...filters,model:''});
 const models=data.columns.filter(c=>GROUPS.some(g=>g.columns.includes(c.index))&&(!filters.category||c.group===filters.category)&&modelRows.some(r=>Number(r.cells[c.key]||0)>0));
 return {schools,categories,models};
}
export function summarizeCentralized(records){
 const groups=Object.fromEntries(GROUPS.map(g=>[g.key,records.reduce((sum,r)=>sum+r.groups[g.key],0)]));
 return {schools:new Set(records.map(r=>r.cie)).size,reportedTotal:records.reduce((n,r)=>n+r.reportedTotal,0),categoryTotal:Object.values(groups).reduce((a,b)=>a+b,0),groups};
}
