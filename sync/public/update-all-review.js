import {displaySchoolName} from './school-display.js';
const names={inventory:'Inventário','blue-monitor':'Blue Monitor',centralizados:'Eq. Central.'};
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);if(cls)el.className=cls;return el;};
const number=value=>new Intl.NumberFormat('pt-BR').format(value||0);
function dialog(title,description){
 const el=node('dialog',undefined,'school-sheet import-guard-dialog');el.setAttribute('aria-labelledby','update-all-title');const head=node('header',undefined,'school-sheet-head'),copy=node('div'),heading=node('h2',title);heading.id='update-all-title';copy.append(heading,node('p',description));const close=node('button','Fechar','ghost-btn');close.type='button';head.append(copy,close);el.append(head);document.body.append(el);return {el,close};
}
export function reviewAllUpdates(candidates){return new Promise(resolve=>{
 const {el,close}=dialog('Revisar atualização de todas as bases','Confira as alterações antes de publicar. Cada base será atualizada separadamente; se uma falhar, as demais poderão concluir. Eq. Central. será conferido ao final, com o Inventário publicado.');let settled=false;
 const done=value=>{if(settled)return;settled=true;el.close();el.remove();resolve(value)};close.onclick=()=>done(false);el.addEventListener('cancel',event=>{event.preventDefault();done(false)});
 let warnings=false;
 for(const item of candidates){
  if(item.prepared?.report){const original=item.prepared.report;item.prepared={...item.prepared,report:{...original,...Object.fromEntries(['addedSchools','removedSchools','renamedSchools'].filter(key=>Array.isArray(original[key])).map(key=>[key,original[key].map(s=>({...s,name:displaySchoolName(s.name),...(s.previousName?{previousName:displaySchoolName(s.previousName)}:{})}))]))}};}
  const section=node('section');section.append(node('h3',names[item.collection]));
  if(item.error)section.append(node('p','Não foi possível preparar esta base: '+item.error.message,'import-guard-warning'));
  else if(item.prepared.unchanged)section.append(node('p','Já está atualizada; não haverá nova publicação.','premium-note'));
  else{
   const report=item.prepared.report,table=node('table',undefined,'premium-table import-guard-summary'),head=node('thead'),header=node('tr');for(const value of ['Indicador','Atual','Após atualizar'])header.append(node('th',value));head.append(header);table.append(head);const body=node('tbody');
   for(const [label,key]of [['Registros','records'],['Escolas / CIEs','schools'],['Arquivos','files']]){const row=node('tr');row.append(node('th',label),node('td',number(report.before[key])),node('td',number(report.after[key])));body.append(row);}table.append(body);section.append(table);
   for(const [title,items]of [['Alertas',report.warnings||[]],['Novas escolas',(report.addedSchools||[]).map(s=>s.name+' · CIE '+s.cie)],['Escolas ausentes',(report.removedSchools||[]).map(s=>s.name+' · CIE '+s.cie)],['Identificações alteradas',(report.renamedSchools||[]).map(s=>'CIE '+s.cie+': '+s.previousName+' → '+s.name)]])if(items.length){const details=node('details');details.open=title==='Alertas';details.append(node('summary',title+' · '+items.length));const list=node('ul');for(const text of items)list.append(node('li',text));details.append(list);section.append(details);if(title==='Alertas')warnings=true;}
  }
  el.append(section);
 }
 const actions=node('div',undefined,'import-guard-actions'),cancel=node('button','Cancelar','ghost-btn'),confirm=node('button','Atualizar tudo','primary-btn');cancel.type=confirm.type='button';cancel.onclick=()=>done(false);confirm.onclick=()=>done(true);
 if(warnings){const label=node('label',undefined,'import-guard-ack'),check=node('input');check.type='checkbox';label.append(check,node('span','Conferi os alertas das bases que serão publicadas.'));confirm.disabled=true;check.onchange=()=>{confirm.disabled=!check.checked};el.append(label);}
 el.append(node('p','As versões anteriores do Inventário e do Blue Monitor permanecerão no histórico.','premium-note'));actions.append(cancel,confirm);el.append(actions);el.showModal();cancel.focus();
});}
export function showAllUpdateResults(results){return new Promise(resolve=>{
 const failed=results.some(r=>r.status==='failed'),{el,close}=dialog(failed?'Atualização concluída com pendências':'Atualização de todas as bases concluída','Confira o resultado de cada base.');
 const statuses={updated:'Atualizado',unchanged:'Sem alterações',failed:'Não atualizado'};
 for(const result of results){const section=node('section');section.append(node('h3',names[result.collection]+' · '+statuses[result.status]),node('p',result.message));if(result.records!==undefined)section.append(node('p',number(result.records)+' registros publicados.','premium-note'));if(result.problems?.length){const details=node('details');details.append(node('summary','Detalhes para correção'));const list=node('ul');for(const text of result.problems)list.append(node('li',text));details.append(list);section.append(details);}el.append(section);}
 const done=()=>{el.close();el.remove();resolve()};close.onclick=done;el.addEventListener('cancel',event=>{event.preventDefault();done()});const button=node('button','Concluir','primary-btn');button.type='button';button.onclick=done;el.append(button);el.showModal();button.focus();
});}
