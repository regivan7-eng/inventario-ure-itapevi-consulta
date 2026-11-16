const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
const definitions=[
 {id:'hardware',label:'Hardware',aliases:['equipamentos de hardware','hardware']},
 {id:'tv',label:'TVs e Educatrons',aliases:['tvs e educatrons','tv e educatron']},
 {id:'recarga',label:'Plataforma de Recarga',aliases:['plataforma de recarga','plataformas de recarga']},
 {id:'rede',label:'Equipamentos de Rede',aliases:['equipamentos de rede','rede']}
];
const lookup=new Map(definitions.flatMap(front=>front.aliases.map(alias=>[alias,front.id])));
const collator=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
export function summarizeSchoolAttention(rows){
 const groups=new Map();let hasOther=false;
 for(const row of rows){
  const cie=String(row.cie??'').trim(),name=String(row.unidade??'').trim()||'Escola não identificada',key=cie||normalize(name);
  if(!groups.has(key))groups.set(key,{cie,name,total:0,attention:0,fronts:{}});
  const school=groups.get(key),front=lookup.get(normalize(row.aba))||'other';
  if(front==='other')hasOther=true;
  if(!school.fronts[front])school.fronts[front]={total:0,attention:0};
  const group=school.fronts[front],attention=['danificado','em manutencao','inservivel'].includes(normalize(row.status));
  school.total++;group.total++;school.attention+=Number(attention);group.attention+=Number(attention);
 }
 const fronts=definitions.map(({id,label})=>({id,label}));
 if(hasOther)fronts.push({id:'other',label:'Outras frentes'});
 return {fronts,schools:[...groups.values()].sort((a,b)=>collator.compare(a.name,b.name)||collator.compare(a.cie,b.cie))};
}
