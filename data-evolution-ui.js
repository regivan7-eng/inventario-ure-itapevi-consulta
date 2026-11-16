import {installIdentityReview,renderIdentityReview} from './identity-review-ui.js';
import {summarizeEvolution} from './data-evolution.js';
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const fmt=v=>new Intl.NumberFormat('pt-BR').format(v||0),delta=v=>(v>0?'+':'')+fmt(v);
const date=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Não informada';
let state={},panel,banner,rows,search,filter,count,connectionText,retry;
let tableSequence=0;
const freshnessSort={key:'school',direction:1};
function table(headers,data,kind='summary'){
 const wrap=node('div',undefined,'evolution-table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',headers.join(', '));wrap.classList.add('updates-table-'+kind);
 const t=node('table',undefined,'premium-table'),head=node('thead'),hr=node('tr'),body=node('tbody');
 const sortHeaders=[];
 headers.forEach((h,i)=>{const th=node('th');th.scope='col';
  const key=kind==='freshness'?(i===0?'school':(i===2?'published':null)):null;
  if(key){const button=node('button');button.type='button';button.setAttribute('data-freshness-sort',key);button.addEventListener('click',()=>{
   freshnessSort.direction=freshnessSort.key===key?-freshnessSort.direction:(key==='published'?-1:1);freshnessSort.key=key;renderBody();updateSortHeaders();
  });th.append(button);sortHeaders.push({th,button,key,label:h});}else th.textContent=h;hr.append(th);
 });head.append(hr);
 function updateSortHeaders(){sortHeaders.forEach(({th,button,key,label})=>{
  const active=freshnessSort.key===key;
  button.textContent=label+' '+(active?(freshnessSort.direction===1?'↑':'↓'):'↕');
  th.setAttribute('aria-sort',active?(freshnessSort.direction===1?'ascending':'descending'):'none');
  button.setAttribute('aria-label',key==='school'?'Ordenar escolas de '+(active&&freshnessSort.direction===1?'Z a A':'A a Z'):'Ordenar por publicação '+(active&&freshnessSort.direction===-1?'mais antiga':'mais recente'));
 });}
 updateSortHeaders();
 let expanded=false;
 function renderBody(){body.replaceChildren();const ordered=kind==='freshness'?[...data].sort((a,b)=>{
  const names=()=>String(a[0]).localeCompare(String(b[0]),'pt-BR',{sensitivity:'base',numeric:true});
  if(freshnessSort.key==='school')return freshnessSort.direction*names();
  const at=a.publishedAt,bt=b.publishedAt;
  if(at===null||bt===null)return at===bt?names():(at===null?1:-1);
  return freshnessSort.direction*(at-bt)||names();
 }):data;for(const values of (expanded?ordered:ordered.slice(0,12))){const tr=node('tr');values.forEach((v,i)=>{const cell=node(i===0?'th':'td',kind==='freshness'&&i===2?undefined:String(v));if(kind==='freshness'&&i===2){cell.className='publication-cell';const author=node('strong',v.publisher);if(v.email)author.title=v.email;cell.append(author,node('small',v.date));}if(i===0)cell.scope='row';tr.append(cell);});body.append(tr);}}
 renderBody();t.append(head,body);wrap.append(t);
 if(data.length<=12)return wrap;
 const container=node('div',undefined,'expandable-table'),button=node('button',undefined,'ghost-btn list-expand');
 body.id='updates-rows-'+(++tableSequence);button.type='button';button.setAttribute('aria-controls',body.id);
 function label(){button.textContent=expanded?'Mostrar menos':((kind==='freshness'||kind==='schools')?'Ver todas as escolas':'Ver todos os itens')+' ('+fmt(data.length)+')';button.setAttribute('aria-expanded',String(expanded));}
 label();button.addEventListener('click',()=>{expanded=!expanded;renderBody();label();});
 container.append(wrap,button);return container;
}
function init(){
 if(panel)return;
 installIdentityReview();
 const css=document.createElement('link');css.rel='stylesheet';css.href='/data-evolution.css';document.head.append(css);
 banner=node('section',undefined,'data-connection');banner.id='data-connection';banner.setAttribute('aria-label','Origem dos dados');connectionText=node('p');connectionText.setAttribute('role','status');retry=node('button','Tentar reconectar','ghost-btn');retry.type='button';retry.addEventListener('click',()=>state.onRetry?.());banner.append(connectionText,retry);
 const filters=document.querySelector('main .filters')||document.getElementById('view-overview');filters.before(banner);
 const details=node('details'),toggle=node('summary','Consultar escolas');details.append(toggle);
 const tools=node('div',undefined,'evolution-tools'),label=node('label','Buscar escola ou CIE');search=node('input');search.type='search';search.placeholder='Nome ou CIE';search.id='freshness-search';label.htmlFor=search.id;const filterLabel=node('label','Registro de importação');filter=node('select');filter.id='freshness-filter';filterLabel.htmlFor=filter.id;for(const [value,text] of [['all','Todas'],['known','Com registro'],['unknown','Sem registro']]){const option=node('option',text);option.value=value;filter.append(option);}tools.append(label,search,filterLabel,filter);count=node('p');count.setAttribute('role','status');rows=node('div');details.append(rows);
 const overview=document.getElementById('view-overview'),history=document.getElementById('history-content')?.closest('section');
 const section=node('section',undefined,'panel updates-section');section.id='base-updates';panel=section;section.setAttribute('aria-labelledby','base-updates-title');
 const heading=node('header',undefined,'updates-heading'),headingTitle=node('h2','Atualizações da base');headingTitle.id='base-updates-title';heading.append(headingTitle,node('p','Importações por escola e comparação das duas últimas versões. Rede completa, independentemente dos filtros.','panel-subtitle'));
 const lookup=node('section',undefined,'updates-block updates-lookup');lookup.setAttribute('aria-labelledby','school-lookup-title');const lookupHead=node('div',undefined,'panel-head'),lookupTitle=node('h3','Consulta por escola');lookupTitle.id='school-lookup-title';lookupHead.append(lookupTitle);lookup.append(lookupHead,tools,count,details);
 const layout=node('div',undefined,'updates-layout');layout.append(lookup);
 if(history){history.classList.remove('panel');history.classList.add('updates-block');history.querySelector('.section-kicker')?.remove();const oldTitle=history.querySelector('h2');if(oldTitle)oldTitle.replaceWith(node('h3','Comparação de versões'));history.querySelector('.panel-subtitle')?.remove();layout.append(history);const content=document.getElementById('history-content');if(content)content.textContent='Clique em Comparar versões para consultar as alterações.';}
 const help=node('details',undefined,'updates-help');help.append(node('summary','Como interpretar'),node('p','A importação registra o envio ao sistema; não comprova a data da conferência física. Datas e autoria anteriores a este recurso não são presumidas. Horários de Brasília.'),node('p','A comparação mostra totais agregados da rede. Não identifica equipamentos adicionados ou removidos, nem comprova movimentação física; alterações podem se compensar nos totais. Categorias seguem a origem; em atenção = danificado, em manutenção ou inservível.'));
 section.append(heading,layout,help);overview.append(section);
 search.addEventListener('input',()=>{details.open=true;renderRows();});filter.addEventListener('change',()=>{details.open=true;renderRows();});
}
function renderRows(){
 rows.replaceChildren();const query=search.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const schools=summarizeEvolution(state.dataset).schools.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 const selected=schools.filter(s=>{const known=!!state.dataset?.schoolImports?.[s.cie]?.at;return (filter.value==='all'||(filter.value==='known'?known:!known))&&(s.name+' '+s.cie).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query);});
 count.textContent=fmt(selected.length)+' de '+fmt(schools.length)+' escolas';
 if(!selected.length){rows.append(node('p','Nenhuma escola encontrada.'));return;}
 rows.append(table(['Escola','Registros','Última publicação'],selected.map(s=>{const info=state.dataset?.schoolImports?.[s.cie];const values=[s.name,fmt(s.records),{publisher:info?.at?(info.name||info.email||'Não informado'):'Não informado',email:info?.email||'',date:info?.at?date(info.at):'Sem registro de importação'}];const timestamp=Date.parse(info?.at);values.publishedAt=Number.isFinite(timestamp)?timestamp:null;return values;}),'freshness'));
}
export function showDataState(next){
 init();state={...state,...next};banner.dataset.state=state.kind;renderIdentityReview(state.dataset);
 const central=state.kind==='central',loading=state.kind==='loading';banner.hidden=central||loading;banner.style.display=central||loading?'none':'';retry.hidden=central;retry.disabled=loading;
 connectionText.textContent=central?'Base central conectada · publicação em '+date(state.updatedAt)+'. As escolas podem ter datas de importação diferentes.':loading?'Consultando a base central…':'Cópia inicial em exibição · '+(state.kind==='empty'?'ainda não há uma publicação central.':'não foi possível consultar a base central. Os números podem estar desatualizados.');
 renderRows();
}
export async function showComparison(target){
 target.replaceChildren(node('p','Consultando as duas versões publicadas…','updates-empty'));
 try{
  const response=await fetch('/api/data?comparison=latest',{cache:'no-store'}),result=await response.json();if(!response.ok)throw Error(result.error||'Histórico indisponível.');
  target.replaceChildren();if(!result.comparison){target.append(node('p','Ainda não há duas versões publicadas para comparar.','updates-empty'));return;}
  const c=result.comparison,dates=node('div',undefined,'updates-dates');dates.append(node('span','Anterior: '+date(result.previousAt)),node('span','Atual: '+date(result.updatedAt)));target.append(dates);
  if(state.updatedAt&&state.updatedAt!==result.updatedAt)target.append(node('p','Há uma publicação mais recente na base central. Recarregue o painel para atualizar os demais indicadores.','evolution-warning'));
  const unchanged=['records','schoolCount','available','attention'].every(key=>c.before[key]===c.after[key])&&!c.schools.length&&!c.categories.length;
  if(unchanged)target.append(node('p','Sem variação nos indicadores comparados.','updates-empty'));
  const metrics=node('div',undefined,'updates-comparison-cards');
  for(const [label,key] of [['Registros','records'],['Escolas / CIEs','schoolCount'],['Disponíveis','available'],['Em atenção','attention']]){
   const card=node('article',undefined,'updates-comparison-card'),title=node('h4',label),current=node('div',undefined,'updates-card-current'),previous=node('div',undefined,'updates-card-previous'),change=node('div',undefined,'updates-card-change');
   current.append(node('span','Atual'),node('strong',fmt(c.after[key])));previous.append(node('span','Anterior'),node('span',fmt(c.before[key])));change.append(node('span','Variação'),node('strong',delta(c.after[key]-c.before[key])));card.append(title,current,previous,change);metrics.append(card);
  }target.append(metrics);
  if(c.schools.length){const schools=node('details');schools.append(node('summary','Variações por escola · '+fmt(c.schools.length)),table(['Escola / CIE','Anterior','Atual','Registros Δ','Disponíveis Δ','Em atenção Δ','Situação'],c.schools.map(s=>[s.name+' · '+s.cie,fmt(s.before),fmt(s.after),delta(s.delta),delta(s.availableDelta),delta(s.attentionDelta),s.kind]),'schools'));target.append(schools);}
  if(c.categories.length){const categories=node('details');categories.append(node('summary','Variações por categoria · '+fmt(c.categories.length)),table(['Categoria de origem','Anterior','Atual','Variação'],c.categories.map(s=>[s.name,fmt(s.before),fmt(s.after),delta(s.delta)]),'categories'));target.append(categories);}
 }catch(error){target.replaceChildren(node('p','Não foi possível comparar as versões. '+error.message,'updates-empty'));}
}
