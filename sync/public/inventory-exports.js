(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const schoolKey=r=>String(r.cie||'').trim()||norm(r.unidade)||'sem-identificacao';
  const collator=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
  const num=v=>new Intl.NumberFormat('pt-BR').format(v);
  const pct=(n,d)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(d?n/d*100:0)+'%';
  const dateStamp=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
  const timestamp=()=>new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
  const ordered=rows=>[...rows].sort((a,b)=>collator.compare(a.unidade||'',b.unidade||'')||collator.compare(a.categoria||a.aba||'',b.categoria||b.aba||'')||collator.compare(a.serial||'',b.serial||''));
  let reportContext=null;
  window.addEventListener('inventory-report-ready',e=>{reportContext=e.detail;});
  function inspect(rows){
    const quality=window.inventoryQuality.analyze(DATA.records,rows);
    const missing=new Set(quality.groups.missing.flatMap(g=>g.records));
    const evaluation=new Set(quality.groups.evaluation.flatMap(g=>g.records));
    const duplicates=new Set(quality.groups.duplicates.flatMap(g=>g.records));
    const reasons=r=>[missing.has(r)?'Sem serial válido':'',evaluation.has(r)?'Avaliação pendente':'',duplicates.has(r)?'Serial repetido na base':''].filter(Boolean).join('; ');
    return {quality,reasons,duplicates};
  }
  function recordTable(rows,review){
    return [['Escola','CIE','Equipamento / categoria','Modelo','Serial informado','Situação','Avaliação','Pendências para conferência','Aba de origem','Arquivo de origem'],
      ...ordered(rows).map(r=>[String(r.unidade||''),String(r.cie||''),String(r.categoria||r.aba||''),String(r.MODELO||r.Modelo||r.modelo||''),String(r.serial??''),String(r.status||''),String(r.avaliacao||''),review.reasons(r),String(r.aba||''),String(r.arquivo||'')])];
  }
  function buildWorkbook(rows,context){
    const lib=window.XLSX;if(!lib?.utils?.book_new)throw Error('O recurso de planilha não foi carregado. Recarregue a página.');
    const workbook=lib.utils.book_new(),s=window.inventoryPremium.stats(rows),review=inspect(rows);
    const summary=window.overviewAnalytics.summarize(rows);
    const registered=(DATA.schools||[]).filter(s=>s.sem_dados&&(context.isSchool?s.cie===context.cie:(window.inventoryScopedSchoolCies?.()||[]).includes(s.cie)));
    const allCategories=new Map(window.overviewAnalytics.summarize(DATA.records).categories.map(c=>[c.label,c]));
    function sheet(name,values,widths,{filter=true,percentColumns=[]}={}){
      const ws=lib.utils.aoa_to_sheet(values);
      ws['!cols']=widths.map(wch=>({wch}));
      if(filter)ws['!autofilter']={ref:ws['!ref']};
      ws['!margins']={left:.4,right:.4,top:.5,bottom:.5,header:.2,footer:.2};
      for(const column of percentColumns)for(let row=1;row<values.length;row++){
        const cell=ws[lib.utils.encode_cell({r:row,c:column})];if(cell?.t==='n')cell.z='0.0%';
      }
      lib.utils.book_append_sheet(workbook,ws,name);return ws;
    }
    const overview=[
      ['Indicador','Valor','Definição / contexto'],
      ['Relatório',context.title,'Inventário | URE - Itapevi · SEINTEC'],
      ['Emitido em',timestamp(),'Horário de Brasília'],
      ['Fonte / atualização',document.getElementById('data-date').textContent,'Base carregada no painel'],
      ['Seleção',context.scope,'Exportação de todas as páginas desta seleção'],
      ['Registros',s.total,'Quantidade de registros inventariados'],
      ['Escolas',summary.schools.length+registered.length,'Inclui escolas cadastradas ainda sem registros de equipamentos'],
      ['Disponíveis',s.available,'Situação informada: Disponível'],
      ['Disponibilidade',s.total?s.available/s.total:0,'Proporção de disponíveis no total selecionado'],
      ['Em atenção',s.attention,'Danificado, em manutenção ou inservível'],
      ['Proporção em atenção',s.total?s.attention/s.total:0,'Proporção no total selecionado'],
      ['Sem serial válido',s.missing,'Campo vazio, identificação ausente ou texto a revisar'],
      ['Sem avaliação',s.evaluation,'Avaliação técnica não informada'],
      ['Seriais distintos repetidos',review.quality.counts.duplicates,'Seriais presentes no recorte que se repetem na base completa'],
      ['Registros com pendências',rows.filter(r=>review.reasons(r)).length,'Um registro pode apresentar mais de uma pendência'],
      ['Leitura das repetições','Exigem conferência','Serial repetido não comprova duplicação física'],
      ['Categorias','Classificação exibida no painel','Dados originais de identificação e origem são preservados']
    ];
    const info=sheet('Resumo',overview,[31,62,95],{filter:false});
    ['B9','B11'].forEach(address=>{if(info[address])info[address].z='0.0%';});
    const categories=[['Categoria','Equipamentos','Disponíveis','Disponibilidade','Em atenção','Proporção em atenção',...(context.isSchool?['Disponibilidade na rede','Diferença (p.p.)']:[])],
      ...summary.categories.map(c=>{const n=allCategories.get(c.label);return [c.label,c.total,c.available,c.total?c.available/c.total:0,c.attention,c.total?c.attention/c.total:0,...(context.isSchool?[n.total?n.available/n.total:0,(c.total?c.available/c.total:0)*100-(n.total?n.available/n.total:0)*100]:[])];})];
    sheet('Categorias',categories,[34,17,17,20,17,24,...(context.isSchool?[26,21]:[])],{percentColumns:context.isSchool?[3,5,6]:[3,5]});
    const bySchool=new Map();rows.forEach(r=>{const id=schoolKey(r);if(!bySchool.has(id))bySchool.set(id,[]);bySchool.get(id).push(r);});
    const schoolRows=[...bySchool.values()].sort((a,b)=>collator.compare(a[0].unidade||'',b[0].unidade||''));
    sheet('Escolas',[['Escola','CIE','Equipamentos','Disponíveis','Disponibilidade','Em atenção','Proporção em atenção','Sem serial válido','Sem avaliação','Registros com serial repetido'],
      ...[...schoolRows.map(group=>{const st=window.inventoryPremium.stats(group);return [String(group[0].unidade||''),String(group[0].cie||''),st.total,st.available,st.total?st.available/st.total:0,st.attention,st.total?st.attention/st.total:0,st.missing,st.evaluation,group.filter(r=>review.duplicates.has(r)).length];}),...registered.map(s=>[s.name,s.cie,0,0,0,0,0,0,0,0])].sort((a,b)=>collator.compare(a[0],b[0]))],
      [56,14,17,17,20,17,24,20,20,30],{percentColumns:[4,6]});
    const widths=[56,14,30,28,28,23,25,65,32,78];
    sheet('Registros',recordTable(rows,review),widths);
    sheet('Pendências',recordTable(rows.filter(r=>review.reasons(r)),review),widths);
    workbook.Props={Title:context.title,Subject:context.scope,Author:'SEINTEC · URE Itapevi',CreatedDate:new Date()};
    return workbook;
  }
  function schoolContext(){
    const selected=document.getElementById('school-sheet-select').value;
    const rows=DATA.records.filter(r=>schoolKey(r)===selected);
    const registered=DATA.schools?.find(s=>s.cie===selected);
    if(!rows.length&&!registered)throw Error('A escola selecionada não consta na base.');
    const name=rows[0]?.unidade||registered?.name||'Escola não identificada',cie=String(rows[0]?.cie||registered?.cie||'não informado');
    return {rows,isSchool:true,title:name,scope:name+' · CIE '+cie+(rows.length?' · inventário completo da unidade, sem os filtros do painel':' · Escola cadastrada, sem dados de equipamentos na planilha de origem'),cie};
  }
  function exportWorkbook(context){
    const workbook=buildWorkbook(context.rows,context);
    const name=context.isSchool?'inventario-escola-'+context.cie.replace(/[^a-zA-Z0-9_-]/g,'-'):'inventario-relatorio-geral';
    const bytes=window.XLSX.write(workbook,{type:'array',bookType:'xlsx',compression:true});
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const link=document.createElement('a');link.href=url;link.download=name+'-'+dateStamp()+'.xlsx';link.hidden=true;
    // Download links must be inside the active modal; the rest of the page is inert.
    (document.querySelector('dialog[open]')||document.body).append(link);
    link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    const notice=document.getElementById('school-sheet').open?message:reportStatus;
    notice.textContent='XLSX preparado: '+num(context.rows.length)+' registros, incluindo todas as páginas.';notice.hidden=false;
  }
  const message=document.createElement('p');message.id='inventory-export-message';message.setAttribute('role','status');message.className='premium-note';message.hidden=true;
  document.querySelector('#school-sheet .school-sheet-head').after(message);
  document.getElementById('school-sheet-select').addEventListener('change',()=>{message.hidden=true;});
  document.getElementById('school-sheet').addEventListener('close',()=>{message.hidden=true;});
  function perform(action,button){
    const prior=button.textContent;button.disabled=true;message.hidden=true;
    try{action();}catch(error){message.textContent=error.message;message.hidden=false;if(!document.getElementById('school-sheet').open){reportStatus.textContent=error.message;reportStatus.hidden=false;}}
    finally{button.disabled=false;button.textContent=prior;}
  }
  const schoolActions=document.createElement('div');schoolActions.className='premium-tools school-export-tools';schoolActions.setAttribute('role','group');schoolActions.setAttribute('aria-label','Ações da escola');
  schoolActions.innerHTML='<button type="button" class="ghost-btn" id="school-print" title="Preparar o relatório completo da escola para impressão ou PDF">Gerar PDF</button><button type="button" class="ghost-btn" id="school-xlsx" title="Baixar todas as páginas do inventário da escola em Excel">Baixar XLSX</button>';
  document.getElementById('school-sheet-close').before(schoolActions);
  schoolActions.prepend(document.getElementById('school-sheet-back'));
  document.getElementById('school-sheet-close').textContent='Fechar';
  document.getElementById('school-sheet-close').setAttribute('aria-label','Fechar consulta da escola');
  const note=document.createElement('p');note.className='premium-note school-export-note';note.textContent='PDF e XLSX incluem o inventário completo da escola, todas as páginas. O XLSX reúne resumo, categorias, escolas, registros e pendências.';
  document.querySelector('#school-sheet-select').after(note);
  document.getElementById('school-xlsx').addEventListener('click',e=>perform(()=>exportWorkbook(schoolContext()),e.currentTarget));
  function schoolPrint(){
    const context=schoolContext(),{rows}=context,s=window.inventoryPremium.stats(rows),review=inspect(rows);
    const categories=window.overviewAnalytics.summarize(rows).categories;
    const network=new Map(window.overviewAnalytics.summarize(DATA.records).categories.map(c=>[c.label,c]));
    const sorted=ordered(rows);
    const files=[...new Set(rows.map(r=>r.arquivo||'Arquivo não informado'))].sort(collator.compare);
    const fileIndex=new Map(files.map((file,i)=>[file,i+1]));
    const cell=(label,value,note)=>'<article class="premium-metric"><span>'+label+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></article>';
    const content='<header><div>SEINTEC · URE ITAPEVI</div><h1>'+esc(context.title)+'</h1><p>Emitido em '+esc(timestamp())+' · horário de Brasília</p><p>'+esc(document.getElementById('data-date').textContent)+'</p><p>'+esc(context.scope)+'</p></header><div class="sheet-metrics">'+cell('Equipamentos',num(s.total),'registros da escola')+cell('Disponibilidade',pct(s.available,s.total),num(s.available)+' disponíveis')+cell('Em atenção',num(s.attention),pct(s.attention,s.total)+' do inventário')+'</div><h2>Foco de atuação</h2><p>'+num(s.missing)+' sem serial válido · '+num(s.evaluation)+' sem avaliação · '+num(review.duplicates.size)+' registros com serial repetido na base ('+num(review.quality.counts.duplicates)+' seriais distintos).</p><p>Indicadores podem se sobrepor. Seriais repetidos exigem conferência e não comprovam duplicação física.</p><h2>Disponibilidade por categoria</h2><table class="premium-table"><thead><tr><th>Categoria</th><th>Equipamentos</th><th>Escola</th><th>Rede</th><th>Diferença (p.p.)</th></tr></thead><tbody>'+categories.map(c=>{const n=network.get(c.label),d=(c.available/c.total-n.available/n.total)*100;return '<tr><th>'+esc(c.label)+'</th><td>'+num(c.total)+'</td><td>'+num(c.available)+' ('+pct(c.available,c.total)+')</td><td>'+num(n.available)+' ('+pct(n.available,n.total)+')</td><td>'+(d>0?'+':'')+new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(d)+'</td></tr>';}).join('')+'</tbody></table><p>Escola e Rede: quantidade disponível (percentual da categoria no respectivo universo). A coluna Equipamentos mostra o total da categoria na escola. A rede inclui esta escola.</p><h2>Inventário completo — '+num(rows.length)+' registros</h2><p>Inclui todas as páginas e situações da escola, independentemente do achado selecionado na ficha. A coluna Origem indica arquivo e aba.</p><table class="premium-table school-print-records"><thead><tr><th>Equipamento / modelo</th><th>Serial</th><th>Situação / avaliação</th><th>Pendências</th><th>Origem</th></tr></thead><tbody>'+sorted.map(r=>'<tr><th>'+esc(r.categoria||r.aba||'Não informado')+'<small>'+esc(r.MODELO||r.Modelo||r.modelo||'Modelo não informado')+'</small></th><td>'+esc(r.serial||'Campo vazio')+'</td><td>'+esc(r.status||'Não informado')+'<small>'+esc(r.avaliacao||'Avaliação não informada')+'</small></td><td>'+esc(review.reasons(r)||'—')+'</td><td>Arquivo '+fileIndex.get(r.arquivo||'Arquivo não informado')+'<small>'+esc(r.aba||'Aba não informada')+'</small></td></tr>').join('')+'</tbody></table><h2>Arquivos de origem</h2><ol>'+files.map(f=>'<li>'+esc(f)+'</li>').join('')+'</ol><footer>Fonte: inventário carregado no painel. Atenção = danificado, em manutenção ou inservível. A classificação segue o painel; identificações e origem são preservadas para conferência.</footer>';
    window.inventoryPremium.showReport(content,context);
  }
  document.getElementById('school-print').addEventListener('click',e=>perform(schoolPrint,e.currentTarget));
  const reportXlsx=document.createElement('button');reportXlsx.type='button';reportXlsx.id='report-xlsx';reportXlsx.className='ghost-btn';reportXlsx.textContent='Baixar XLSX';
  document.getElementById('report-save').after(reportXlsx);
  const reportStatus=document.createElement('p');reportStatus.setAttribute('role','status');reportStatus.className='premium-note';reportStatus.hidden=true;document.getElementById('report-preview-body').before(reportStatus);
  window.addEventListener('inventory-report-ready',()=>{reportStatus.hidden=true;});
  reportXlsx.addEventListener('click',e=>perform(()=>{reportStatus.hidden=true;if(!reportContext)throw Error('Abra o relatório antes de exportar.');exportWorkbook(reportContext);},e.currentTarget));
  function downloadTable(values,{filename,sheetName,title,scope,widths=[]}){
    const lib=window.XLSX;if(!lib?.utils?.book_new)throw Error('O recurso de planilha não foi carregado. Recarregue a página.');
    const wb=lib.utils.book_new(),ws=lib.utils.aoa_to_sheet(values.map(row=>row.map(v=>v??'')));
    ws['!cols']=(values[0]||[]).map((_,i)=>({wch:widths[i]||24}));
    ws['!autofilter']={ref:ws['!ref']};ws['!rows']=[{hpt:30}];
    lib.utils.book_append_sheet(wb,ws,sheetName);
    const info=lib.utils.aoa_to_sheet([['Informação','Valor'],['Relatório',title],['Emitido em',timestamp()],['Seleção',scope],['Registros exportados',Math.max(0,values.length-1)],['Atualização do inventário',document.getElementById('data-date')?.textContent||''],['Origem','Inventário | URE - Itapevi · SEINTEC']]);
    info['!cols']=[{wch:30},{wch:110}];lib.utils.book_append_sheet(wb,info,'Contexto');
    wb.Props={Title:title,Subject:scope,Author:'SEINTEC · URE Itapevi',CreatedDate:new Date()};
    const bytes=lib.write(wb,{type:'array',bookType:'xlsx',compression:true});
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const link=document.createElement('a');link.href=url;link.download=filename+'-'+dateStamp()+'.xlsx';link.hidden=true;
    (document.querySelector('dialog[open]')||document.body).append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    return wb;
  }
  window.inventoryExports={buildWorkbook,downloadTable};
})();
