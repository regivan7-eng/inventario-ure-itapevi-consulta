import {describeSyncFailure} from './sync-diagnostics.js';
import {readSyncPreview} from './sync-stream.js';
import {runAllUpdates} from './update-all.js';
const names={inventory:'Inventário','blue-monitor':'Blue Monitor',centralizados:'Eq. Central.',all:'Todas as bases'};
const date=value=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Ainda não realizada';
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
const style=node('link');style.rel='stylesheet';style.href=new URL('./automatic-sync.css', import.meta.url).href;document.head.append(style);
const host=node('div',undefined,'automatic-sync');host.setAttribute('aria-live','polite');
const tools=node('div',undefined,'sync-tools'),checkButton=node('button','Verificar agora','sync-check-button');
checkButton.type='button';checkButton.hidden=true;checkButton.setAttribute('aria-expanded','false');checkButton.setAttribute('aria-controls','sync-base-menu');
const menu=node('div',undefined,'sync-base-menu');menu.id='sync-base-menu';menu.hidden=true;
for(const collection of ['inventory','blue-monitor','centralizados','all']){const button=node('button',collection==='all'?'Atualizar tudo':names[collection]);button.type='button';button.dataset.syncCollection=collection;if(collection==='centralizados')button.title='Equipamentos Centralizados';if(collection==='all'){button.className='sync-all-button';button.title='Atualizar Inventário, Blue Monitor e Equipamentos Centralizados';}button.onclick=()=>{menu.hidden=true;checkButton.setAttribute('aria-expanded','false');manual(collection);};menu.append(button);}
checkButton.onclick=()=>{menu.hidden=!menu.hidden;checkButton.setAttribute('aria-expanded',String(!menu.hidden));};
tools.append(checkButton,menu);
document.addEventListener('click',event=>{if(!tools.contains(event.target)){menu.hidden=true;checkButton.setAttribute('aria-expanded','false');}});
tools.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.hidden=true;checkButton.setAttribute('aria-expanded','false');checkButton.focus();}});
const schedule=node('small','Update de Seg à Sex das 8h às 18h.','automatic-sync-time');schedule.hidden=true;
let busy=false;
async function manual(collection){
 if(collection==='all')return manualAll();
 if(collection==='centralizados')return manualCentralized();
 if(busy)return;busy=true;checkButton.disabled=true;menu.hidden=true;
 try{
  window.inventoryUpdateNotice?.('Conectando à pasta pública…','loading',names[collection]);
  const notice=document.getElementById('central-update-notice'),message=notice?.querySelector('.update-message');
  const oldContinue=notice?.querySelector('[data-sync-continue]');oldContinue?.remove();
  if(notice){const keepBrowsing=node('button','Continuar consultando','ghost-btn');keepBrowsing.type='button';keepBrowsing.dataset.syncContinue='true';keepBrowsing.onclick=()=>notice.close();notice.querySelector('.update-notice-actions')?.prepend(keepBrowsing);}
  const response=await fetch('/api/automatic-sync/preview',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify({collection})});
  const {ok,value:prepared}=await readSyncPreview(response,progress=>{if(message)message.textContent=String(progress.message||'Verificando…')+(progress.elapsedSeconds?' · '+progress.elapsedSeconds+' s':'');});
  notice?.querySelector('[data-sync-continue]')?.remove();notice?.close();
  const review=await import('./import-review.js');
  if(!ok){
   const diagnosis=describeSyncFailure({errors:prepared.errors||[prepared.error||'Não foi possível conferir os arquivos.'],failure:prepared.failure,retryable:prepared.retryable},collection);
   await review.showImportProblems(diagnosis.observed,{collection:names[collection],title:diagnosis.title,description:diagnosis.impact,diagnosis});return;
  }
  if(prepared.unchanged){window.inventoryUpdateNotice?.('Nenhuma alteração encontrada na pasta. A base publicada já está atualizada.','success',names[collection]);return;}
  if(!await review.reviewImport(prepared.report,{restoring:false,ignoredRows:0,collection:names[collection]}))return;
  window.inventoryUpdateNotice?.('Publicando a versão conferida…','loading',names[collection]);
  const result=await fetch(collection==='inventory'?'/api/data':'/api/blue-monitor',{method:'POST',headers:{'Content-Type':'application/json','X-Inventory-Approval':prepared.approval},body:JSON.stringify(prepared.submission)});
  const value=await result.json();if(!result.ok)throw Error(value.error||'A publicação não foi confirmada.');
  await applyPublication(collection,value);
  window.inventoryUpdateNotice?.('Base atualizada e disponível no painel. A versão anterior foi preservada.','success',names[collection]);
 }catch(e){window.inventoryUpdateNotice?.(e.message||'Não foi possível concluir. Recarregue o painel para conferir a versão publicada.','error',names[collection]);}
 finally{document.getElementById('central-update-notice')?.querySelector('[data-sync-continue]')?.remove();busy=false;checkButton.disabled=false;await refresh(true);}
}
async function applyPublication(collection,value){
 if(collection==='inventory'&&value.dataset){window.setDashboardData?.(value.dataset);const dateLabel=document.getElementById('data-date');if(dateLabel)dateLabel.textContent='publicada em '+date(value.updatedAt);try{const ui=await import('./data-evolution-ui.js');ui.showDataState({kind:'central',dataset:value.dataset,updatedAt:value.updatedAt});}catch{}}
 if(collection==='blue-monitor'&&value.dataset)window.setBlueMonitorDataset?.(value.dataset,value.updatedAt);
}
function loadingAll(message,collection='all'){
 window.inventoryUpdateNotice?.(message,'loading',names[collection]);const notice=document.getElementById('central-update-notice');
 notice?.querySelector('[data-sync-continue]')?.remove();if(notice){const button=node('button','Continuar consultando','ghost-btn');button.type='button';button.dataset.syncContinue='true';button.onclick=()=>notice.close();notice.querySelector('.update-notice-actions')?.prepend(button);}
 return notice?.querySelector('.update-message');
}
function closeLoading(){const notice=document.getElementById('central-update-notice');notice?.querySelector('[data-sync-continue]')?.remove();notice?.close();}
async function updateCentralized(){
 const response=await fetch('/api/centralizados/comparison',{method:'POST',cache:'no-store'}),value=await response.json();if(!response.ok)throw Error(value.error||'Não foi possível atualizar Equipamentos Centralizados.');
 const ui=await import('./centralized.js');ui.applyCentralizedUpdate(value);
 if(value.source?.stale)throw Error(value.source.notice||'A origem não pôde ser confirmada. A última base válida foi mantida.');return value;
}
async function manualCentralized(){
 if(busy)return;busy=true;checkButton.disabled=true;menu.hidden=true;
 try{loadingAll('Conferindo a origem e atualizando a comparação com o Inventário…','centralizados');await updateCentralized();window.inventoryUpdateNotice?.('Origem conferida e comparação atualizada no painel.','success',names.centralizados);}
 catch(error){window.inventoryUpdateNotice?.(error.message||'Não foi possível atualizar Equipamentos Centralizados.','error',names.centralizados);}
 finally{document.getElementById('central-update-notice')?.querySelector('[data-sync-continue]')?.remove();busy=false;checkButton.disabled=false;await refresh(true);}
}
async function manualAll(){
 if(busy)return;busy=true;checkButton.disabled=true;menu.hidden=true;
 let message=loadingAll('Conferindo Inventário e Blue Monitor…');
 try{
  const ui=await import('./update-all-review.js');
  const result=await runAllUpdates({
   prepare:async collection=>{const response=await fetch('/api/automatic-sync/preview',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify({collection})});const {ok,value}=await readSyncPreview(response,progress=>{if(message)message.textContent=names[collection]+' · '+String(progress.message||'Verificando…');});if(!ok)throw Object.assign(Error(value.error||'A origem não pôde ser conferida.'),{problems:value.errors});return value;},
   review:async candidates=>{closeLoading();const confirmed=await ui.reviewAllUpdates(candidates);if(confirmed)message=loadingAll('Publicando as bases conferidas…');return confirmed;},
   publish:async(collection,prepared)=>{const response=await fetch(collection==='inventory'?'/api/data':'/api/blue-monitor',{method:'POST',headers:{'Content-Type':'application/json','X-Inventory-Approval':prepared.approval},body:JSON.stringify(prepared.submission)});const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error||'A publicação não foi confirmada.'),{problems:value.errors});await applyPublication(collection,value);return value;},
   centralized:updateCentralized,
   onProgress:collection=>{if(message)message.textContent=names[collection]+' · '+(collection==='centralizados'?'Conferindo a origem e a comparação…':'Publicando a versão conferida…');}
  });
  closeLoading();if(result.cancelled){window.setImportStatus?.('Atualização de todas as bases cancelada. Nenhuma nova versão foi publicada.','ready');return;}
  await ui.showAllUpdateResults(result.results);
 }catch(error){window.inventoryUpdateNotice?.(error.message||'Não foi possível concluir a atualização. Confira a versão publicada antes de tentar novamente.','error',names.all);}
 finally{document.getElementById('central-update-notice')?.querySelector('[data-sync-continue]')?.remove();busy=false;checkButton.disabled=false;await refresh(true);}
}
function render(data){
 host.replaceChildren();checkButton.hidden=!data.enabled||!data.canUpdate;schedule.hidden=!data.enabled;
 if(!data.enabled)return;
 schedule.textContent='Update de Seg à Sex das 8h às 18h.';
 schedule.title='Atualização de hora em hora, no horário de Brasília.\n'+['inventory','blue-monitor'].map(key=>names[key]+': última verificação '+date(data.states[key]?.lastCheckedAt)).join('\n');
 schedule.dataset.error=String(Object.values(data.states).some(state=>state?.blocked||state?.retryable));
 for(const collection of ['inventory','blue-monitor']){
  const state=data.states[collection];if(!state?.blocked&&!state?.retryable)continue;
  const diagnosis=describeSyncFailure(state,collection);
  const warning=node('div',undefined,'sync-failure');warning.setAttribute('role','alert');
  warning.append(node('span',names[collection]+': '+diagnosis.title+'.'));
  const details=node('button','Detalhes e orientação');details.type='button';details.onclick=async()=>{
   const review=await import('./import-review.js');
   await review.showImportProblems(diagnosis.observed,{
    collection:names[collection],title:diagnosis.title,description:diagnosis.impact,
    diagnosis:{...diagnosis,attemptedAt:date(state.lastFailureAt),errorsOmitted:state.errorsOmitted||0}
   });
  };
  warning.append(details);host.append(warning);
 }
}
async function refresh(force=false){
 if((document.hidden&&!force)||busy)return;
 try{const response=await fetch('/api/automatic-sync',{cache:'no-store'});if(!response.ok)throw Error();render(await response.json());}
 catch{schedule.hidden=false;schedule.textContent='Auto · consulta indisponível';schedule.title='Não foi possível consultar a automação. Recarregue o painel para tentar novamente.';}
}
async function init(){
 await window.inventoryReady;
 const main=document.querySelector('.main')||document.querySelector('main'),actions=document.querySelector('.top-actions');if(!main||!actions)return;
 const update=document.getElementById('import-folder-btn');if(update?.parentElement===actions)update.after(tools);else actions.append(tools);
 const foot=document.querySelector('.sidebar-foot')||main.querySelector('footer');
 if(foot)foot.append(schedule,host);else actions.append(schedule,host);
 await refresh(true);setInterval(()=>refresh(),60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
}
init().catch(()=>{});
