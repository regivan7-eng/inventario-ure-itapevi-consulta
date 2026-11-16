import {displaySchoolName} from './school-display.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function frame(title,description){const d=el('dialog',undefined,'school-sheet import-guard-dialog');const head=el('header',undefined,'school-sheet-head');const copy=el('div');const h=el('h2',title);h.id='import-guard-title';copy.append(h,el('p',description));const close=el('button','Fechar','ghost-btn');close.type='button';close.setAttribute('aria-label','Fechar revisão da atualização');head.append(copy,close);d.append(head);d.setAttribute('aria-labelledby',h.id);document.body.append(d);return {d,close};}
export function chooseImport(){return new Promise(resolve=>{
 const {d,close}=frame('Atualizar inventário','Envie o arquivo completo de uma ou mais escolas. Todas as abas serão importadas; as demais escolas permanecerão intactas.');let settled=false,mode='schools';const done=v=>{if(settled)return;settled=true;d.close();d.remove();resolve(v);};close.onclick=()=>done(null);d.addEventListener('cancel',e=>{e.preventDefault();done(null);});
 const actions=el('div',undefined,'import-guard-choices'),files=el('button','Atualizar escolas','primary-btn');files.type='button';
 const input=el('input');input.type='file';input.multiple=true;input.accept='.xlsx,.xls,.csv';input.hidden=true;input.setAttribute('aria-label','Arquivos completos das escolas');
 const directory=el('input');directory.type='file';directory.multiple=true;directory.setAttribute('webkitdirectory','');directory.hidden=true;
 input.onchange=()=>done(input.files?.length?{kind:'files',mode,files:[...input.files]}:null);input.addEventListener('cancel',()=>{input.value='';});directory.onchange=()=>done(directory.files?.length?{kind:'files',mode:'replace',files:[...directory.files].filter(f=>/\.(xlsx|xls|csv)$/i.test(f.name))}:null);
 files.onclick=()=>{mode='schools';input.click();};actions.append(files);d.append(actions,el('p','Identificação obrigatória: CIE - NOME DA ESCOLA - INVENTÁRIO.xlsx. Divergências no conteúdo serão apontadas para correção manual.','premium-note'));
 const advanced=el('details',undefined,'import-guard-advanced');advanced.append(el('summary','Opções avançadas'));advanced.append(el('p','Substituir base completa remove as escolas ausentes na seleção. Use somente para uma troca integral.','import-guard-warning'));
 const options=el('div',undefined,'import-guard-choices'),folder=el('button','Atualizar Pasta','ghost-btn'),history=el('button','Restaurar','ghost-btn');for(const button of [folder,history])button.type='button';
 folder.onclick=async()=>{if(window.showDirectoryPicker&&window.isSecureContext){try{const handle=await window.showDirectoryPicker({mode:'read'});done({kind:'files',mode:'replace',files:await window.collectDirectoryFiles(handle)});}catch(e){if(e.name!=='AbortError')advanced.append(el('p','Não foi possível abrir a pasta. Tente selecionar a pasta novamente.','import-guard-warning'));}}else directory.click();};history.title='Restaurar a versão anterior do inventário';history.onclick=()=>done({kind:'history'});options.append(folder,history);advanced.append(options);d.append(advanced,input,directory,el('p','Os arquivos originais não são modificados. Novos CIEs são aceitos. Nenhuma atualização será publicada sem sua confirmação.','premium-note'));d.showModal();files.focus();
});}
export function showImportProblems(messages,{collection="Inventário",title='Atualização bloqueada',description='Foram encontrados arquivos incompatíveis. Nenhuma parte da seleção foi publicada; a base atual foi mantida.',diagnosis=null}={}){return new Promise(resolve=>{
 const {d,close}=frame(title+' · '+collection,description);
 if(diagnosis){
  const context=el('section',undefined,'import-guard-info');
  context.append(el('h3','Diagnóstico'),el('p',diagnosis.cause));
  context.append(el('p','Local da falha: '+diagnosis.location),el('p','Etapa: '+diagnosis.stage));
  if(diagnosis.attemptedAt)context.append(el('p','Tentativa: '+diagnosis.attemptedAt+' (Brasília).'));
  if(diagnosis.code)context.append(el('p','Código: '+diagnosis.code+(diagnosis.httpStatus?' · HTTP '+diagnosis.httpStatus:'')));
  d.append(context,el('h3','Detalhes registrados'));
 }
 const list=el('ul',undefined,'import-guard-problems');for(const message of messages)list.append(el('li',message));d.append(list);
 if(diagnosis){
  if(diagnosis.errorsOmitted)d.append(el('p',diagnosis.errorsOmitted+' ocorrência(s) adicional(is) não constam neste registro. Corrija as ocorrências listadas e execute uma nova verificação.','premium-note'));
  const guidance=el('section',undefined,'import-guard-info'),steps=el('ol');
  for(const step of diagnosis.steps)steps.append(el('li',step));
  guidance.append(el('h3','Como resolver'),steps);d.append(guidance);
 }
 const button=el('button','Entendi','primary-btn');button.type='button';const done=()=>{d.close();d.remove();resolve();};button.onclick=close.onclick=done;d.addEventListener('cancel',e=>{e.preventDefault();done();});d.append(button);d.showModal();button.focus();
});}
function listSection(d,title,items,cls){if(!items.length)return;const section=el('section',undefined,cls),h=el('h3',title),list=el('ul');for(const item of items)list.append(el('li',item));section.append(h,list);d.append(section);}
export function reviewImport(report,{restoring=false,ignoredRows=0,collection="Inventário"}={}){return new Promise(resolve=>{
 report={...report,...Object.fromEntries(['addedSchools','removedSchools','renamedSchools','affectedSchools'].filter(key=>Array.isArray(report[key])).map(key=>[key,report[key].map(s=>({...s,name:displaySchoolName(s.name),...(s.previousName?{previousName:displaySchoolName(s.previousName)}:{})}))]))};
 const schoolMode=report.mode==='schools';
 const {d,close}=frame((restoring?'Revisar restauração':'Revisar atualização')+' · '+collection,schoolMode?'Somente as escolas abaixo serão atualizadas. As demais escolas permanecerão intactas.':'A base publicada continua ativa. Confira a comparação antes de confirmar a substituição completa.');let settled=false;const done=value=>{if(settled)return;settled=true;d.close();d.remove();resolve(value);};close.onclick=()=>done(false);d.addEventListener('cancel',e=>{e.preventDefault();done(false);});
 const table=el('table',undefined,'premium-table import-guard-summary');const head=el('thead'),hr=el('tr');for(const h of ['Indicador','Atual',schoolMode?'Após atualização':'Nova base','Diferença'])hr.append(el('th',h));head.append(hr);table.append(head);const body=el('tbody'),format=n=>new Intl.NumberFormat('pt-BR').format(n);
 for(const [label,key]of [['Registros','records'],['Escolas / CIEs','schools'],['Arquivos','files'],['Sem serial válido','missingSerial'],collection==='Blue Monitor'?['Sem sincronização','missingSync']:['Sem avaliação','missingAssessment']]){const tr=el('tr'),diff=report.after[key]-report.before[key];tr.append(el('th',label),el('td',format(report.before[key])),el('td',format(report.after[key])),el('td',(diff>0?'+':'')+format(diff)));body.append(tr);}table.append(body);d.append(table);
 if(schoolMode){listSection(d,'Escolas selecionadas',report.affectedSchools.map(s=>s.name+' · CIE '+s.cie+' · '+format(s.before)+' → '+format(s.after)+' registros'+(s.isNew?' · nova escola':'')),'import-guard-info');d.append(el('p',format(report.preservedSchools)+' escola(s) preservada(s), sem substituição dos seus registros.','premium-note'));}
 listSection(d,'Novas escolas · aceitas normalmente',report.addedSchools.map(s=>s.name+' · CIE '+s.cie),'import-guard-info');
 listSection(d,'Novas categorias · aceitas',report.addedCategories,'import-guard-info');
 listSection(d,'Conferência necessária',report.warnings,'import-guard-warning');
 listSection(d,'Escolas ausentes na seleção',report.removedSchools.map(s=>s.name+' · CIE '+s.cie),'import-guard-details');
 listSection(d,'Alterações de identificação',report.renamedSchools.map(s=>'CIE '+s.cie+': '+s.previousName+' → '+s.name),'import-guard-details');
 if(report.identityCompletion?.records)d.append(el('p',report.identityCompletion.records+' registro(s) com CIE ou URE ausente foram completados para a importação. Revise e corrija as planilhas de origem em Qualidade dos dados → Identificação a revisar.','premium-note'));
 if(report.identityCompletion?.residualRows)d.append(el('p',report.identityCompletion.residualRows+' linha(s) residuais sem CIE e URE não serão importadas como equipamentos. A revisão dessas linhas ficará disponível em Qualidade dos dados → Identificação a revisar.','premium-note'));
 if(ignoredRows)d.append(el('p',ignoredRows+' linha(s) residuais sem identificação ou de outras UREs serão desconsideradas.','premium-note'));
 if(restoring)d.append(el('p','Atenção: restaurar substituirá a base atual de '+collection+' pela versão anterior para todos os usuários. Confira os números acima. A base atual ficará preservada no histórico.','import-guard-warning'));
 const footer=el('div',undefined,'import-guard-actions');const cancel=el('button','Cancelar','ghost-btn'),confirm=el('button',restoring?'Restaurar':schoolMode?'Atualizar':'Substituir','primary-btn');cancel.type=confirm.type='button';cancel.onclick=()=>done(false);confirm.onclick=()=>done(true);
 if(report.warnings.length){const label=el('label',undefined,'import-guard-ack'),check=el('input');check.type='checkbox';check.id='import-guard-ack';label.append(check,el('span',schoolMode?'Conferi os alertas e os arquivos completos das escolas selecionadas.':'Conferi os alertas e confirmo que esta é a base completa que desejo publicar.'));confirm.disabled=true;check.onchange=()=>{confirm.disabled=!check.checked;};d.append(label);}
 footer.append(cancel,confirm);d.append(el('p',schoolMode?'Após a confirmação, os dados completos das escolas selecionadas serão substituídos para todos. As demais escolas serão preservadas. A versão anterior ficará no histórico.':'Após a confirmação, esta versão substituirá a base atual para todos. A versão anterior será preservada no histórico.','premium-note'),footer);d.showModal();cancel.focus();
});}
