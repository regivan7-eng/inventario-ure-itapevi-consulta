const text=value=>String(value??'').trim();
const schoolKey=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').split(' ').filter(w=>w&&!['EE','E','E.E','ESCOLA','ESTADUAL','PROFESSOR','PROFESSORA','PROF','PROFA','DOUTOR','DOUTORA','DR','DRA','PADRE','PE'].includes(w)).join(' ');
export function filenameIdentity(filename){
 const match=text(filename).match(/^(?:CIE\s*)?([1-9]\d{0,11})\s*[-–—_]\s*(.+)\.(xlsx|xls|csv)$/i);
 if(!match)return null;
 const name=match[2].replace(/\s*\(\d+\)$/,'').replace(/\s*[-–—_]\s*INVENT[ÁAÃ]RIO(?:\s*\(\d+\))?$/i,'').trim();
 return schoolKey(name)&&name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'')!=='INVENTARIO'?{cie:match[1],name}:null;
}
// School registration is independent of equipment rows. Existing row CIEs
// remain authoritative; only a workbook with no rows uses its filename identity.
export function inventorySchools(data){
 const schools=new Map(),filesWithRows=new Set();
 for(const row of data?.records||[]){
  filesWithRows.add(row.arquivo);const cie=text(row.cie);if(!/^[1-9]\d{0,11}$/.test(cie))continue;
  if(!schools.has(cie))schools.set(cie,{cie,name:text(row.unidade)||filenameIdentity(row.arquivo)?.name||'Escola não informada',records:0,files:new Set()});
  const school=schools.get(cie);school.records++;school.files.add(row.arquivo);
 }
 for(const book of data?.workbooks||[]){
  if(filesWithRows.has(book.arquivo)||book.linhas!==0||book.sem_dados!==true)continue;
  const id=filenameIdentity(book.arquivo);if(!id)continue;
  if(!schools.has(id.cie))schools.set(id.cie,{...id,records:0,files:new Set()});
  schools.get(id.cie).files.add(book.arquivo);
 }
 return [...schools.values()].map(s=>({...s,files:[...s.files],sem_dados:s.records===0}));
}
