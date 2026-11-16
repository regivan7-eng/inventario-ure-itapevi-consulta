import {mountReconciliation} from './centralized-reconciliation-ui.js';
import {displaySchoolName} from './school-display.js';
import {GROUPS,filterCentralized,summarizeCentralized,centralizedOptions} from './centralized-model.js';
const $=id=>document.getElementById(id),fmt=n=>Number(n||0).toLocaleString('pt-BR'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const comparisonModelLabel=c=>c?.key==='c5'?'Chromebook Samsung Go + Samsung 4':c?.model&&c.model!=='-'?c.model:c?.label||'';
const SOURCE='https://seesp-my.sharepoint.com/:x:/g/personal/itp_seintec_educacao_sp_gov_br/IQCY6oGw1gOpSKowWEaizVBjAUEKmQ0LdKCpixR3wPHGFlE?e=UaPZ3Y';
const state={mode:'comparison',query:'',school:'',category:'',model:'',detail:false,page:1,sort:'name',direction:1};
let comparison,reconciliation,lastLoaded=0;
let data,rows=[],busy=false,canUpdate=false,schoolOptions=[],activeSchool=-1;
let sourcePoll;
let loadRevision=0;
const perPage=15;
function quantity(row){return state.model?Number(row.cells[state.model]||0):state.category?row.groups[state.category]:row.categoryTotal;}
function label(){const c=state.model?data.columns.find(c=>c.key===state.model):null;return c?(state.mode==='comparison'?comparisonModelLabel(c):(c.model&&c.model!=='-'?c.model:c.label)):GROUPS.find(g=>g.key===state.category)?.label||'Equipamentos nas categorias';}
function modelColumns(){return centralizedOptions(data,state).models;}
function setCategory(key){state.category=state.category===key?'':key;state.model='';state.page=1;render();}
function syncSelect(id,placeholder,options,selected){const select=$(id);select.replaceChildren(new Option(placeholder,''));for(const o of options)select.add(new Option(o.label,o.key));if(selected&&!options.some(o=>o.key===selected)){const old=id==='cc-category'?GROUPS.find(g=>g.key===selected):data.columns.find(c=>c.key===selected);const retained=new Option((old?.model&&old.model!=='-'?old.model:old?.label||selected)+' · sem resultados',selected);retained.disabled=true;select.add(retained);}select.value=selected;}
function closeSchools(){$('cc-school-options').hidden=true;$('cc-search').setAttribute('aria-expanded','false');$('cc-search').removeAttribute('aria-activedescendant');activeSchool=-1;}
function markSchool(index){activeSchool=index;const options=$('cc-school-options').querySelectorAll('[role="option"]');options.forEach((o,i)=>o.setAttribute('aria-selected',String(i===index)));if(options[index]){$('cc-search').setAttribute('aria-activedescendant',options[index].id);options[index].scrollIntoView({block:'nearest'});}}
function renderSchools(open=false){
 const list=$('cc-school-options');activeSchool=-1;$('cc-search').removeAttribute('aria-activedescendant');
 list.innerHTML=schoolOptions.map((r,i)=>`<li id="cc-school-option-${i}" role="option" aria-selected="false" data-cie="${r.cie}"><span>${esc(r.name)}</span><small>CIE ${r.cie}</small></li>`).join('')||'<li class="cc-school-empty" role="presentation">Nenhuma escola neste recorte.</li>';
 list.querySelectorAll('[data-cie]').forEach(o=>{o.onpointerdown=e=>e.preventDefault();o.onclick=()=>chooseSchool(o.dataset.cie);});
 if(open){list.hidden=false;$('cc-search').setAttribute('aria-expanded','true');}
}
function syncFilters(){const available=centralizedOptions(data,state);schoolOptions=available.schools;syncSelect('cc-category','Todas as categorias',available.categories.map(g=>({key:g.key,label:g.label})),state.category);syncSelect('cc-model','Todos os modelos',available.models.map(c=>({key:c.key,label:state.mode==='comparison'?comparisonModelLabel(c):(c.model&&c.model!=='-'?c.model:c.label)})),state.model);renderSchools();}
function chooseSchool(cie){state.school=state.school===cie?'':cie;state.query='';$('cc-search').value=state.school?data.records.find(r=>r.cie===state.school).name+' · CIE '+state.school:'';state.page=1;closeSchools();render();}
function metric(title,value,note){return `<article class="cc-metric"><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;}
function render(){
 if(!data)return;syncFilters();rows=filterCentralized(data.records,state);const summary=summarizeCentralized(rows),focus=rows.reduce((n,r)=>n+quantity(r),0);
 $('cc-kpis').innerHTML=metric(label(),fmt(focus),state.category||state.model?'Quantidade no recorte selecionado':'Soma das seis categorias, sem duplicar subtotais')+metric('Escolas',fmt(summary.schools),'CIEs únicos no recorte')+metric('Total informado · Entregues',fmt(summary.reportedTotal),'Conforme a última coluna da planilha')+metric('Média por escola',summary.schools?(focus/summary.schools).toLocaleString('pt-BR',{maximumFractionDigits:1}):'0',state.category||state.model?'Na categoria ou modelo selecionado':'Equipamentos nas categorias por CIE');
 $('cc-total-note').textContent=data.reportedScope==='all-categories'?'A soma das categorias e o total informado consideram todos os grupos, sem duplicar o subtotal de notebooks.':data.reportedScope==='mixed'?'A soma das categorias é calculada pelos grupos. O total informado preserva os valores da planilha e apresenta diferenças entre as escolas.':'A soma das categorias inclui todos os grupos. O total informado na coluna Entregues considera tablets, TVs, Educatrons e recarga, sem desktops e notebooks.';
 const matchedSchools=filterCentralized(data.records,{query:state.query,school:state.school});$('cc-scope').textContent=fmt(matchedSchools.length)+' de '+fmt(data.records.length)+' escolas';$('cc-source-date').hidden=state.mode==='comparison';$('cc-hero-title').textContent=state.school?(data.records.find(r=>r.cie===state.school)?.name||'Equipamentos da Escola'):'Equipamentos centralizados';$('cc-hero-subtitle').textContent=state.school?'Inventário × Envio da Secretaria da Educação · CIE '+state.school:'Inventário × Envio da Secretaria da Educação';
 $('cc-reset').disabled=!state.query&&!state.school&&!state.category&&!state.model&&!reconciliation?.isFiltered();
 renderComposition(summary);renderModels();renderRank();renderTable();reconciliation?.update(data,comparison,{query:state.query,school:state.school,category:state.category,model:state.model});
 $('cc-table-mode').setAttribute('aria-pressed',String(state.detail));$('cc-table-mode').textContent=state.detail?'Ver resumo por escola':'Ver detalhamento por modelo';
}
function renderComposition(summary){
 const total=summary.categoryTotal;let offset=0;
 const rings=GROUPS.map(g=>{const pct=total?summary.groups[g.key]/total*100:0;const ring=`<circle cx="78" cy="78" r="58" fill="none" stroke="${g.color}" stroke-width="18" pathLength="100" stroke-dasharray="${pct} ${100-pct}" stroke-dashoffset="${-offset}" transform="rotate(-90 78 78)"><title>${esc(g.label)}: ${fmt(summary.groups[g.key])}</title></circle>`;offset+=pct;return ring;}).join('');
 $('cc-composition').innerHTML=`<div class="cc-donut"><svg viewBox="0 0 156 156" role="img" aria-label="Composição das categorias: ${fmt(total)} equipamentos"><circle cx="78" cy="78" r="58" fill="none" stroke="#eaf0f5" stroke-width="18"/>${rings}</svg><div><strong>${fmt(total)}</strong><small>nas categorias</small></div></div><div class="cc-legend">${GROUPS.map(g=>`<button type="button" data-group="${g.key}" aria-pressed="${state.category===g.key}" ${!summary.groups[g.key]&&state.category!==g.key?'disabled':''}><i style="--cc-color:${g.color}"></i><span>${esc(g.label)}</span><strong>${fmt(summary.groups[g.key])}</strong><small>${total?(summary.groups[g.key]/total*100).toLocaleString('pt-BR',{maximumFractionDigits:1}):0}%</small></button>`).join('')}</div>`;
 $('cc-composition').querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>setCategory(b.dataset.group));
}
function renderModels(){
 const values=modelColumns().map(c=>({column:c,value:rows.reduce((n,r)=>n+Number(r.cells[c.key]||0),0)})).sort((a,b)=>b.value-a.value).slice(0,8),max=Math.max(1,...values.map(v=>v.value));
 $('cc-model-chart').innerHTML=values.map(({column:c,value})=>`<button type="button" class="cc-bar-row" data-model="${c.key}" aria-pressed="${state.model===c.key}"><span title="${esc(c.label)}">${esc(state.mode==='comparison'?comparisonModelLabel(c):(c.model&&c.model!=='-'?c.model:c.label))}</span><div class="cc-bar-track"><i style="width:${value/max*100}%;--cc-color:${GROUPS.find(g=>g.key===c.group).color}"></i></div><strong>${fmt(value)}</strong></button>`).join('')||'<p class="cc-empty">Nenhum modelo neste recorte.</p>';
 $('cc-model-chart').querySelectorAll('[data-model]').forEach(b=>b.onclick=()=>{const c=data.columns.find(c=>c.key===b.dataset.model);if(state.model===c.key){state.model='';}else{state.category=c.group;state.model=c.key;}$('cc-category').value=state.category;state.page=1;render();});
}
function renderRank(){
 const ranked=[...rows].sort((a,b)=>quantity(b)-quantity(a)||a.name.localeCompare(b.name,'pt-BR')).slice(0,10),max=Math.max(1,...ranked.map(quantity));
 $('cc-rank').innerHTML=ranked.map((r,i)=>`<button type="button" class="cc-rank-row" data-school="${r.cie}" title="Filtrar ${esc(r.name)}"><small>${String(i+1).padStart(2,'0')}</small><span>${esc(r.name)}<small>CIE ${r.cie}</small></span><div class="cc-bar-track"><i style="width:${quantity(r)/max*100}%;--cc-color:#16a6ce"></i></div><strong>${fmt(quantity(r))}</strong></button>`).join('')||'<p class="cc-empty">Nenhuma escola encontrada. Ajuste ou limpe os filtros.</p>';
 $('cc-rank').querySelectorAll('[data-school]').forEach(b=>b.onclick=()=>chooseSchool(b.dataset.school));
}
function tableColumns(){
 if(state.detail)return [{key:'name',label:'Escola / CIE',read:r=>r.name},...data.columns.filter(c=>c.index>=2&&(!state.category||c.group===state.category||c.index===18)).map(c=>({key:c.key,label:c.label,model:c.model,read:r=>r.cells[c.key]}))];
 return [{key:'name',label:'Escola / CIE',read:r=>r.name},...GROUPS.map(g=>({key:g.key,label:g.label,read:r=>r.groups[g.key]})),{key:'categoryTotal',label:'Soma das categorias',read:r=>r.categoryTotal},{key:'reportedTotal',label:'Total informado · Entregues',read:r=>r.reportedTotal}];
}
function renderTable(){
 const columns=tableColumns();if(!columns.some(c=>c.key===state.sort)){state.sort='name';state.direction=1;}
 const sortCol=columns.find(c=>c.key===state.sort),ordered=[...rows].sort((a,b)=>state.direction*(state.sort==='name'?a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'}):Number(sortCol.read(a)||0)-Number(sortCol.read(b)||0)));
 const pages=Math.max(1,Math.ceil(ordered.length/perPage));state.page=Math.min(state.page,pages);const shown=ordered.slice((state.page-1)*perPage,state.page*perPage);
 const head=columns.map(c=>`<th scope="col" aria-sort="${state.sort===c.key?(state.direction===1?'ascending':'descending'):'none'}"><button type="button" data-sort="${c.key}">${esc(c.label)}${state.sort===c.key?(state.direction===1?' ↑':' ↓'):''}${c.model&&c.model!=='-'?`<small>${esc(c.model)}</small>`:''}</button></th>`).join('');
 const body=shown.map(r=>`<tr>${columns.map(c=>c.key==='name'?`<th scope="row"><span title="${esc(r.name)}">${esc(r.name)}</span><small>CIE ${r.cie}</small></th>`:`<td class="${state.category===c.key||state.model===c.key?'cc-focused':''}">${c.read(r)===null||c.read(r)===undefined?'—':fmt(c.read(r))}</td>`).join('')}</tr>`).join('');
 const foot=columns.map(c=>c.key==='name'?'<th scope="row">Total do recorte</th>':`<td>${fmt(rows.reduce((n,r)=>n+Number(c.read(r)||0),0))}</td>`).join('');
 $('cc-table').innerHTML=`<thead><tr>${head}</tr></thead><tbody>${body||`<tr><td colspan="${columns.length}" class="cc-empty">Nenhuma escola encontrada.</td></tr>`}</tbody><tfoot><tr>${foot}</tr></tfoot>`;
 $('cc-table').querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{state.direction=state.sort===b.dataset.sort?-state.direction:b.dataset.sort==='name'?1:-1;state.sort=b.dataset.sort;renderTable();});
 $('cc-page').textContent=`${ordered.length?((state.page-1)*perPage+1):0}–${Math.min(state.page*perPage,ordered.length)} de ${fmt(ordered.length)} escolas · Página ${state.page} de ${pages}`;
 $('cc-prev').disabled=state.page===1;$('cc-next').disabled=state.page===pages;
}
function setData(value){
 if(value.sheetName!=='Centralizados NOVO'||!Array.isArray(value.records))throw Error('A origem não corresponde à aba Centralizados NOVO.');
 data={...value,records:value.records.map(r=>({...r,name:displaySchoolName(r.name),cells:{...r.cells,c1:displaySchoolName(r.cells.c1??r.name)}}))};if(state.school&&!data.records.some(r=>r.cie===state.school)){state.school='';$('cc-search').value=state.query;}render();
 const at=value.sourceModified||value.checkedAt;
 $('cc-source-date').textContent=(value.sourceModified?'Arquivo modificado em ':'Base consultada em ')+(at?new Date(at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'data não disponível');
 $('cc-notice').textContent=value.stale?value.notice:'';$('cc-notice').hidden=!value.stale;
}
async function load(force=false){
 if(busy)return;busy=true;const revision=++loadRevision;
 try{
  const response=await fetch('/api/centralizados/comparison',{method:force?'POST':'GET',cache:'no-store'});const value=await response.json();if(!response.ok)throw Error(value.error||'Comparação indisponível.');
  if(revision===loadRevision)applyCentralizedUpdate(value);
 }
 catch(error){$('cc-notice').textContent='Não foi possível renovar as bases. '+error.message;$('cc-notice').hidden=false;reconciliation.setError(error.message);}

 finally{busy=false;}
}
export function applyCentralizedUpdate(value){
 loadRevision++;
 canUpdate=!!value.canUpdate;comparison={...value.comparison,schools:value.comparison.schools.map(s=>({...s,name:displaySchoolName(s.name),inventory:s.inventory?{...s.inventory,name:displaySchoolName(s.inventory.name)}:null})),outsideSchools:value.comparison.outsideSchools?.map(s=>({...s,name:displaySchoolName(s.name)}))};reconciliation.clearError();setData(value.source);lastLoaded=Date.now();scheduleSourceCheck(value.source);
}
function scheduleSourceCheck(source){
 clearTimeout(sourcePoll);if(!source?.refreshing)return;
 sourcePoll=setTimeout(async()=>{
  if(document.hidden||location.hash!=='#centralizados')return;
  try{const response=await fetch('/api/centralizados?background=1',{cache:'no-store'});if(!response.ok)throw Error();const latest=await response.json();if(latest.refreshing)scheduleSourceCheck(latest);else await load();}
  catch{$('cc-notice').textContent='A última base válida continua em exibição. Use Verificar agora → Eq. Central. para conferir a origem novamente.';$('cc-notice').hidden=false;}
 },2000);
}
function exportRows(){
 if(state.mode==='comparison'){reconciliation.exportBook();return;}if(!window.XLSX)return;const columns=data.columns;
 const matrix=[columns.map(c=>c.label),columns.map(c=>c.model||''),...rows.map(r=>columns.map(c=>r.cells[c.key]??null))];
 const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(matrix);sheet['!cols']=columns.map(c=>({wch:c.index===1?48:c.index===0?12:22}));XLSX.utils.book_append_sheet(book,sheet,'Centralizados NOVO');XLSX.writeFile(book,'Centralizados_NOVO_recorte.xlsx');
}
async function init(){
 const view=$('view-centralizados');if(!view)return;
 view.innerHTML=`<header class="cc-heading cc-hero"><div class="cc-hero-brand"><span class="cc-hero-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M6 21 24 7l18 14v20H6z"/><path d="M18 41V27h12v14M12 25h4m16 0h4M24 7V3m0 0h8v5h-8"/><circle cx="24" cy="19" r="2"/></svg></span><div><div class="section-kicker">CONCILIAÇÃO DE EQUIPAMENTOS</div><h2 id="cc-hero-title">Equipamentos centralizados</h2><p id="cc-hero-subtitle">Inventário × Envio da Secretaria da Educação</p><small>Acompanhe o recebido e o inventariado por escola, categoria e modelo.</small></div></div><div class="cc-actions"><button class="ghost-btn" id="cc-export">Exportar XLSX</button></div></header><p id="cc-notice" class="cc-notice" role="status" hidden></p><div class="cc-view-switch" role="group" aria-label="Visão de Centralizados"><button type="button" id="cc-show-comparison" aria-pressed="true">Recebidos × Inventário</button><button type="button" id="cc-show-received" aria-pressed="false">Distribuição recebida</button></div><div class="cc-filters"><div class="cc-school-filter"><label for="cc-search">Escola ou CIE</label><input id="cc-search" type="search" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="cc-school-options" placeholder="Todas as escolas · digite para pesquisar" autocomplete="off"><ul id="cc-school-options" role="listbox" aria-label="Escolas disponíveis" hidden></ul></div><label>Categoria<select id="cc-category"><option value="">Todas as categorias</option>${GROUPS.map(g=>`<option value="${g.key}">${esc(g.label)}</option>`).join('')}</select></label><label>Modelo<select id="cc-model"><option value="">Todos os modelos</option></select></label><button class="ghost-btn" id="cc-reset">Limpar filtros</button></div><div class="cc-scope"><span id="cc-scope"></span><span id="cc-source-date"></span></div><section id="cc-comparison" aria-label="Conciliação entre recebidos e Inventário"></section><div id="cc-received-view" hidden><div class="cc-kpis" id="cc-kpis"></div><p id="cc-total-note" class="cc-total-note">A soma das categorias inclui todos os grupos. O total informado na coluna <strong>Entregues</strong> considera tablets, TVs, Educatrons e recarga, sem desktops e notebooks.</p><div class="cc-charts"><section class="cc-panel"><header><h3>Composição por categoria</h3><p>Clique em uma categoria para filtrar as escolas.</p></header><div class="cc-composition" id="cc-composition"></div></section><section class="cc-panel"><header><h3>Modelos no recorte</h3><p>Os oito maiores volumes. Clique em um modelo para filtrar.</p></header><div id="cc-model-chart" class="cc-model-chart"></div></section></div><section class="cc-panel cc-ranking"><header><h3>Distribuição por escola</h3><p>As dez maiores quantidades do recorte. Clique para consultar a escola.</p></header><div id="cc-rank"></div></section><section class="cc-panel cc-table-panel"><header><div><h3>Consulta das escolas</h3><p>Ordene pelos cabeçalhos. O total do rodapé considera todo o recorte, independentemente da página.</p></div><button class="ghost-btn" id="cc-table-mode" aria-pressed="false">Ver detalhamento por modelo</button></header><div class="cc-table-scroll" role="region" aria-label="Tabela de equipamentos centralizados" tabindex="0"><table id="cc-table"></table></div><div class="cc-pagination"><button class="ghost-btn" id="cc-prev">Anterior</button><span id="cc-page"></span><button class="ghost-btn" id="cc-next">Próxima</button></div></section></div><div class="cc-source"><span>Fonte: Equipamentos_Centralizados_V2.xlsx · apenas Centralizados NOVO.</span><a href="${SOURCE}" target="_blank" rel="noopener noreferrer">Abrir planilha de origem</a></div>`;
 reconciliation=mountReconciliation($('cc-comparison'),{onSchool:chooseSchool,onCategory:setCategory,onFilter:()=>{$('cc-reset').disabled=!state.query&&!state.school&&!state.category&&!state.model&&!reconciliation.isFiltered();}});
 function setMode(mode){state.mode=mode;$('cc-comparison').hidden=mode!=='comparison';$('cc-received-view').hidden=mode==='comparison';$('cc-show-comparison').setAttribute('aria-pressed',String(mode==='comparison'));$('cc-show-received').setAttribute('aria-pressed',String(mode==='received'));render();}
 $('cc-show-comparison').onclick=()=>setMode('comparison');$('cc-show-received').onclick=()=>setMode('received');
 $('cc-search').oninput=e=>{state.query=e.target.value;state.school='';state.page=1;render();renderSchools(true);};
 $('cc-search').onfocus=()=>{if(data)renderSchools(true);};$('cc-search').onclick=()=>{if(data)renderSchools(true);};$('cc-search').onblur=closeSchools;
 $('cc-search').onkeydown=e=>{if(!data)return;if(e.key==='Escape'){closeSchools();return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if($('cc-school-options').hidden)renderSchools(true);if(!schoolOptions.length)return;markSchool(Math.max(0,Math.min(schoolOptions.length-1,activeSchool<0?(e.key==='ArrowDown'?0:schoolOptions.length-1):activeSchool+(e.key==='ArrowDown'?1:-1))));}else if(e.key==='Enter'&&activeSchool>=0&&!$('cc-school-options').hidden){e.preventDefault();chooseSchool(schoolOptions[activeSchool].cie);}};
 $('cc-category').onchange=e=>{state.category=e.target.value;state.model='';state.page=1;render();};$('cc-model').onchange=e=>{state.model=e.target.value;state.page=1;render();};
 $('cc-reset').onclick=()=>{Object.assign(state,{query:'',school:'',category:'',model:'',page:1});$('cc-search').value='';closeSchools();reconciliation.reset();render();};
 $('cc-table-mode').onclick=()=>{state.detail=!state.detail;state.sort='name';state.direction=1;render();};$('cc-prev').onclick=()=>{state.page--;renderTable();};$('cc-next').onclick=()=>{state.page++;renderTable();};$('cc-export').onclick=exportRows;
 try{const response=await fetch('centralized-data.json',{cache:'no-store'});if(!response.ok)throw Error();const initial=await response.json();if(!data)setData(initial);}catch{$('cc-notice').textContent='Consultando a aba Centralizados NOVO…';$('cc-notice').hidden=false;}
 const activate=()=>{if(location.hash==='#centralizados'&&(data?.refreshing||Date.now()-lastLoaded>60000))load();};window.addEventListener('hashchange',activate);document.querySelector('a[data-view="centralizados"]')?.addEventListener('click',activate);document.addEventListener('visibilitychange',()=>{if(!document.hidden)activate();});activate();
}
init().catch(error=>console.warn('Centralizados:',error.message));
