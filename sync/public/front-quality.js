const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
const fronts=[['hardware','Hardware',['equipamentos de hardware','hardware']],['tv','TVs e Educatrons',['tvs e educatrons','tv e educatron']],['recarga','Recarga',['plataforma de recarga','plataformas de recarga']],['rede','Rede',['equipamentos de rede','rede']]];
const aliases=new Map(fronts.flatMap(([id,,names])=>names.map(name=>[name,id])));
export function summarizeQualityFronts(rows,affected){
 const groups=new Map(fronts.map(([id,label])=>[id,{id,label,total:0,pending:0}]));
 for(const row of rows){const id=aliases.get(normalize(row.aba))||'other';if(!groups.has(id))groups.set(id,{id,label:'Outras frentes',total:0,pending:0});const group=groups.get(id);group.total++;if(affected.has(row))group.pending++;}
 return [...groups.values()].map(group=>({...group,rate:group.total?group.pending/group.total:0}));
}
