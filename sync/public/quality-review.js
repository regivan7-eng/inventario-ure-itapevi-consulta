(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  const serialKey=value=>norm(value).replace(/\s+/g,'');
  const missing=new Set(['','-','--','SN','NA','N/A','NOC','NAOCONSTA','NAOINFORMADO','NAOIDENTIFICADO','SEMSN','SEMSERIAL','SEMSERIE','SEMNUMERODESERIE','SEMNUMEROSERIE','SEMIDENTIFICACAO','0','NULL','ILEGIVEL']);
  function serialIssue(value){
    const raw=norm(value),compact=raw.replace(/[^A-Z0-9]/g,'');
    if(missing.has(raw.replace(/\s+/g,''))||missing.has(compact))return raw?'Identificação ausente ou ilegível':'Campo vazio';
    if(/POSSIVEL|CAIXOTE|TRANCAD|DENTRO DE|NAO FOI|NAO TEM|SEM ACESSO|NAO LOCALIZAD|INEXISTENTE|VERIFICAR|ETIQUETA AUSENTE|SEM ETIQUETA/.test(raw))return 'Descrição no campo de série';
    return '';
  }
  const noEvaluation=r=>['','-','NA','N/A','NAO INFORMADO','SEM AVALIACAO','NAO AVALIADO','SEM INFORMACAO'].includes(norm(r.avaliacao));
  const number=value=>new Intl.NumberFormat('pt-BR').format(value);
  const collator=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
  const schoolKey=r=>String(r.cie||'').trim()||norm(r.unidade)||'Unidade não identificada';
  function repetitionInfo(records){
    const schools=new Map();records.forEach(r=>schools.set(schoolKey(r),(schools.get(schoolKey(r))||0)+1));
    return {type:schools.size>1?'cross':'same',schoolCount:schools.size,counts:schools};
  }
  const csvCell=value=>{
    let text=String(value??'');
    if(/^(?:[\t\r]|\s*[=+@-])/.test(text))text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  };
  const csvText=rows=>'\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
  function analyze(all,selection){
    const baseSerials=new Map();
    all.forEach(r=>{if(serialIssue(r.serial))return;const key=serialKey(r.serial);if(!baseSerials.has(key))baseSerials.set(key,[]);baseSerials.get(key).push(r);});
    const groups={missing:new Map(),evaluation:new Map(),duplicates:new Map()};
    let missingCount=0,evaluationCount=0;
    const duplicateSerials=new Set();
    function add(type,r,serial,issue,baseTotal=0){
      const school=r.unidade||'Escola não identificada',cie=String(r.cie||''),key=JSON.stringify([cie||school,serial,type==='evaluation'?norm(r.avaliacao):issue]);
      if(!groups[type].has(key))groups[type].set(key,{key,school,cie,serial:serial||'—',issue,baseTotal,records:[],search:''});
      groups[type].get(key).records.push(r);
    }
    selection.forEach(r=>{
      const issue=serialIssue(r.serial),serial=serialKey(r.serial);
      if(issue){missingCount++;add('missing',r,String(r.serial||'').trim(),issue);}
      else if((baseSerials.get(serial)?.length||0)>1){duplicateSerials.add(serial);add('duplicates',r,serial,'',baseSerials.get(serial).length);}
      if(noEvaluation(r)){evaluationCount++;add('evaluation',r,String(r.serial||'').trim(),String(r.avaliacao||'Não informado'));}
    });
    for(const map of Object.values(groups))for(const group of map.values())group.search=norm([group.school,group.cie,group.serial,group.issue].join(' '));
    return {baseSerials,counts:{missing:missingCount,evaluation:evaluationCount,duplicates:duplicateSerials.size},groups:Object.fromEntries(Object.entries(groups).map(([key,map])=>[key,[...map.values()]]))};
  }
  window.inventoryQuality={serialIssue,analyze,repetitionInfo,csvText};
  const config={
    missing:{label:'Sem serial válido',description:'registros com identificação ausente ou texto a revisar',title:'Identificação ausente ou inválida',note:'O conteúdo original é exibido para revisão humana. Esses valores não entram na contagem de seriais repetidos.',field:'Campo de série',extra:'Motivo'},
    evaluation:{label:'Sem avaliação',description:'registros sem avaliação técnica informada',title:'Avaliação técnica pendente',note:'Inclui campos vazios e marcações como “Sem avaliação” ou “Não informado”.',field:'Serial informado',extra:'Avaliação informada'},
    duplicates:{label:'Seriais repetidos',description:'seriais distintos com mais de um registro na base',title:'Seriais repetidos',note:'Uma linha por escola e serial. “Na escola” conta o recorte atual; “Total na base” inclui registros fora dos filtros. Repetição exige conferência e não confirma duplicidade física.',field:'Serial',extra:'Na escola'}
  };
  let active='duplicates',query='',page=1,direction=1,opened=null,detailPage=1,displayed=[],scope='all',compareSerial=null;
  let lastAll,lastSelection,model;
  const pageSize=15,detailSize=8;
  function getModel(){
    if(lastAll!==DATA.records||lastSelection!==filtered){
      model=analyze(DATA.records,filtered);lastAll=DATA.records;lastSelection=filtered;page=1;opened=null;detailPage=1;
    }
    return model;
  }
  function renderCards(){
    const current=getModel();
    $('quality-summary').innerHTML='<div class="qr-cards">'+['missing','evaluation','duplicates'].map(type=>
      '<button type="button" class="qr-card '+(type===active?'selected':'')+'" data-quality-mode="'+type+'" aria-pressed="'+(type===active)+'" aria-controls="quality"><span class="qr-card-heading"><span>'+config[type].label+'</span><strong>'+number(current.counts[type])+'</strong></span><span class="qr-card-note">'+config[type].description+'</span><span class="qr-card-action">'+(type===active?'Lista selecionada':'Consultar registros →')+'</span></button>'
    ).join('')+'</div>';
  }
  renderQuality=renderCards;
  const priorKpis=renderKpis;
  renderKpis=function(){priorKpis();$('kpi-no-serial').textContent=number(getModel().counts.missing);};
  function selectedRows(){
    const current=getModel(),needle=norm(query);
    return current.groups[active].filter(row=>(!needle||row.search.includes(needle))&&(active!=='duplicates'||scope==='all'||repetitionInfo(current.baseSerials.get(row.serial)||[]).type===scope)).sort((a,b)=>direction*collator.compare(a.school,b.school)||collator.compare(a.cie,b.cie)||collator.compare(a.serial,b.serial));
  }
  function duplicateBadge(row){
    if(active!=='duplicates')return '';
    const info=repetitionInfo(getModel().baseSerials.get(row.serial)||[]),local=info.counts.get(schoolKey(row.records[0]))||0;
    return '<span class="qr-repeat-badge '+info.type+'">'+(info.type==='cross'?'Escolas diferentes':'Na mesma escola')+'</span>'+(info.type==='cross'&&local>1?'<small class="qr-repeat-extra">Também repetido nesta escola</small>':'');
  }
  function draw(){
    const current=getModel(),spec=config[active];
    const rows=selectedRows();
    $('qr-scope-label').hidden=active!=='duplicates';
    $('qr-export').disabled=rows.length===0;
    const pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages);
    displayed=rows.slice((page-1)*pageSize,page*pageSize);
    $('qr-title').textContent=spec.title;$('qr-note').textContent=spec.note;
    $('qr-table-head').innerHTML='<tr><th scope="col" aria-sort="'+(direction===1?'ascending':'descending')+'"><button type="button" id="qr-sort-school" aria-label="Ordenar escolas de '+(direction===1?'Z a A':'A a Z')+'">Escola '+(direction===1?'↑':'↓')+'</button></th><th scope="col">CIE</th><th scope="col">'+spec.field+'</th><th scope="col">'+spec.extra+'</th><th scope="col">'+(active==='duplicates'?'Total na base':'Registros')+'</th><th scope="col">Detalhes</th></tr>';
    $('qr-table-body').innerHTML=displayed.map((row,index)=>{
      const expanded=opened===row.key;
      return '<tr><th scope="row">'+esc(row.school)+'</th><td>'+esc(row.cie||'—')+'</td><td class="qr-serial"><div class="qr-serial-content"><span class="qr-serial-value">'+esc(row.serial)+'</span>'+duplicateBadge(row)+'</div></td><td class="'+(active==='duplicates'?'qr-number':'')+'">'+(active==='duplicates'?number(row.records.length):esc(row.issue))+'</td><td class="qr-number">'+(active==='duplicates'?'<button type="button" class="qr-compare-button" data-qr-compare="'+index+'" aria-label="Comparar todas as '+number(row.baseTotal)+' ocorrências do serial '+esc(row.serial)+'">'+number(row.baseTotal)+' ↗</button>':number(row.records.length))+'</td><td><button type="button" class="qr-detail-button" data-qr-toggle="'+index+'" aria-expanded="'+expanded+'" aria-controls="qr-details-'+index+'">'+(expanded?'Fechar':'Ver registros')+'</button></td></tr>'+
        (expanded?'<tr id="qr-details-'+index+'" class="qr-detail-row"><td colspan="6">'+details(row)+'</td></tr>':'');
    }).join('')||'<tr><td colspan="6" class="qr-empty">Nenhum registro encontrado para esta seleção.</td></tr>';
    $('qr-result-count').textContent=number(rows.length)+(rows.length===1?' combinação de escola e identificação':' combinações de escola e identificação');
    $('qr-page-info').textContent=(rows.length?number((page-1)*pageSize+1)+'–'+number(Math.min(page*pageSize,rows.length)):'0')+' de '+number(rows.length);
    $('qr-prev').disabled=page<=1;$('qr-next').disabled=page>=pages;
  }
  function details(row){
    const pages=Math.max(1,Math.ceil(row.records.length/detailSize));detailPage=Math.min(detailPage,pages);
    const records=row.records.slice((detailPage-1)*detailSize,detailPage*detailSize);
    return '<div class="qr-details"><h3>Registros de '+esc(row.school)+'</h3><p>'+number(row.records.length)+' registro(s) no recorte atual. Confira a aba e o arquivo para localizar cada ocorrência.</p><div class="qr-detail-cards">'+records.map((r,index)=>
      '<article class="qr-record"><strong>Registro '+number((detailPage-1)*detailSize+index+1)+'</strong><dl>'+[
        ['Equipamento',r.categoria||r['CATEGORIA DO EQUIPAMENTO']],['Modelo',r.MODELO||r.Modelo||r.modelo],['Serial na planilha',r.serial||'Campo vazio'],['Situação',r.status],['Avaliação',r.avaliacao],['Aba',r.aba],['Arquivo de origem',r.arquivo]
      ].map(([key,value])=>'<div><dt>'+esc(key)+'</dt><dd>'+esc(value||'Não informado')+'</dd></div>').join('')+'</dl></article>'
    ).join('')+'</div>'+(pages>1?'<div class="qr-detail-pager"><button type="button" class="page-btn" data-detail-page="-1" '+(detailPage===1?'disabled':'')+'>Registros anteriores</button><span>'+detailPage+' de '+pages+'</span><button type="button" class="page-btn" data-detail-page="1" '+(detailPage===pages?'disabled':'')+'>Próximos registros</button></div>':'')+'</div>';
  }
  renderDetails=function(){
    const root=$('duplicates-table');if(!root)return;
    if(!root.querySelector('#qr-table-body')){
      root.innerHTML='<div class="qr-list-heading"><div><div class="section-kicker">CONSULTA POR ESCOLA</div><h2 id="qr-title"></h2></div><span id="qr-result-count" role="status"></span></div><p id="qr-note" class="panel-subtitle"></p><label class="qr-search-label" for="qr-search">Pesquisar escola, CIE ou serial</label><input id="qr-search" class="qr-search" type="search" placeholder="Digite para localizar registros"><div class="qr-actions"><label id="qr-scope-label">Tipo de repetição<select id="qr-scope"><option value="all">Todos os tipos</option><option value="cross">Escolas diferentes</option><option value="same">Na mesma escola</option></select></label><button type="button" id="qr-export" class="ghost-btn">Baixar pendências XLSX</button><span class="qr-export-note">Inclui todas as páginas da consulta filtrada.</span></div><div class="qr-table-wrap"><table class="qr-table"><thead id="qr-table-head"></thead><tbody id="qr-table-body"></tbody></table></div><div class="qr-pagination"><button type="button" class="page-btn" id="qr-prev">Anterior</button><span id="qr-page-info"></span><button type="button" class="page-btn" id="qr-next">Próxima</button></div>';
      $('qr-search').value=query;
      $('qr-scope').value=scope;
      $('qr-scope').addEventListener('change',e=>{scope=e.target.value;page=1;opened=null;draw();});
      $('qr-export').addEventListener('click',exportPending);
      $('qr-search').addEventListener('input',e=>{query=e.target.value;page=1;opened=null;draw();});
      root.addEventListener('click',event=>{
        const toggle=event.target.closest('[data-qr-toggle]'),detail=event.target.closest('[data-detail-page]'),compare=event.target.closest('[data-qr-compare]');
        if(compare){openComparison(displayed[Number(compare.dataset.qrCompare)].serial,compare);return;}
        if(toggle){const row=displayed[Number(toggle.dataset.qrToggle)];opened=opened===row.key?null:row.key;detailPage=1;draw();}
        else if(detail){detailPage+=Number(detail.dataset.detailPage);draw();}
        else if(event.target.closest('#qr-sort-school')){direction*=-1;page=1;opened=null;draw();}
        else if(event.target.closest('#qr-prev')){page--;opened=null;draw();}
        else if(event.target.closest('#qr-next')){page++;opened=null;draw();}
      });
    }
    draw();
  };

  function exportPending(){
    const header=['Escola','CIE','Serial informado','Pendência','Tipo de repetição','Registros na escola no recorte','Total do serial na base','Equipamento','Modelo','Situação','Avaliação','Aba','Arquivo de origem'];
    const rows=selectedRows().flatMap(group=>group.records.map(r=>[r.unidade,r.cie,r.serial,config[active].title,active==='duplicates'?(repetitionInfo(getModel().baseSerials.get(group.serial)||[]).type==='cross'?'Escolas diferentes':'Na mesma escola'):group.issue,group.records.length,active==='duplicates'?group.baseTotal:'',r.categoria,r.MODELO||r.Modelo||r.modelo,r.status,r.avaliacao,r.aba,r.arquivo]));
    if(rows.length)window.inventoryExports.downloadTable([header,...rows],{filename:'pendencias-'+active,sheetName:'Pendências',title:config[active].title,scope:'Todas as páginas da consulta de pendências, respeitando os filtros, a busca e o tipo de repetição selecionados.',widths:[52,14,28,35,24,24,24,32,30,24,26,32,72]});
  }
  const dialog=document.createElement('dialog');dialog.id='qr-comparison';dialog.className='qr-comparison';dialog.setAttribute('aria-labelledby','qr-comparison-title');
  dialog.innerHTML='<div class="qr-comparison-heading"><div><div class="section-kicker">CONFERÊNCIA ENTRE REGISTROS</div><h2 id="qr-comparison-title"></h2></div><button type="button" class="ghost-btn" data-close-comparison>Fechar comparação</button></div><p id="qr-comparison-summary"></p><p class="qr-comparison-note">Esta comparação inclui todas as ocorrências do serial na base carregada, inclusive fora dos filtros. A sinalização indica cadastros a conferir.</p><div class="qr-comparison-scroll"><table class="qr-comparison-table"><thead><tr><th>Escola / CIE</th><th>Equipamento / modelo</th><th>Serial na planilha</th><th>Situação</th><th>Arquivo / aba</th><th>Recorte atual</th></tr></thead><tbody id="qr-comparison-body"></tbody></table></div>';
  document.body.appendChild(dialog);
  let previousTrigger;
  dialog.querySelector('[data-close-comparison]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{compareSerial=null;previousTrigger?.focus({preventScroll:true});});
  function openComparison(serial,trigger){
    const current=getModel(),records=[...(current.baseSerials.get(serial)||[])].sort((a,b)=>collator.compare(a.unidade||'',b.unidade||'')||collator.compare(a.cie||'',b.cie||''));
    const info=repetitionInfo(records),inSelection=new Set(filtered);compareSerial=serial;previousTrigger=trigger;
    $('qr-comparison-title').textContent='Comparar serial '+serial;
    $('qr-comparison-summary').textContent=number(records.length)+' registros · '+number(info.schoolCount)+' unidade(s) · '+(info.type==='cross'?'Encontrado em escolas diferentes':'Repetido na mesma escola');
    $('qr-comparison-body').innerHTML=records.map(r=>'<tr><td data-label="Escola / CIE"><strong>'+esc(r.unidade||'Escola não identificada')+'</strong><small>CIE '+esc(r.cie||'não informado')+'</small></td><td data-label="Equipamento / modelo">'+esc(r.categoria||'Não informado')+'<small>'+esc(r.MODELO||r.Modelo||r.modelo||'Modelo não informado')+'</small></td><td data-label="Serial na planilha" class="qr-serial">'+esc(r.serial)+'</td><td data-label="Situação">'+esc(r.status||'Não informado')+'</td><td data-label="Arquivo / aba">'+esc(r.arquivo||'Não informado')+'<small>'+esc(r.aba||'Aba não informada')+'</small></td><td data-label="Recorte atual"><span class="qr-context '+(inSelection.has(r)?'inside':'outside')+'">'+(inSelection.has(r)?'Incluído':'Fora dos filtros')+'</span></td></tr>').join('');
    dialog.showModal();
  }

  $('quality-summary').addEventListener('click',event=>{
    const card=event.target.closest('[data-quality-mode]');if(!card)return;
    active=card.dataset.qualityMode;query='';page=1;opened=null;scope='all';
    if($('qr-scope'))$('qr-scope').value='all';
    renderCards();renderDetails();$('qr-search').value='';
    $('quality').scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
  });
})();
