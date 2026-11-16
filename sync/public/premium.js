(() => {
  'use strict';
  const $p=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const num=v=>new Intl.NumberFormat('pt-BR').format(v);
  const percent=(n,d)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(d?n/d*100:0)+'%';
  const cmp=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true}).compare;
  const key=r=>String(r.cie||'').trim()||norm(r.unidade)||'sem-identificacao';
  const attention=r=>['danificado','em manutencao','inservivel'].includes(norm(r.status));
  const available=r=>norm(r.status)==='disponivel';
  const noEval=r=>['','-','na','n/a','nao informado','sem avaliacao','nao avaliado','sem informacao'].includes(norm(r.avaliacao));
  const serialKey=r=>norm(r.serial).replace(/\s+/g,'').toUpperCase();
  let historyRows,cacheRows,baseQuality,schools=[],rankMode='quantity',schoolId='',recordMode='all',recordPage=1,lastTrigger;
  const pageSize=10;
  function stats(rows) {
    return {total:rows.length,available:rows.filter(available).length,attention:rows.filter(attention).length,missing:rows.filter(r=>window.inventoryQuality.serialIssue(r.serial)).length,evaluation:rows.filter(noEval).length};
  }
  function refreshCache(){
    if(cacheRows===DATA.records)return;
    cacheRows=DATA.records;baseQuality=window.inventoryQuality.analyze(cacheRows,cacheRows);
    const map=new Map();
    cacheRows.forEach(r=>{const id=key(r);if(!map.has(id))map.set(id,{id,cie:r.cie,name:r.unidade||'Escola não identificada',rows:[]});map.get(id).rows.push(r);});
    for(const s of DATA.schools||[])if(s.sem_dados&&!map.has(s.cie))map.set(s.cie,{id:s.cie,cie:s.cie,name:s.name,rows:[]});
    schools=[...map.values()].sort((a,b)=>cmp(a.name,b.name)||cmp(a.cie||'',b.cie||''));
  }
  function duplicates(r){return !window.inventoryQuality.serialIssue(r.serial)&&(baseQuality.baseSerials.get(serialKey(r))?.length||0)>1;}
  function schoolButton(s,label=s.name){return '<button type="button" class="school-link" data-school-open="'+esc(s.id)+'">'+esc(label)+'</button>';}
  function metric(label,value,note){return '<article class="premium-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></article>';}
  const actions=document.createElement('div');actions.className='premium-tools';
  actions.innerHTML='<button type="button" class="ghost-btn" id="consultation-open" aria-haspopup="dialog" title="Consultar o inventário geral ou por escola; gerar PDF ou XLSX">Consulta &amp; Relatório</button>';
  document.querySelector('.top-actions').append(actions);
  const consultation=document.createElement('dialog');consultation.id='consultation-choice';consultation.className='school-sheet consultation-choice';consultation.setAttribute('aria-labelledby','consultation-title');
  consultation.innerHTML='<header class="school-sheet-head"><div><h2 id="consultation-title">Consulta &amp; Relatório</h2><p>Escolha o que deseja consultar.</p></div><button type="button" class="ghost-btn" id="consultation-close">Fechar</button></header><div class="consultation-options"><button type="button" id="report-print"><strong>Geral</strong><span>Relatório do inventário conforme os filtros atuais do painel.</span><small>Visualizar · PDF · XLSX</small></button><button type="button" id="school-open"><strong>Escola</strong><span>Selecione uma escola e consulte o inventário completo da unidade.</span><small>Consultar · PDF · XLSX</small></button></div>';
  document.body.append(consultation);
  $p('consultation-open').addEventListener('click',()=>consultation.showModal());
  $p('consultation-close').addEventListener('click',()=>consultation.close());
  consultation.addEventListener('close',()=>{if(!document.querySelector('dialog[open]'))$p('consultation-open').focus({preventScroll:true});});
  const executive=document.createElement('section');executive.className='panel executive-panel';executive.setAttribute('aria-labelledby','executive-title');
  executive.innerHTML='<div class="panel-head"><div><div class="section-kicker">LEITURA EXECUTIVA</div><h2 id="executive-title">O que merece sua atenção</h2><p class="panel-subtitle">Achados calculados para os filtros atuais, com acesso à evidência.</p></div></div><div id="executive-cards" class="executive-cards"></div>';
  document.querySelector('#view-overview .kpi-grid').after(executive);
  const directory=document.createElement('section');directory.className='panel school-directory';
  directory.innerHTML='<div class="panel-head"><div><h2>Consulta das unidades</h2><p class="panel-subtitle">Pesquise por nome ou CIE e consulte o inventário completo da unidade.</p></div></div><label for="school-directory-search" class="premium-label">Pesquisar escola ou CIE</label><input id="school-directory-search" type="search" class="qr-search" placeholder="Nome da escola ou CIE"><div id="school-directory-list" class="school-directory-list"></div><button type="button" class="ghost-btn" id="school-directory-more" hidden>Ver todas as escolas</button>';
  $p('view-categories').append(directory);

  let directoryExpanded=false;
  function fitDirectorySpace(){
    const list=$p('school-directory-list'),more=$p('school-directory-more');
    const items=[...list.children].filter(item=>item.tagName==='DIV');
    const wide=window.matchMedia('(min-width:2300px)').matches;
    const baseLimit=wide?24:12,desktop=window.matchMedia('(min-width:1280px)').matches;
    let limit=directoryExpanded?items.length:Math.min(baseLimit,items.length);
    items.forEach(item=>{item.hidden=false;});
    directory.style.minHeight='';
    directory.style.height='';
    directory.dataset.expanded=String(directoryExpanded);
    const targetHeight=desktop?$p('categories').getBoundingClientRect().height:0;
    if(desktop&&items.length>baseLimit&&targetHeight>0)directory.style.height=targetHeight+'px';
    if(!directoryExpanded&&desktop&&items.length>baseLimit){
      const peerHeight=$p('categories').getBoundingClientRect().height;
      if(peerHeight>0){
        more.hidden=false;
        const listRect=list.getBoundingClientRect(),panelRect=directory.getBoundingClientRect();
        const panelStyle=getComputedStyle(directory),listStyle=getComputedStyle(list),buttonStyle=getComputedStyle(more);
        const px=value=>parseFloat(value)||0;
        const budget=peerHeight-(listRect.top-panelRect.top)-px(panelStyle.paddingBottom)-px(panelStyle.borderBottomWidth)-px(listStyle.marginBottom)-more.getBoundingClientRect().height-px(buttonStyle.marginTop)-2;
        const columns=wide?2:1;
        limit=0;
        for(let index=0;index<items.length;index+=columns){
          const row=items.slice(index,index+columns);
          const bottom=Math.max(...row.map(item=>item.getBoundingClientRect().bottom))-listRect.top;
          if(bottom>budget)break;
          limit=index+row.length;
        }
        // Keep the expansion choice even when the available height fits every school.
        limit=Math.max(columns,Math.min(limit,items.length-1));

      }
    }
    items.forEach((item,index)=>{item.hidden=index>=limit;});
    more.hidden=items.length<=limit&&!directoryExpanded;
    more.textContent=directoryExpanded?'Mostrar menos':'Ver todas as escolas';
    more.setAttribute('aria-expanded',String(directoryExpanded));
    more.setAttribute('aria-controls','school-directory-list');
  }
  function renderDirectory(){
    const needle=norm($p('school-directory-search').value),ids=new Set(window.inventoryScopedSchoolCies?.()||filtered.map(key));
    const rows=schools.filter(s=>ids.has(s.id)&&norm(s.name+' '+s.cie).includes(needle));
    $p('school-directory-list').innerHTML=rows.map(s=>'<div>'+schoolButton(s)+'<small>CIE '+esc(s.cie||'não informado')+(s.rows.length?'':' · Sem dados de equipamentos')+'</small></div>').join('')||'<p class="empty">Nenhuma escola corresponde à seleção.</p>';
    fitDirectorySpace();
  }
  let directoryFitFrame;
  function scheduleDirectoryFit(){
    cancelAnimationFrame(directoryFitFrame);
    directoryFitFrame=requestAnimationFrame(()=>fitDirectorySpace());
  }
  if(typeof ResizeObserver!=='undefined'){
    const directorySizeObserver=new ResizeObserver(scheduleDirectoryFit);
    directorySizeObserver.observe($p('categories'));
    directorySizeObserver.observe($p('school-directory-search'));
  }
  window.addEventListener('resize',scheduleDirectoryFit);
  $p('school-directory-search').addEventListener('input',()=>{directoryExpanded=false;renderDirectory();});
  $p('school-directory-more').addEventListener('click',()=>{directoryExpanded=!directoryExpanded;fitDirectorySpace();});
  const compositionGrid=$p('category-chart').closest('.grid-2');compositionGrid.id='overview-composition-grid';compositionGrid.classList.add('overview-composition-grid');
  const frontQuality=document.createElement('article');frontQuality.className='panel front-quality-panel';frontQuality.setAttribute('aria-labelledby','front-quality-title');
  frontQuality.innerHTML='<div class="panel-head"><div><div class="section-kicker">CONFERÊNCIA CADASTRAL</div><h2 id="front-quality-title">Pendências cadastrais por frente</h2><p class="panel-subtitle">Quantidade e percentual de registros a revisar nos filtros atuais.</p></div></div><div id="front-quality-chart" role="group" aria-label="Registros com pendência por frente"></div><p class="front-quality-note">Serial ausente ou inválido, avaliação não informada ou serial repetido na base. Cada registro conta uma vez; repetição exige conferência.</p>';
  compositionGrid.append(frontQuality);
  let qualityModule;
  async function renderFrontQuality(){
    const rows=filtered,base=DATA.records;
    const {summarizeQualityFronts}=await (qualityModule??=import('./front-quality.js'));
    if(rows!==filtered||base!==DATA.records)return;
    const quality=window.inventoryQuality.analyze(base,rows),affected=new Set(Object.values(quality.groups).flatMap(groups=>groups.flatMap(group=>group.records)));
    const fronts=summarizeQualityFronts(rows,affected);
    $p('front-quality-chart').innerHTML=rows.length?fronts.map(front=>'<div class="front-quality-row"><div class="front-quality-label"><span>'+esc(front.label)+'</span><strong>'+percent(front.pending,front.total)+'</strong></div><div class="front-quality-track" role="img" aria-label="'+esc(front.label)+': '+num(front.pending)+' de '+num(front.total)+' registros com pendência, '+percent(front.pending,front.total)+'"><i style="width:'+front.rate*100+'%"></i></div><small>'+(front.total?num(front.pending)+' de '+num(front.total)+' registros':'Sem registros no recorte')+'</small></div>').join(''):'<p class="empty">Sem registros para os filtros selecionados.</p>';
  }
  const rankPanel=$p('oa-schools').closest('article');
  rankPanel.querySelector('h2').textContent='Escolas com equipamentos em atenção';
  rankPanel.querySelector('.panel-subtitle').textContent='Até 8 escolas. Atenção = danificado, em manutenção ou inservível.';
  rankPanel.querySelector('.oa-footnote').textContent='Percentual calculado sobre os equipamentos da própria escola no recorte atual.';
  const rankControl=document.createElement('div');rankControl.className='rank-switch';rankControl.setAttribute('role','group');rankControl.setAttribute('aria-label','Ordenação do ranking');
  rankControl.innerHTML='<button type="button" data-rank="quantity" aria-pressed="true">Quantidade</button><button type="button" data-rank="rate" aria-pressed="false">Percentual</button>';
  $p('oa-schools').before(rankControl);
  rankControl.addEventListener('click',e=>{const button=e.target.closest('[data-rank]');if(!button)return;rankMode=button.dataset.rank;renderPremium();});
  function renderRank(){
    const list=window.overviewAnalytics.summarize(filtered).schools.filter(s=>s.attention);
    list.sort((a,b)=>rankMode==='rate'?(b.attention/b.total-a.attention/a.total)||b.attention-a.attention||cmp(a.label,b.label):b.attention-a.attention||cmp(a.label,b.label));
    const leaders=list.slice(0,8),max=rankMode==='rate'?1:(leaders[0]?.attention||1);
    $p('oa-schools').innerHTML=leaders.map(s=>'<div class="oa-school-row"><div class="oa-school"><span>'+esc(s.label)+'</span><small>CIE '+esc(s.cie||'não informado')+' · '+num(s.total)+' equipamentos</small></div><div class="oa-track" role="img" aria-label="'+esc(s.label)+': '+num(s.attention)+' em atenção, '+percent(s.attention,s.total)+'"><i style="width:'+(rankMode==='rate'?s.attention/s.total:s.attention)/max*100+'%"></i></div><b>'+(rankMode==='rate'?percent(s.attention,s.total):num(s.attention))+'<small>'+(rankMode==='rate'?num(s.attention):percent(s.attention,s.total))+'</small></b></div>').join('')||'<p class="empty">Nenhum equipamento em atenção nesta seleção.</p>';
    rankControl.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.rank===rankMode)));
  }
  function topAttentionSchools(items,limit=3){
    return items.filter(s=>s.total>0&&s.attention>0).slice().sort((a,b)=>(b.attention/b.total-a.attention/a.total)||cmp(a.label,b.label)||cmp(String(a.cie||''),String(b.cie||''))).slice(0,limit);
  }
  function renderExecutive(){
    const rows=filtered,s=stats(rows),bySchool=window.overviewAnalytics.summarize(rows).schools,leaders=topAttentionSchools(bySchool);
    const affected=rows.filter(r=>window.inventoryQuality.serialIssue(r.serial)||noEval(r)||duplicates(r)).length;
    const repeat=window.inventoryQuality.analyze(DATA.records,rows).counts.duplicates;
    $p('executive-cards').innerHTML=[
      '<article><span class="executive-tag">OPERAÇÃO</span><h3>'+num(s.attention)+' equipamentos em atenção</h3><p>'+percent(s.attention,s.total)+' do recorte. Os estados são informados nas planilhas e exigem avaliação da equipe.</p><button type="button" data-executive="attention">Conferir os '+num(s.attention)+' registros →</button></article>',
      '<article class="executive-proportions"><span class="executive-tag">ATENÇÃO PROPORCIONAL</span><h3>Maiores percentuais por escola</h3><ol class="executive-school-leaders">'+leaders.map((school,i)=>'<li><span class="executive-position" aria-hidden="true">'+(i+1)+'</span><div><strong>'+esc(school.label)+'</strong><small>CIE '+esc(school.cie||'não informado')+' · '+num(school.attention)+' de '+num(school.total)+' equipamentos</small></div><b>'+percent(school.attention,school.total)+'</b></li>').join('')+'</ol>'+(leaders.length?'<p class="executive-method">Em atenção ÷ total da própria escola, nos filtros atuais. Bases pequenas podem elevar o percentual.</p>':'<p>Nenhum equipamento em atenção nos filtros atuais.</p>')+'</article>',
      '<article><span class="executive-tag">CONFIABILIDADE</span><h3>'+num(affected)+' registros para conferir</h3><p>Com identificação ausente, avaliação pendente ou serial repetido. '+num(repeat)+' seriais distintos repetidos; um registro pode ter mais de uma pendência.</p><button type="button" data-executive="quality">Consultar pendências →</button></article>'
    ].join('');
    $p('school-open').disabled=!schools.length;
  }
  const dialog=document.createElement('dialog');dialog.id='school-sheet';dialog.className='school-sheet';dialog.setAttribute('aria-labelledby','school-sheet-title');
  dialog.innerHTML='<header class="school-sheet-head"><div><h2 id="school-sheet-title"></h2><p id="school-sheet-context"></p></div><button type="button" class="ghost-btn" id="school-sheet-close">Fechar ficha</button></header><label for="school-sheet-select" class="premium-label">Mudar de escola — ordem alfabética</label><select id="school-sheet-select"></select><div id="school-sheet-content"></div>';
  document.body.append(dialog);
  const sheetBack=document.createElement('button');sheetBack.type='button';sheetBack.className='ghost-btn';sheetBack.id='school-sheet-back';sheetBack.textContent='Voltar';sheetBack.title='Voltar à seleção de escolas';
  $p('school-sheet-close').before(sheetBack);
  const schoolPicker=document.createElement('dialog');schoolPicker.id='school-picker';schoolPicker.className='school-sheet school-picker';schoolPicker.setAttribute('aria-labelledby','school-picker-title');
  schoolPicker.innerHTML='<header class="school-sheet-head"><div><h2 id="school-picker-title">Escolher escola</h2><p>Pesquise por nome ou CIE para consultar a unidade.</p></div><div class="premium-tools"><button type="button" class="ghost-btn" id="school-picker-back" title="Voltar às opções Geral e Escola">Voltar</button><button type="button" class="ghost-btn" id="school-picker-close">Fechar</button></div></header><label class="premium-label" for="school-picker-search">Pesquisar escola ou CIE</label><input type="search" class="qr-search" id="school-picker-search" placeholder="Nome da escola ou CIE"><div id="school-picker-list" class="school-picker-list"></div>';
  document.body.append(schoolPicker);
  schoolPicker.querySelector('header').append($p('school-picker-close'));
  function drawSchoolPicker(){const needle=norm($p('school-picker-search').value);$p('school-picker-list').innerHTML=schools.filter(s=>norm(s.name+' '+s.cie).includes(needle)).map(s=>'<button type="button" data-picker-school="'+esc(s.id)+'"><strong>'+esc(s.name)+'</strong><span>CIE '+esc(s.cie||'não informado')+'</span></button>').join('')||'<p class="empty">Nenhuma escola encontrada.</p>';}
  function chooseSchool(){refreshCache();drawSchoolPicker();schoolPicker.showModal();$p('school-picker-search').focus();}
  $p('school-picker-search').addEventListener('input',drawSchoolPicker);
  $p('school-picker-list').addEventListener('click',e=>{const b=e.target.closest('[data-picker-school]');if(!b)return;schoolPicker.close();openSchool(b.dataset.pickerSchool,$p('consultation-open'));});
  $p('school-picker-back').addEventListener('click',()=>{schoolPicker.close();consultation.showModal();$p('school-open').focus();});
  $p('school-picker-close').addEventListener('click',()=>schoolPicker.close());
  schoolPicker.addEventListener('close',()=>{if(!document.querySelector('dialog[open]'))$p('consultation-open').focus({preventScroll:true});});
  sheetBack.addEventListener('click',()=>{dialog.close();chooseSchool();});
  $p('school-sheet-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{if(!document.querySelector('dialog[open]'))lastTrigger?.focus({preventScroll:true});});
  $p('school-sheet-select').addEventListener('change',e=>{schoolId=e.target.value;recordPage=1;recordMode='all';renderSheet();});
  function openSchool(id,trigger){
    refreshCache();const school=schools.find(s=>s.id===id)||schools.find(s=>filtered.some(r=>key(r)===s.id))||schools[0];if(!school)return;
    schoolId=school.id;recordMode='all';recordPage=1;lastTrigger=trigger;
    $p('school-sheet-select').innerHTML=schools.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+' · CIE '+esc(s.cie||'não informado')+'</option>').join('');
    renderSheet();if(!dialog.open)dialog.showModal();
  }
  function getSheetRows(school){
    return school.rows.filter(r=>recordMode==='all'||recordMode==='attention'&&attention(r)||recordMode==='missing'&&window.inventoryQuality.serialIssue(r.serial)||recordMode==='evaluation'&&noEval(r)||recordMode==='duplicates'&&duplicates(r));
  }
  function renderSheet(){
    const school=schools.find(s=>s.id===schoolId);if(!school)return;
    $p('school-sheet-select').value=schoolId;
    $p('school-sheet-title').textContent=school.name;
    $p('school-sheet-context').textContent='CIE '+(school.cie||'não informado')+(school.rows.length?' · Inventário completo da unidade · filtros do painel não se aplicam a esta ficha.':' · Escola cadastrada, sem dados de equipamentos. Preencha a planilha de origem e sincronize novamente.');
    const s=stats(school.rows),dup=school.rows.filter(duplicates).length;
    const net=window.overviewAnalytics.summarize(DATA.records).categories;
    const categories=window.overviewAnalytics.summarize(school.rows).categories;
    const modes=[['all','Todos os registros',s.total],['attention','Operação: equipamentos em atenção',s.attention],['missing','Cadastro: sem serial válido',s.missing],['evaluation','Cadastro: avaliação pendente',s.evaluation],['duplicates','Cadastro: serial repetido na base',dup]];
    const rows=getSheetRows(school),pages=Math.max(1,Math.ceil(rows.length/pageSize));recordPage=Math.min(recordPage,pages);
    $p('school-sheet-content').innerHTML='<div class="sheet-metrics">'+metric('Equipamentos',num(s.total),'registros da escola')+metric('Disponibilidade',percent(s.available,s.total),num(s.available)+' disponíveis')+metric('Em atenção',num(s.attention),percent(s.attention,s.total)+' do inventário')+'</div><section class="sheet-section"><div class="section-kicker">FOCO DE ATUAÇÃO</div><h3>Da evidência à conferência</h3><p>Escolha um achado para consultar seus registros. Pendências podem se sobrepor; serial repetido não comprova duplicação física.</p><div class="focus-actions">'+modes.map(([mode,label,n])=>'<button type="button" data-sheet-mode="'+mode+'" aria-pressed="'+(recordMode===mode)+'"><span>'+label+'</span><strong>'+num(n)+'</strong><small>Conferir registros →</small></button>').join('')+'</div></section><section class="sheet-section"><div class="section-kicker">CONTEXTO DA REDE</div><h3>Disponibilidade por categoria</h3><p>Escola e Rede: quantidade disponível (percentual da categoria no respectivo universo). Equipamentos indica o total da categoria na escola. A rede inclui esta escola; percentuais não medem cobertura de alunos ou salas.</p><div class="sheet-table-wrap"><table class="premium-table"><thead><tr><th>Categoria</th><th>Equipamentos</th><th>Escola</th><th>Rede</th><th>Diferença</th></tr></thead><tbody>'+categories.map(c=>{const network=net.find(n=>n.label===c.label);const d=c.available/c.total*100-(network.total?network.available/network.total*100:0);return '<tr><th>'+esc(c.label)+'</th><td>'+num(c.total)+'</td><td>'+num(c.available)+' ('+percent(c.available,c.total)+')</td><td>'+num(network.available)+' ('+percent(network.available,network.total)+')</td><td>'+(d>0?'+':'')+new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(d)+' p.p.</td></tr>';}).join('')+'</tbody></table></div></section><section class="sheet-section" id="sheet-records"><div class="section-kicker">REGISTROS DE ORIGEM</div><h3>'+esc(modes.find(m=>m[0]===recordMode)[1])+' · '+num(rows.length)+'</h3><p>Valores informados na base. Arquivo e aba permitem localizar a ocorrência.</p><div class="sheet-records">'+rows.slice((recordPage-1)*pageSize,recordPage*pageSize).map(r=>'<article><div><strong>'+esc(r.categoria||r.aba||'Equipamento não informado')+'</strong><span>'+esc(r.status||'Situação não informada')+'</span></div><dl><div><dt>Serial</dt><dd>'+esc(r.serial||'Campo vazio')+'</dd></div><div><dt>Avaliação</dt><dd>'+esc(r.avaliacao||'Não informada')+'</dd></div><div><dt>Modelo</dt><dd>'+esc(r.MODELO||r.Modelo||r.modelo||'Não informado')+'</dd></div><div><dt>Origem</dt><dd>'+esc(r.arquivo||'Arquivo não informado')+' · '+esc(r.aba||'Aba não informada')+'</dd></div></dl></article>').join('')+(rows.length?'':'<p class="empty">Nenhum registro corresponde a este achado.</p>')+'</div><div class="sheet-pager"><button type="button" class="page-btn" data-sheet-page="-1" '+(recordPage===1?'disabled':'')+'>Anterior</button><span role="status">Página '+recordPage+' de '+pages+' · '+num(rows.length)+' registros</span><button type="button" class="page-btn" data-sheet-page="1" '+(recordPage===pages?'disabled':'')+'>Próxima</button></div></section>';
  }
  dialog.addEventListener('click',e=>{
    const mode=e.target.closest('[data-sheet-mode]'),page=e.target.closest('[data-sheet-page]');
    if(mode){recordMode=mode.dataset.sheetMode;recordPage=1;renderSheet();$p('sheet-records').scrollIntoView({block:'start'});$p('sheet-records').setAttribute('tabindex','-1');$p('sheet-records').focus({preventScroll:true});}
    if(page){recordPage+=Number(page.dataset.sheetPage);renderSheet();$p('sheet-records').scrollIntoView({block:'start'});}
  });
  document.addEventListener('click',e=>{
    const button=e.target.closest('#school-directory-list [data-school-open]');if(button)openSchool(button.dataset.schoolOpen,button);
  });
  $p('school-open').addEventListener('click',()=>{consultation.close();chooseSchool();});
  // Keep every drill-down in the current filter universe.
  const evidence=document.createElement('dialog');evidence.className='school-sheet';evidence.setAttribute('aria-labelledby','evidence-title');document.body.append(evidence);
  let evidenceRows=[],evidencePage=1,evidenceTrigger;
  function drawEvidence(){
    const pages=Math.max(1,Math.ceil(evidenceRows.length/pageSize));
    evidence.innerHTML='<header class="school-sheet-head"><div><div class="section-kicker">EVIDÊNCIAS DO RECORTE ATUAL</div><h2 id="evidence-title">Equipamentos em atenção · '+num(evidenceRows.length)+'</h2><p>Danificado, em manutenção ou inservível. Escolas em ordem alfabética.</p></div><button type="button" class="ghost-btn" data-evidence-close>Fechar registros</button></header><div class="sheet-records">'+evidenceRows.slice((evidencePage-1)*pageSize,evidencePage*pageSize).map(r=>'<article><div><strong>'+esc(r.unidade)+'</strong><span>CIE '+esc(r.cie)+'</span></div><p>'+esc(r.categoria||r.aba)+' · '+esc(r.status)+' · Serial '+esc(r.serial||'não informado')+'</p><small>'+esc(r.arquivo)+' · '+esc(r.aba)+'</small></article>').join('')+(evidenceRows.length?'':'<p class="empty">Nenhum registro em atenção nesta seleção.</p>')+'</div><div class="sheet-pager"><button type="button" class="page-btn" data-evidence-page="-1" '+(evidencePage<=1?'disabled':'')+'>Anterior</button><span>Página '+evidencePage+' de '+pages+'</span><button type="button" class="page-btn" data-evidence-page="1" '+(evidencePage>=pages?'disabled':'')+'>Próxima</button></div>';
  }
  evidence.addEventListener('click',e=>{if(e.target.closest('[data-evidence-close]'))evidence.close();const b=e.target.closest('[data-evidence-page]');if(b){evidencePage+=Number(b.dataset.evidencePage);drawEvidence();}});
  evidence.addEventListener('close',()=>evidenceTrigger?.focus({preventScroll:true}));
  executive.addEventListener('click',e=>{
    const b=e.target.closest('[data-executive]');if(!b)return;
    if(b.dataset.executive==='quality'){showView('quality');return;}
    evidenceTrigger=b;evidenceRows=filtered.filter(attention).sort((a,b)=>cmp(a.unidade||'',b.unidade||'')||cmp(a.cie||'',b.cie||''));evidencePage=1;drawEvidence();evidence.showModal();
  });
  const reportPreview=document.createElement('dialog');reportPreview.className='school-sheet report-preview';reportPreview.setAttribute('aria-labelledby','report-preview-title');
  reportPreview.innerHTML='<header class="school-sheet-head"><div><div class="section-kicker">DOCUMENTO EXECUTIVO</div><h2 id="report-preview-title">Relatório da seleção atual</h2><p>Confira o conteúdo antes de imprimir. Na janela do navegador, escolha Salvar como PDF.</p></div><div class="premium-tools"><button type="button" class="ghost-btn" id="report-save">Imprimir / salvar PDF</button><button type="button" class="ghost-btn" id="report-close">Fechar relatório</button></div></header><div id="report-preview-body"></div>';
  document.body.append(reportPreview);
  reportPreview.querySelector('header').append($p('report-close'));
  $p('report-close').textContent='Fechar';$p('report-close').setAttribute('aria-label','Fechar relatório');
  $p('report-save').textContent='Imprimir / PDF';$p('report-save').title='Abrir a impressão do navegador ou salvar como PDF';
  let reportIsSchool=false;
  const reportBack=document.createElement('button');reportBack.type='button';reportBack.className='ghost-btn';reportBack.id='report-back';reportBack.textContent='Voltar';$p('report-save').before(reportBack);
  reportBack.addEventListener('click',()=>{reportPreview.close();if(reportIsSchool){dialog.showModal();$p('school-print').focus();}else{consultation.showModal();$p('report-print').focus();}});
  $p('report-close').addEventListener('click',()=>reportPreview.close());
  reportPreview.addEventListener('close',()=>{if(!document.querySelector('dialog[open]'))$p('consultation-open').focus({preventScroll:true});});
  $p('report-save').addEventListener('click',async()=>{await Promise.all([document.fonts.load('400 9pt \"Latin Modern Sans\"'),document.fonts.load('700 9pt \"Latin Modern Sans\"')]);await Promise.all([...document.querySelectorAll('#inventory-report img')].map(img=>img.decode().catch(()=>{})));reportPreview.close();window.print();});
  async function report(){
    const {summarizeSchoolAttention}=await import("./report-school-attention.js");
    const attentionBySchool=summarizeSchoolAttention(filtered);
    const frontTable='<h2>Atenção por escola e frente</h2><p class="report-attention-note">Cada célula mostra quantidade em atenção (% da mesma frente na escola), conforme os filtros. Atenção = danificado, em manutenção ou inservível. — = sem registros da frente no recorte.</p><table class="premium-table report-school-attention"><colgroup><col style="width:44%">'+attentionBySchool.fronts.map(()=>'<col style="width:'+(56/attentionBySchool.fronts.length)+'%">').join('')+'</colgroup><thead><tr><th scope="col">Escola</th>'+attentionBySchool.fronts.map(f=>'<th scope="col">'+esc(f.label)+'</th>').join('')+'</tr></thead><tbody>'+attentionBySchool.schools.map(s=>'<tr><th scope="row">'+esc(s.name)+'</th>'+attentionBySchool.fronts.map(f=>{const st=s.fronts[f.id];return '<td>'+(st?.total?num(st.attention)+' ('+percent(st.attention,st.total)+')':'—')+'</td>';}).join('')+'</tr>').join('')+'</tbody></table>';
    reportIsSchool=false;
    let root=$p('inventory-report');if(!root){root=document.createElement('section');root.id='inventory-report';document.body.append(root);}
    const s=stats(filtered),summary=window.overviewAnalytics.summarize(filtered),q=window.inventoryQuality.analyze(DATA.records,filtered);
    const filters=[window.inventoryFilterContext?.()||window.inventoryFilterScope?.(),...[...filterState].filter(([,v])=>v.length).map(([id,v])=>({'filter-unit':'Escola','filter-cie':'Escola','filter-category':'Categoria','filter-manufacturer':'Fabricante','filter-model':'Modelo','filter-status':'Situação'}[id]||id)+': '+v.map(value=>window.inventoryFilterValueLabel?.(id,value)||value).join(', '))].filter(Boolean).join(' · ')||'Toda a base carregada';
    root.innerHTML='<header><div>SEINTEC · URE ITAPEVI</div><p>Emitido em '+esc(new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))+' · horário de Brasília</p><p>'+esc($p('data-date').textContent)+'</p><p><strong>Seleção:</strong> '+esc(filters)+'</p></header><div class="sheet-metrics">'+metric('Registros',num(s.total),num(window.inventoryScopedSchoolCies?.().length??summary.schools.length)+' escolas no recorte')+metric('Disponibilidade',percent(s.available,s.total),num(s.available)+' disponíveis')+metric('Em atenção',num(s.attention),percent(s.attention,s.total)+' do recorte')+'</div><h2>Qualidade cadastral</h2><p>'+num(s.missing)+' sem serial válido · '+num(s.evaluation)+' sem avaliação · '+num(q.counts.duplicates)+' seriais distintos repetidos na base, presentes no recorte. Indicadores podem se sobrepor.</p><h2>Composição por categoria</h2>'+summary.categories.map(c=>'<div class="report-bar"><span>'+esc(c.label)+'</span><div><i style="width:'+(s.total?c.total/s.total*100:0)+'%"></i></div><strong>'+num(c.total)+'</strong></div>').join('')+frontTable+'<footer>Fonte: inventário carregado no painel. Atenção = danificado, em manutenção ou inservível. Valores cadastrais sujeitos à conferência nas planilhas.</footer>';
    root.innerHTML=window.inventoryBranding.report(root.innerHTML);
    $p('report-preview-body').innerHTML=root.innerHTML;
    $p('report-preview-title').textContent='Relatório da seleção atual';
    window.dispatchEvent(new CustomEvent('inventory-report-ready',{detail:{rows:[...filtered],title:'Inventário | URE - Itapevi — Relatório geral',scope:filters,isSchool:false}}));
    reportPreview.showModal();
  }
  $p('report-print').addEventListener('click',()=>{consultation.close();report().catch(error=>{window.alert('Não foi possível preparar o relatório. '+error.message);});});
  const history=document.createElement('section');history.className='panel history-panel';
  history.innerHTML='<div class="panel-head"><div><div class="section-kicker">EVOLUÇÃO DA BASE</div><h2>O que mudou entre atualizações</h2><p class="panel-subtitle">Comparação com a versão anterior arquivada. Considera a rede completa.</p></div><button type="button" class="ghost-btn" id="history-load">Comparar versões</button></div><div id="history-content" role="status">Consulte o histórico para distinguir alterações da base de mudanças nos filtros.</div>';
  $p('view-overview').append(history);
  function compareVersions(previous,current){
    const old=stats(previous),now=stats(current);
    function uniqueMap(rows){const map=new Map();rows.forEach(r=>{if(window.inventoryQuality.serialIssue(r.serial))return;const id=JSON.stringify([key(r),serialKey(r),norm(r.categoria)]);if(!map.has(id))map.set(id,[]);map.get(id).push(r);});return map;}
    const before=uniqueMap(previous),after=uniqueMap(current);let added=0,removed=0,changed=0;
    for(const [id,rows] of after)if(rows.length===1){const prior=before.get(id);if(!prior)added++;else if(prior.length===1&&norm(prior[0].status)!==norm(rows[0].status))changed++;}
    for(const [id,rows] of before)if(rows.length===1&&!after.has(id))removed++;
    return {old,now,added,removed,changed};
  }
  async function loadHistory(){
    const b=$p('history-load');b.disabled=true;
    try{const ui=await import('./data-evolution-ui.js');await ui.showComparison($p('history-content'));}
    catch(error){$p('history-content').textContent='Não foi possível consultar o histórico. '+error.message;}
    finally{b.disabled=false;}
  }
  $p('history-load').addEventListener('click',loadHistory);
  function renderPremium(){
    refreshCache();renderRank();renderExecutive();renderDirectory();renderFrontQuality().catch(()=>{$p('front-quality-chart').textContent='Não foi possível calcular as pendências deste recorte.';});
    if(dialog.open)renderSheet();
    if(historyRows!==DATA.records){historyRows=DATA.records;$p('history-content').textContent='Consulte o histórico para comparar a base atualmente carregada à versão anterior.';}
  }
  const priorRender=render;render=function(...args){priorRender(...args);renderPremium();};
  window.inventoryPremium={stats,compareVersions,showReport(content,context){
    reportIsSchool=!!context.isSchool;
    let root=$p('inventory-report');if(!root){root=document.createElement('section');root.id='inventory-report';document.body.append(root);}
    root.innerHTML=window.inventoryBranding.report(content);$p('report-preview-body').innerHTML=root.innerHTML;
    $p('report-preview-title').textContent=context.title;
    window.dispatchEvent(new CustomEvent('inventory-report-ready',{detail:context}));
    if(dialog.open)dialog.close();
    reportPreview.showModal();
  }};

  // Replace the raw, paginated category rows with indicators for the current selection.
  function renderCategoryInsights(sheet){
    const host=$p('category-view')?.querySelector('.category-records');
    if(!host)return;
    const rows=filtered.filter(row=>row.aba===sheet),total=rows.length;
    const schools=new Set(rows.map(row=>String(row.cie||'').trim()).filter(Boolean));
    const count=predicate=>rows.reduce((sum,row)=>sum+Number(predicate(row)),0);
    const ready=count(available),needsAttention=count(attention);
    const validSerial=count(row=>!window.inventoryQuality.serialIssue(row.serial));
    const evaluated=count(row=>!noEval(row));
    const ratio=value=>total?percent(value,total):'—';
    host.innerHTML='<div class="category-insights-head"><div><div class="section-kicker">LEITURA DA FRENTE</div><h3>Indicadores do recorte</h3><p>Resultados da aba selecionada com os filtros atuais. Cada percentual usa os registros desta seleção.</p></div></div>'+
      '<div class="category-insights-grid">'+
      metric('Escolas com registros',num(schools.size),num(total)+' registros nesta frente · CIEs distintos')+
      metric('Disponíveis',ratio(ready),num(ready)+' de '+num(total)+' registros')+
      metric('Requerem atenção',ratio(needsAttention),num(needsAttention)+' de '+num(total)+' · danificado, manutenção ou inservível')+
      metric('Seriais válidos',ratio(validSerial),num(validSerial)+' válidos · '+num(total-validSerial)+' ausentes ou inválidos')+
      metric('Avaliação registrada',ratio(evaluated),num(evaluated)+' preenchidas · '+num(total-evaluated)+' sem avaliação')+
      '</div>';
  }
  const priorCategoryInsights=renderCategoryView;
  renderCategoryView=function(sheet,...args){
    const result=priorCategoryInsights(sheet,...args);
    renderCategoryInsights(sheet);
    return result;
  };
})();
