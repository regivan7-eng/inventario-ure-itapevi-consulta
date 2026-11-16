import {selectCentralizedComparison} from './centralized-comparison.js';
import {GROUPS} from './centralized-model.js';

const fmt=value=>Number(value||0).toLocaleString('pt-BR');
const pct=value=>value===null?'—':(value*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const modelLabel=column=>column?.key==='c5'?'Chromebook Samsung Go + Samsung 4':column?.model&&column.model!=='-'?column.model:column?.label||'';
const statuses={'no-inventory':'Sem Inventário',mixed:'Saldos em ambos os sentidos',pending:'A conciliar',excess:'Acima do recebido',balanced:'Quantidades alinhadas','no-receipts':'Sem recebidos no recorte'};
const date=value=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Data não informada';
const shortDate=value=>value?new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Data não informada';
const categoryIcons={
 desktop:'<rect x="3" y="4" width="18" height="13" rx="1.6"/><path d="M8 21h8m-4-4v4"/>',
 notebook:'<rect x="5" y="3.5" width="14" height="12" rx="1.4"/><path d="M2.5 19h19l-1.5 2H4z"/>',
 tablet:'<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M10 18.5h4"/>',
 tv:'<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="m8 2 4 2 4-2m-4 15v4m-4 0h8"/>',
 educatron:'<rect x="3" y="3.5" width="18" height="12" rx="1.5"/><path d="M8 20h8m-4-4v4m-6-9 3-3 3 2 4-4"/>',
 charging:'<path d="M3 6h2l2 10h11l2-7H6"/><path d="m13 7-2 3h3l-2 3"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>'
};
const icon=key=>`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${categoryIcons[key]||categoryIcons.desktop}</svg>`;
const documentCheckIcon='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1-1.5Z"/><path d="M14 3.5V8h4M8.5 13.5h3m-3 3h2m2.5 1 1.5 1.5 3-3"/></svg>';

export function mountReconciliation(host,{onSchool,onCategory,onFilter=()=>{}}){
 let source,comparison,filters,summary,error='',status='all',sort='pending',direction=-1,page=1,expanded='';
 const expandedCategories=new Set();
 const size=15;
 host.innerHTML='<p class="cc-comparison-message" role="status">Consultando o Inventário publicado para cruzar as bases…</p>';

 function schoolRows(){
  return (summary?.schools||[])
   .filter(row=>status==='all'||status==='pending'&&row.pending>0||status==='excess'&&row.excess>0||status==='no-inventory'&&!row.hasInventory||status==='balanced'&&row.status==='balanced')
   .sort((a,b)=>direction*(sort==='name'?a.name.localeCompare(b.name,'pt-BR'):Number(a[sort]??-1)-Number(b[sort]??-1))||a.name.localeCompare(b.name,'pt-BR'));
 }
 function metric(label,value,note,kind=''){
  const symbol=kind.includes('received')?documentCheckIcon:kind.includes('difference')?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h15m0 0-4-4m4 4-4 4M20 17H5m0 0 4-4m-4 4 4 4"/></svg>':icon('desktop');
  return `<article class="cc-compare-metric ${kind}"><i class="cc-compare-metric-icon">${symbol}</i><div><span>${esc(label)}</span><strong>${value}</strong><small>${esc(note)}</small></div></article>`;
 }
 function signed(value){return value>0?'+'+fmt(value):value<0?fmt(value):'0';}
 function composition(categories,total){
  let offset=0;
  const rings=categories.map(category=>{
   const color=GROUPS.find(group=>group.key===category.key)?.color||'#9aabba';
   const share=total?category.registered/total*100:0;
   const ring=category.registered?`<circle cx="82" cy="82" r="60" fill="none" stroke="${color}" stroke-width="20" pathLength="100" stroke-dasharray="${share} ${100-share}" stroke-dashoffset="${-offset}" transform="rotate(-90 82 82)"><title>${esc(category.label)}: ${fmt(category.registered)}</title></circle>`:'';
   offset+=share;return ring;
  }).join('');
  const legend=categories.map(category=>{
   const color=GROUPS.find(group=>group.key===category.key)?.color||'#9aabba';
   return `<button type="button" data-category="${esc(category.key)}" aria-pressed="${filters.category===category.key}"><i style="--cc-color:${color}"></i><span>${esc(summary.model?modelLabel(summary.model):category.label)}</span><strong>${fmt(category.registered)}</strong><small>${total?pct(category.registered/total):'0%'}</small></button>`;
  }).join('');
  return `<div class="cc-donut"><svg viewBox="0 0 164 164" role="img" aria-label="Distribuição de ${fmt(total)} equipamentos inventariados">${total?'<circle cx="82" cy="82" r="60" fill="none" stroke="#e8eef3" stroke-width="20"/>':''}${rings}</svg><div><strong>${fmt(total)}</strong><small>inventariados</small></div></div><div class="cc-legend">${legend||'<p class="cc-empty">Sem categorias neste recorte.</p>'}</div>`;
 }
 function footerMessage(){
  const difference=summary.totals.received-summary.totals.registered;
  const school=filters.school?summary.schools.find(row=>row.cie===filters.school):null;
  const target=school?'Nesta escola':'Neste recorte';
  const main=difference>0?`${target}: ${fmt(difference)} ${difference===1?'equipamento enviado':'equipamentos enviados'} pela SEDUC sem correspondência no Inventário.`:difference<0?`${target}: há ${fmt(Math.abs(difference))} registro(s) a mais no Inventário do que equipamentos enviados pela SEDUC.`:'Os totais de recebidos e inventariados estão alinhados neste recorte.';
  const caveat=`Há ${fmt(summary.totals.pending)} item(ns) a conciliar e ${fmt(summary.totals.excess)} acima do recebido, apurados por escola e categoria. A diferença é quantitativa e não comprova extravio.`;
  return `<section class="cc-reconcile-footer"><div class="cc-footer-message"><span class="cc-footer-info" aria-hidden="true">i</span><div><strong>${esc(main)}</strong><p>${esc(caveat)}</p></div></div><div class="cc-footer-dates">${documentCheckIcon}<div><strong>Inventário atualizado</strong><small>${esc(shortDate(comparison.inventoryUpdatedAt))}</small><strong>Recebidos consultados</strong><small>${esc(shortDate(comparison.sourceModified))}</small></div></div></section>`;
 }
 function draw(){
  if(!source||!comparison){host.innerHTML=`<p class="cc-notice" role="status">${esc(error||'Consultando o Inventário publicado para cruzar as bases…')}</p>`;return;}
  summary=selectCentralizedComparison(comparison,source,filters);
  const totals=summary.totals,selected=schoolRows(),pages=Math.max(1,Math.ceil(selected.length/size));
  page=Math.min(page,pages);
  const shown=selected.slice((page-1)*size,page*size),difference=totals.registered-totals.received;
  const modelNote=summary.model?`Modelo: ${modelLabel(summary.model)}`:'Modelos com recebimento registrado na escola';
  const categories=summary.categories;
  function categoryBreakdown(category,columns){
   const selectedCies=new Set(summary.schools.map(row=>row.cie));
   const schools=comparison.schools.filter(row=>selectedCies.has(row.cie));
   const details=columns.flatMap(column=>{
    let received=0,registered=0;
    const receivingSchools=schools.filter(school=>Number(school.receivedModels[column.key]||0)>0);
    for(const school of receivingSchools){received+=Number(school.receivedModels[column.key]||0);registered+=Number(school.inventory?.models[column.key]||0);}
    if(received<=0)return [];
    if(column.key==='c5'){
     const samsungGo=receivingSchools.reduce((n,school)=>n+Number(school.inventory?.modelVariants?.samsungGo||0),0);
     const samsung4=receivingSchools.reduce((n,school)=>n+Number(school.inventory?.modelVariants?.samsung4||0),0);
     const models=[{label:'Samsung Go',received,registered:samsungGo,sharedRegistered:samsungGo+samsung4,rowspan:2},{label:'Samsung 4',registered:samsung4,continuation:true}];
     return models;
    }
    return [{label:modelLabel(column),received,registered}];
   });
   return details;
  }
  const categoryRows=categories.map(category=>{
   const gap=category.registered-category.received,directionName=gap<0?'negative':gap>0?'positive':'balanced';
   const amount=gap>0?'+'+fmt(gap):fmt(gap);
   const label=summary.model?modelLabel(summary.model):category.label;
   const group=GROUPS.find(item=>item.key===category.key);
   const color=group?.color||'#9aabba';
   const modelColumns=!summary.model&&group?source.columns.filter(column=>group.columns.includes(column.index)):[];
   const details=modelColumns.length?categoryBreakdown(category,modelColumns):[];
   const canExpand=details.length>0,isExpanded=expandedCategories.has(category.key);
   const toggle=canExpand
    ?'<button type="button" class="cc-category-expand" data-expand-category="'+esc(category.key)+'" aria-label="'+(isExpanded?'Recolher':'Expandir')+' '+esc(category.label)+'" aria-expanded="'+isExpanded+'" aria-controls="cc-category-details-'+esc(category.key)+'"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m5.5 3 5 5-5 5"/></svg></button>'
    :'<span class="cc-category-expand-spacer" aria-hidden="true"></span>';
   const parent='<tbody class="cc-category-group"><tr><th scope="row"><div class="cc-category-cell">'+toggle+'<button type="button" class="cc-category-select" data-category="'+esc(category.key)+'" aria-pressed="'+(filters.category===category.key)+'"><i style="--cc-color:'+color+'">'+icon(category.key)+'</i><span>'+esc(label)+'</span></button></div></th><td>'+fmt(category.registered)+'</td><td>'+fmt(category.received)+'</td><td><span class="cc-difference cc-difference-'+directionName+'" aria-label="Diferença '+amount+'"><i aria-hidden="true">'+(gap<0?'▼':gap>0?'▲':'—')+'</i><strong>'+amount+'</strong></span></td></tr></tbody>';
   if(!canExpand)return parent;
   const children='<tbody class="cc-category-children" id="cc-category-details-'+esc(category.key)+'" '+(isExpanded?'':'hidden')+'>'+details.map(detail=>{
    const row='<tr class="cc-category-child-row"><th scope="row"><span>'+esc(detail.label)+'</span></th><td>'+fmt(detail.registered)+'</td>';
    if(detail.continuation)return row+'</tr>';
    const difference=(detail.sharedRegistered??detail.registered)-detail.received;
    const kind=difference<0?'negative':difference>0?'positive':'balanced',value=signed(difference),indicator=difference<0?'▼':difference>0?'▲':'—';
    const shared=detail.rowspan?' rowspan="'+detail.rowspan+'" style="vertical-align:middle"':'';
    const receiptLabel=detail.rowspan?'Recebidos de Chromebooks Samsung Go e Samsung 4: '+fmt(detail.received):'Recebidos: '+fmt(detail.received);
    const differenceLabel=detail.rowspan?'Diferença dos dois modelos: '+fmt(detail.sharedRegistered)+' menos '+fmt(detail.received)+' = '+value:'Diferença '+value;
    return row+'<td'+shared+' aria-label="'+receiptLabel+'">'+fmt(detail.received)+(detail.rowspan?'<small style="display:block;font-size:9px;font-weight:400">Go + 4</small>':'')+'</td><td'+shared+'><span class="cc-difference cc-difference-'+kind+'" aria-label="'+differenceLabel+'"><i aria-hidden="true">'+indicator+'</i><strong>'+value+'</strong></span></td></tr>';
   }).join('')+'</tbody>';
   return parent+children;
  }).join('');
  const diagnostics=[`${fmt(totals.noInventory)} escola(s) sem base no Inventário`,`${fmt(totals.duplicates)} série(s) repetida(s) nas categorias selecionadas`,`${fmt(totals.missingSerial)} registro(s) sem série identificável`];
  host.innerHTML=`${error?`<p class="cc-notice" role="status">${esc(error)} Comparação anterior mantida; confira as datas no resumo.</p>`:''}
   <section class="cc-compare-kpis" aria-label="Indicadores do comparativo">
    ${metric('Total de equipamentos inventariados',fmt(totals.registered),modelNote,'cc-metric-inventory')}
    ${metric('Total de equipamentos recebidos pela SE',fmt(totals.received),'Planilha Centralizados NOVO','cc-metric-received')}
    ${metric('Saldo: inventariados − recebidos',signed(difference),'Inventariados menos recebidos · negativo indica quantidade abaixo do recebido',`cc-metric-difference ${difference<0?'is-negative':difference>0?'is-positive':'is-balanced'}`)}
   </section>
   <div class="cc-compare-secondary" aria-label="Métricas de conciliação">
    <div><span>Cobertura quantitativa</span><strong>${pct(totals.coverage)}</strong></div>
    <div><span>A conciliar</span><strong class="cc-secondary-pending">${fmt(totals.pending)}</strong></div>
    <div><span>Acima do recebido</span><strong class="cc-secondary-excess">${fmt(totals.excess)}</strong></div>
    <div><span>Escolas no recorte</span><strong>${fmt(totals.schools)}</strong></div>
   </div>
   <div class="cc-reconcile-overview">
    <section class="cc-panel cc-category-panel"><header><div><h3>Recebidos × inventariados por categoria</h3><p>Clique em uma categoria para filtrar o recorte. Diferença = inventariados − recebidos pela SEDUC.</p></div><div class="cc-difference-key"><span class="cc-key-less">▼ abaixo</span><span class="cc-key-more">▲ acima</span><span>— alinhado</span></div></header><div class="cc-table-scroll" role="region" aria-label="Comparativo por categoria" tabindex="0"><table class="cc-category-table"><thead><tr><th scope="col">Categoria</th><th scope="col">Inventariados</th><th scope="col">Recebidos pela SE</th><th scope="col">Diferença</th></tr></thead>${categoryRows||'<tbody><tr><td colspan="4" class="cc-empty">Nenhuma categoria neste recorte.</td></tr></tbody>'}<tfoot><tr><th scope="row">Total do recorte</th><td>${fmt(totals.registered)}</td><td>${fmt(totals.received)}</td><td><span class="cc-difference cc-difference-${difference<0?'negative':difference>0?'positive':'balanced'}"><i aria-hidden="true">${difference<0?'▼':difference>0?'▲':'—'}</i><strong>${signed(difference)}</strong></span></td></tr></tfoot></table></div><div class="cc-compare-quality">${diagnostics.map(item=>`<span>${esc(item)}</span>`).join('')}</div></section>
    <section class="cc-panel cc-inventory-composition"><header><h3>Distribuição dos equipamentos inventariados</h3><p>Participação por categoria no recorte selecionado.</p></header><div class="cc-composition">${composition(categories,totals.registered)}</div></section>
   </div>
   <section class="cc-panel cc-comparison-table"><header><div><h3>Conciliação por escola</h3><p>As diferenças são calculadas em cada escola e categoria; excedentes de uma escola não cobrem pendências de outra.</p></div><label class="cc-status-filter">Exibir<select id="cc-reconcile-status"><option value="all">Todas as escolas</option><option value="pending">Com saldo a conciliar</option><option value="excess">Acima do recebido</option><option value="no-inventory">Sem base no Inventário</option><option value="balanced">Quantidades alinhadas</option></select></label></header><div class="cc-table-scroll" role="region" aria-label="Comparação entre recebidos e Inventário por escola" tabindex="0"><table class="cc-reconcile-table"><thead><tr>${[['name','Escola / CIE'],['received','Recebidos'],['registered','Inventariados'],['coverage','Cobertura'],['pending','A conciliar'],['excess','Acima do recebido']].map(([key,label])=>`<th scope="col" aria-sort="${sort===key?(direction===1?'ascending':'descending'):'none'}"><button type="button" data-order="${key}">${label}${sort===key?(direction===1?' ↑':' ↓'):''}</button></th>`).join('')}<th scope="col">Situação</th><th scope="col">Conferência</th></tr></thead><tbody>${shown.map(row=>`<tr><th scope="row">${esc(row.name)}<small>CIE ${row.cie}</small></th><td>${fmt(row.received)}</td><td>${row.hasInventory?fmt(row.registered):'—'}</td><td><span class="cc-coverage">${pct(row.coverage)}</span></td><td class="cc-pending-value">${fmt(row.pending)}</td><td>${fmt(row.excess)}</td><td><span class="cc-status cc-status-${row.status}">${statuses[row.status]}</span></td><td><button type="button" class="cc-detail-button" data-detail="${row.cie}" aria-expanded="${expanded===row.cie}">${expanded===row.cie?'Fechar':'Detalhes'}</button></td></tr>${expanded===row.cie?detailRow(row):''}`).join('')||'<tr><td colspan="8" class="cc-empty">Nenhuma escola neste recorte.</td></tr>'}</tbody><tfoot><tr><th scope="row">Total do recorte filtrado</th><td>${fmt(selected.reduce((n,row)=>n+row.received,0))}</td><td>${fmt(selected.reduce((n,row)=>n+row.registered,0))}</td><td>—</td><td>${fmt(selected.reduce((n,row)=>n+row.pending,0))}</td><td>${fmt(selected.reduce((n,row)=>n+row.excess,0))}</td><td colspan="2">${fmt(selected.length)} escola(s)</td></tr></tfoot></table></div><div class="cc-pagination"><button type="button" class="ghost-btn" id="cc-reconcile-prev" ${page===1?'disabled':''}>Anterior</button><span>${selected.length?(page-1)*size+1:0}–${Math.min(page*size,selected.length)} de ${fmt(selected.length)} · Página ${page} de ${pages}</span><button type="button" class="ghost-btn" id="cc-reconcile-next" ${page===pages?'disabled':''}>Próxima</button></div></section>
   <details class="cc-methodology"><summary>Critérios, qualidade e referência das bases</summary><div><h4>Como interpretar a coluna Situação</h4><p>A situação resume a comparação por categoria em cada escola, respeitando os filtros. Quando um modelo é selecionado, considera esse modelo. Faltas e excedentes de categorias diferentes não se compensam.</p><p><strong>A conciliar:</strong> há menos inventariados que recebidos em pelo menos uma categoria, sem excedentes nas demais categorias comparadas. Confira os registros pendentes de inclusão, as classificações e as movimentações dos equipamentos.</p><p><strong>Acima do recebido:</strong> há mais inventariados que recebidos em pelo menos uma categoria, sem faltas nas demais. Confira a classificação, possíveis duplicidades e movimentações ou recebimentos ainda não registrados na base Centralizados.</p><p><strong>Saldos em ambos os sentidos:</strong> a mesma escola tem menos inventariados em algumas categorias e mais em outras. Por exemplo, 10 a conciliar em notebooks e 2 acima do recebido em tablets permanecem como 10 e 2; o saldo líquido de −8 não elimina nenhuma das duas conferências. Clique em Detalhes para identificar as categorias.</p><p><strong>Quantidades alinhadas:</strong> os totais de recebidos e inventariados coincidem em todas as categorias comparadas, ou no modelo selecionado. Isso indica igualdade quantitativa; a conferência individual por patrimônio ou série continua sendo uma verificação distinta.</p><p><strong>Sem Inventário:</strong> não foi encontrado nenhum registro para o CIE da escola na base publicada. O inventariado aparece como “—”. Confira o CIE nas colunas de origem e a inclusão ou publicação da base da escola; o aviso não significa que a escola não possua equipamentos.</p><p>A conciliar = soma das faltas por categoria; Acima do recebido = soma dos excedentes por categoria. Diferença = inventariados − recebidos: negativa com seta para baixo, positiva com seta para cima e zero quando alinhada. Uma diferença quantitativa, por si só, não comprova extravio.</p><p>Recebidos: <strong>Centralizados NOVO</strong>, soma das seis categorias sem duplicar subtotais. A coluna Entregues tem escopo diferente e não é usada como denominador.</p><p>Inventariados: uma linha por registro, em todos os status. Cruzamento exclusivamente pelo CIE das colunas. Séries repetidas são sinalizadas; não há exclusão silenciosa de registros.</p><p>Cobertura = soma do menor valor entre recebido e inventariado, em cada escola e categoria, dividida pelos recebidos. A conciliação preserva faltas e excedentes por escola/categoria, sem compensação entre grupos. Se não há recebidos, a cobertura fica sem percentual.</p><p>A comparação inclui apenas modelos com recebidos maiores que zero na escola. Linhas sem recebimento ficam fora das tabelas, totais e indicadores deste menu.</p><p>Recorte atual: ${fmt(totals.unknown)} registro(s) sem categoria equivalente identificada, ${fmt(totals.outside)} de outras categorias ou legados e ${fmt(totals.missingSerial)} sem série identificável nas categorias comparadas. Qualidade por categoria, inclusive quando um modelo está selecionado.</p><p>Base completa: ${fmt(comparison.quality.invalidCie)} registro(s) sem CIE válido; ${fmt(comparison.quality.identityConflicts)} divergência(s) entre CIE original e campo consolidado (prevalece a coluna original). ${fmt(comparison.outsideSchools.length)} CIE(s) do Inventário não constam na planilha de recebidos${comparison.outsideSchools.length?': '+comparison.outsideSchools.map(row=>esc(row.name)+' · CIE '+row.cie+' ('+fmt(row.records)+' registros)').join('; '):''}.</p><p>Recebidos modificados em ${date(comparison.sourceModified)} · Inventário publicado em ${date(comparison.inventoryUpdatedAt)} · Comparação calculada em ${date(comparison.computedAt)}.</p><p>Equivalência de categorias: desktops, notebooks de sala de aula/básicos/avançados, tablets, TVs, Educatrons e plataformas de recarga. Legados, celulares, rede e nobreaks ficam fora. A seleção de modelo exige uma identificação explícita; textos genéricos e modelos diferentes não são presumidos equivalentes. As colunas de Educatrons e recarga não declaram um modelo específico: nesses casos, usa-se a categoria. A coluna TVs (LG) usa a marca identificada. Samsung Go e Samsung 4 são incluídos na categoria oficial de Chromebook; os recebidos não são discriminados por modelo.</p></div></details>
   ${footerMessage()}`;

  host.querySelector('#cc-reconcile-status').value=status;
  host.querySelector('#cc-reconcile-status').onchange=event=>{status=event.target.value;page=1;draw();onFilter();};
  host.querySelectorAll('[data-expand-category]').forEach(button=>button.onclick=()=>{const key=button.dataset.expandCategory;if(expandedCategories.has(key))expandedCategories.delete(key);else expandedCategories.add(key);draw();});
  host.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>onCategory(button.dataset.category));
  host.querySelectorAll('[data-school]').forEach(button=>button.onclick=()=>onSchool(button.dataset.school));
  host.querySelectorAll('[data-detail]').forEach(button=>button.onclick=()=>{expanded=expanded===button.dataset.detail?'':button.dataset.detail;draw();});
  host.querySelectorAll('[data-order]').forEach(button=>button.onclick=()=>{direction=sort===button.dataset.order?-direction:button.dataset.order==='name'?1:-1;sort=button.dataset.order;draw();});
  host.querySelectorAll('[data-group-filter]').forEach(button=>button.onclick=()=>onCategory(button.dataset.groupFilter));
  host.querySelector('#cc-reconcile-prev').onclick=()=>{page--;draw();};
  host.querySelector('#cc-reconcile-next').onclick=()=>{page++;draw();};
 }
 function detailRow(row){
  return `<tr class="cc-reconcile-detail"><td colspan="8"><div><strong>${esc(row.name)} · composição da diferença</strong><table><thead><tr><th>Categoria${summary.model?' / '+esc(modelLabel(summary.model)):''}</th><th>Recebidos</th><th>Inventariados</th><th>A conciliar</th><th>Acima do recebido</th></tr></thead><tbody>${row.categories.map(category=>`<tr><th>${esc(category.label)}</th><td>${fmt(category.received)}</td><td>${row.hasInventory?fmt(category.registered):'—'}</td><td>${fmt(category.pending)}</td><td>${fmt(category.excess)}</td></tr>`).join('')}</tbody></table><p>${row.hasInventory?`${fmt(row.duplicates)} registro(s) com série repetida e ${fmt(row.missingSerial)} sem série identificável nas categorias selecionadas. ${fmt(row.unmatched)} registro(s) sem modelo equivalente identificado.`:'O CIE não tem base no Inventário publicado. É necessário conferir a inclusão ou atualização da escola.'}</p></div></td></tr>`;
 }
 function exportBook(){
  if(!summary||!window.XLSX)return;
  const XLSX=window.XLSX,book=XLSX.utils.book_new(),selected=schoolRows();
  const rows=[['CIE','Escola','Recebidos','Inventariados','Cobertura quantitativa','Saldo a conciliar','Acima do recebido','Situação','Registros com série repetida (categorias)','Sem série (categorias)'],...selected.map(row=>[row.cie,row.name,row.received,row.hasInventory?row.registered:null,row.coverage,row.pending,row.excess,statuses[row.status],row.duplicates,row.missingSerial])];
  const categories=[['CIE','Escola','Categoria','Modelo selecionado','Recebidos','Inventariados','Saldo a conciliar','Acima do recebido'],...selected.flatMap(row=>row.categories.map(category=>[row.cie,row.name,category.label,modelLabel(summary.model),category.received,row.hasInventory?category.registered:null,category.pending,category.excess]))];
  const method=[['Campo','Valor'],['Origem recebidos','Centralizados NOVO'],['Recebidos modificados em',comparison.sourceModified],['Inventário publicado em',comparison.inventoryUpdatedAt],['Comparação calculada em',comparison.computedAt],['Busca',filters.query||''],['CIE',filters.school||'Todos'],['Categoria',filters.category||'Todas'],['Modelo',modelLabel(summary.model)||'Todos'],['Situação',status],['Contagem','Uma linha por registro, em todos os status, somente nos modelos com recebimento maior que zero na escola. Sem deduplicação silenciosa.'],['Cobertura','Soma de min(recebidos,inventariados) por escola/categoria / recebidos. Com modelo, usa o modelo.'],['Interpretação','A diferença líquida não substitui a conciliação por escola e categoria. Sem Inventário usa zero no cálculo e célula em branco na exportação.'],['Qualidade','Séries repetidas e ausentes são contadas nas categorias selecionadas.'],['Modelo','Somente identificação explícita; não se presume equivalência de textos genéricos.']];
  for(const [name,matrix]of [['Comparativo',rows],['Categorias',categories],['Critérios',method]]){const sheet=XLSX.utils.aoa_to_sheet(matrix);sheet['!cols']=matrix[0].map((_,index)=>({wch:index===1?50:24}));XLSX.utils.book_append_sheet(book,sheet,name);}
  XLSX.writeFile(book,'Centralizados_Recebidos_x_Inventario.xlsx');
 }
 return {
  update(nextSource,nextComparison,nextFilters){const changed=JSON.stringify(filters)!==JSON.stringify(nextFilters);source=nextSource;if(nextComparison)comparison=nextComparison;filters={...nextFilters};if(changed)page=1;draw();},
  setError(message){error=message;draw();},
  clearError(){error='';},
  isFiltered(){return status!=='all';},
  reset(){status='all';page=1;expanded='';},
  exportBook
 };
}
