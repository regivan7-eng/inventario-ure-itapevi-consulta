import {identityReviewRows,identityReviewDataset} from './inventory-update.js';
import {inventorySchools} from './inventory-schools.js';
import {displaySchoolName} from './school-display.js';
const make=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
let panel,summary,search,body,caption,previous,next,openButton,currentData,page=1,installed=false;
function scope(){return typeof filtered!=='undefined'?filtered:(currentData?.records||[]);}
function draw(){
 if(!panel)return;
 drawEmptySchools();
 const all=identityReviewDataset(currentData),selectedCies=new Set(scope().map(row=>String(row.cie))),selection=[...identityReviewRows(scope()).map(row=>({...row,treatment:'Completado no sistema'})),...all.filter(row=>row.treatment==='Linha residual não importada'&&selectedCies.has(row.cie))],query=String(search.value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const rows=selection.filter(row=>[row.name,row.cie,row.file,row.sheet,row.line,...row.fields.map(f=>f.field)].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query));
 summary.textContent=all.length?'Identificação a revisar · '+all.length+' linha(s) a conferir':'Identificação a revisar · nenhuma pendência registrada';
 openButton.hidden=!all.length;
 const pages=Math.max(1,Math.ceil(rows.length/15));page=Math.max(1,Math.min(page,pages));body.replaceChildren();
 for(const row of rows.slice((page-1)*15,page*15)){
  const tr=make('tr');
  for(const value of [displaySchoolName(row.name)+' · CIE '+row.cie,row.fields.map(f=>f.field+' ausente → '+f.value).join('; '),row.file,row.sheet,row.line??'Não registrada',row.treatment])tr.append(make('td',String(value)));
  body.append(tr);
 }
 if(!rows.length){const tr=make('tr'),td=make('td',all.length?'Nenhuma pendência neste recorte.':'Nenhuma pendência de identificação registrada nos dados carregados.');td.colSpan=6;tr.append(td);body.append(tr);}
 caption.textContent=rows.length+' registro(s) no recorte atual · '+all.length+' na base · página '+page+' de '+pages;
 previous.disabled=page===1;next.disabled=page===pages;
}
export function installIdentityReview(){
 if(installed)return;const quality=document.getElementById('view-quality');if(!quality)return;installed=true;
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./identity-review.css', import.meta.url).href;document.head.append(css);
 panel=make('section');panel.id='identity-review';panel.className='panel identity-review';
 const details=make('details');summary=make('summary','Identificação a revisar');details.append(summary);
 details.append(make('p','CIE e URE ausentes foram completados no sistema: CIE do nome do arquivo e URE Itapevi. Linhas residuais sem identificação não entram na contagem de equipamentos. Os arquivos originais não foram alterados. Revise as linhas abaixo e corrija as planilhas de origem; após reimportar os arquivos corrigidos, as pendências deixam de aparecer.'));
 const label=make('label','Buscar escola, CIE, arquivo ou aba');search=make('input');search.id='identity-review-search';search.type='search';search.placeholder='Nome, CIE, arquivo ou aba';label.htmlFor=search.id;details.append(label,search);
 caption=make('p');caption.setAttribute('role','status');details.append(caption);
 const wrap=make('div');wrap.className='identity-review-table';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Pendências de CIE e URE nas planilhas de origem');
 const table=make('table');table.className='premium-table';const head=make('thead'),header=make('tr');
 for(const text of ['Escola / CIE','Campo ausente / valor utilizado','Arquivo de origem','Aba','Linha','Tratamento']){const th=make('th',text);th.scope='col';header.append(th);}head.append(header);body=make('tbody');table.append(head,body);wrap.append(table);details.append(wrap);
 const actions=make('div');actions.className='identity-review-actions';previous=make('button','Anterior');next=make('button','Próxima');previous.type=next.type='button';previous.className=next.className='ghost-btn';
 previous.onclick=()=>{page--;draw();};next.onclick=()=>{page++;draw();};actions.append(previous,next);details.append(actions);panel.append(details);
 const existing=quality.querySelector('#quality-summary')?.closest('section,article')||quality.firstElementChild;if(existing)existing.after(panel);else quality.append(panel);
 openButton=make('button','Consultar pendências de CIE e URE');openButton.type='button';openButton.className='identity-review-link';openButton.onclick=()=>{details.open=true;panel.scrollIntoView({block:'start',behavior:'smooth'});search.focus();};panel.prepend(openButton);
 search.oninput=()=>{page=1;draw();};
 const original=window.renderQuality;if(typeof original==='function')window.renderQuality=function(...args){const result=original.apply(this,args);draw();return result;};
}
export function renderIdentityReview(dataset){installIdentityReview();currentData=dataset;draw();}
let emptySchoolsPanel;
function drawEmptySchools(){
 const quality=document.getElementById('view-quality');if(!quality)return;
 if(!emptySchoolsPanel){emptySchoolsPanel=make('section');emptySchoolsPanel.id='empty-school-review';emptySchoolsPanel.className='panel identity-review';quality.prepend(emptySchoolsPanel);}
 const all=inventorySchools(currentData).filter(s=>s.sem_dados).map(s=>({...s,name:displaySchoolName(s.name)})),cies=window.inventoryScopedSchoolCies?.();
 const rows=all.filter(s=>!cies||cies.includes(s.cie)).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 emptySchoolsPanel.hidden=!all.length;emptySchoolsPanel.replaceChildren();if(!all.length)return;
 const details=make('details');details.open=true;details.append(make('summary','Escolas sem dados · '+all.length+' pendência(s) na base'));
 details.append(make('p','A escola está cadastrada e entra no total de escolas, mas sua planilha não contém registros de equipamentos. Isso não confirma ausência de equipamentos físicos. Preencha as abas de inventário no arquivo de origem e sincronize novamente para resolver a pendência.'));
 const table=make('table');table.className='premium-table';const head=make('thead'),header=make('tr');for(const value of ['Escola / CIE','Arquivo de origem','Situação']){const th=make('th',value);th.scope='col';header.append(th);}head.append(header);const body=make('tbody');
 for(const row of rows){const tr=make('tr');for(const value of [row.name+' · CIE '+row.cie,row.files.join(' / '),'Sem dados de equipamentos · 0 registros'])tr.append(make('td',value));body.append(tr);}
 if(!rows.length){const tr=make('tr'),td=make('td','Nenhuma escola sem dados neste recorte.');td.colSpan=3;tr.append(td);body.append(tr);}
 table.append(head,body);const wrap=make('div');wrap.className='identity-review-table';wrap.append(table);details.append(wrap);emptySchoolsPanel.append(details);
}
