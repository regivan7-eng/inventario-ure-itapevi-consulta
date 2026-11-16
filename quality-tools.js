(() => {
  // SheetJS reports literal Excel error text and formula evaluation errors alike.
  // Only the latter should prevent publishing the inventory base.
  const nativeBuildDashboardData = window.buildDashboardDataFromFiles;
  if (typeof nativeBuildDashboardData === 'function') {
    window.buildDashboardDataFromFiles = async function (files) {
      const dataset = await nativeBuildDashboardData(files);
      const formulaErrors = dataset?.qualidade?.erros_formula;
      if (Array.isArray(formulaErrors)) {
        dataset.qualidade.erros_formula = formulaErrors.filter(item => {
          const expression = String(item?.formula ?? '').trim();
          return expression && !/^#(?:REF!|VALUE!|NAME\?|DIV\/0!|N\/A|NUM!|NULL!|SPILL!|CALC!)$/i.test(expression);
        });
      }
      return dataset;
    };
  }

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalizeSearch = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  const addAvailableKpi = () => {
    if ($('kpi-available')) return;
    const ciesCard = $('kpi-cies')?.closest('.kpi-card');
    if (!ciesCard) return;
    const card = document.createElement('article');
    card.className = 'kpi-card available';
    card.innerHTML = '<div class="kpi-label">Disponíveis</div><div id="kpi-available" class="kpi-value">0</div><div class="kpi-note">prontos para uso</div>';
    ciesCard.after(card);
  };
  const baseRenderKpis = renderKpis;
  renderKpis = function () {
    addAvailableKpi();
    baseRenderKpis();
    $('kpi-available').textContent = fmt(filtered.filter(record => normalizeSearch(record.status) === 'disponivel').length);
  };
  renderCies = function () {
    const byCie = new Map();
    filtered.forEach(record => {
      const cie = textValue(record.cie) || 'N/I';
      if (!byCie.has(cie)) byCie.set(cie, { cie, escola: textValue(record.unidade), total: 0, disponiveis: 0, manutencao: 0, inservivel: 0, danificados: 0 });
      const item = byCie.get(cie);
      item.total += 1;
      if (normalizeSearch(record.status) === 'disponivel') item.disponiveis += 1;
      if (record.status === 'Em manutenção') item.manutencao += 1;
      if (record.status === 'Inservível') item.inservivel += 1;
      if (normalizeSearch(record.status) === 'danificado') item.danificados += 1;
    });
    const rows = window.schoolSort.rows('cies', [...byCie.values()].sort((a, b) => b.total - a.total).slice(0, 10), r => r.escola);
    $('cie-table').innerHTML = `<div class="rank-row cie-rank-row header"><span>CIE</span><span>${window.schoolSort.button("cies","Escola")}</span><span>Total</span><span>Dispon.</span><span>Manut.</span><span>Inserv.</span><span title="Equipamentos com status Danificado">Danif.</span><span title="Disponíveis ÷ total de equipamentos da escola">Disponib. %</span></div>${rows.map(item => `<div class="rank-row cie-rank-row"><span class="rank-cie">${escapeHtml(item.cie)}</span><span class="rank-ure" title="${escapeHtml(item.escola || '—')}">${escapeHtml(item.escola || '—')}</span><span>${fmt(item.total)}</span><span class="available-value">${fmt(item.disponiveis)}</span><span>${fmt(item.manutencao)}</span><span>${fmt(item.inservivel)}</span><span>${fmt(item.danificados)}</span><span class="cie-availability" title="${fmt(item.disponiveis)} disponíveis de ${fmt(item.total)} equipamentos">${new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(item.total ? item.disponiveis/item.total : 0)}</span></div>`).join('')}`;
    const container = $('cie-table').closest('.grid-2');
    if (container) {
      let insights = $('territorial-insights');
      if (!insights) {
        insights = document.createElement('aside');
        insights.id = 'territorial-insights';
        insights.className = 'panel territorial-insights';
        insights.setAttribute('aria-labelledby', 'territorial-insights-title');
        container.appendChild(insights);
      }
      const rankedTotal = rows.reduce((sum, row) => sum + row.total, 0);
      const share = filtered.length ? rankedTotal / filtered.length : 0;
      const shareLabel = new Intl.NumberFormat('pt-BR', {style:'percent', maximumFractionDigits:1}).format(share);
      const remainingSchools = Math.max(0, byCie.size - rows.length);
      const remainingRecords = filtered.length - rankedTotal;
      const noStatus = filtered.filter(record => ['', 'nao informado', 'nao informada', '-'].includes(normalizeSearch(record.status))).length;
      insights.innerHTML = `<div class="section-kicker">LEITURA DA COBERTURA</div><h2 id="territorial-insights-title">Além do ranking</h2><p class="panel-subtitle">Indicadores do mesmo recorte da tabela e do gráfico.</p><div class="territorial-focus"><span>${rows.length ? `Concentração do Top ${rows.length}` : 'Concentração do ranking'}</span><strong>${shareLabel}</strong><p>${fmt(rankedTotal)} de ${fmt(filtered.length)} equipamentos em ${fmt(rows.length)} ${rows.length === 1 ? 'escola' : 'escolas'} de maior volume.</p><div class="territorial-track" role="img" aria-label="${escapeHtml(shareLabel)} dos equipamentos nas escolas do ranking"><i style="width:${share * 100}%"></i></div></div><dl class="territorial-facts"><div><dt>Demais escolas</dt><dd>${fmt(remainingSchools)}</dd><small>${fmt(remainingRecords)} equipamentos fora do ranking</small></div><div><dt>Sem situação informada</dt><dd>${fmt(noStatus)}</dd><small>Registros que precisam de conferência cadastral</small></div></dl><p class="territorial-note">O ranking mostra até dez CIEs; o gráfico por frente considera todos os equipamentos selecionados. Os indicadores acompanham os filtros.</p>`;
    }
  };
  populateFilters = function () {
    const cieSchools = new Map();
    DATA.records.forEach(record => {
      const cie = textValue(record.cie);
      if (!cie) return;
      if (!cieSchools.has(cie)) cieSchools.set(cie, new Set());
      if (textValue(record.unidade)) cieSchools.get(cie).add(textValue(record.unidade));
    });
    filterState.delete('filter-unit');
    $('filter-unit-trigger')?.closest('.multi-filter')?.remove();
    [['filter-cie', 'Todas as escolas', DATA.records.map(r => r.cie)], ['filter-category', 'Todas as categorias', DATA.records.map(r => r.categoria)], ['filter-status', 'Todos os status', DATA.records.map(r => r.status)]].forEach(([id, label, values]) => {
      const menu = $(`${id}-menu`), trigger = $(`${id}-trigger`);
      const unique = [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      filterState.set(id, []);
      menu.innerHTML = '';
      const search = document.createElement('input');
      search.className = 'multi-filter-search';
      search.type = 'search';
      search.placeholder = id === 'filter-cie' ? 'Nome da escola ou CIE' : 'Pesquisar...';
      search.setAttribute('aria-label', id === 'filter-cie' ? 'Pesquisar escola por nome ou CIE' : `Pesquisar em ${label.toLowerCase()}`);
      const options = document.createElement('div');
      options.className = 'multi-filter-options';
      unique.forEach(value => {
        const schools = id === 'filter-cie' ? [...(cieSchools.get(value) || [])].sort((a, b) => a.localeCompare(b, 'pt-BR')).join(' / ') : '';
        const display = schools ? `${value} — ${schools}` : value;
        const option = document.createElement('label');
        option.className = 'multi-filter-option';
        option.dataset.label = normalizeSearch(display);
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = value;
        const text = document.createElement('span');
        text.textContent = display;
        option.append(input, text);
        options.appendChild(option);
      });
      menu.append(search, options);
      trigger.onclick = event => { event.stopPropagation(); const open = menu.hidden; closeFilterMenus(menu); menu.hidden = !open; trigger.setAttribute('aria-expanded', String(open)); if (open) search.focus(); };
      options.onchange = event => { if (!event.target.matches('input[type="checkbox"]')) return; filterState.set(id, [...options.querySelectorAll('input:checked')].map(input => input.value)); updateFilterTrigger(id, label); apply(); };
      search.oninput = () => { const query = normalizeSearch(search.value); options.querySelectorAll('.multi-filter-option').forEach(option => { option.hidden = Boolean(query && !option.dataset.label.includes(query)); }); };
      updateFilterTrigger(id, label);
    });
  };


  // Presentation only: retain the original filename in the row's tooltip.
  const sourceSchoolLabel = item => {
    const raw = textValue(item.escola) || textValue(item.arquivo);
    return raw.replace(/\.(xlsx|xls|csv)$/i, '')
      .replace(/^\s*\d+\s*[-–—_]\s*/, '')
      .replace(/\s*[-–—_]\s*INVENT[ÁAÃ]RIO(?:\s*\(\d+\))?\s*$/i, '')
      .trim() || 'Escola não identificada';
  };

  let sourceExpanded=false,sourceRowsReference;
  function fitSourceSpace(){
    const panel=$('sources'),peer=$('quality'),grid=$('source-school-rows');
    if(!panel||!grid)return;
    const items=[...grid.querySelectorAll('.source-row-detail:not(.header)')],scroll=$('source-table').querySelector('.source-scroll');
    items.forEach(item=>{item.hidden=false;});
    panel.style.minHeight='';
    panel.dataset.sourcesExpanded=String(sourceExpanded);
    if(scroll)scroll.style.maxHeight='';
    let limit=sourceExpanded?items.length:12;
    if(items.length>12&&peer&&scroll&&window.matchMedia('(min-width:1800px)').matches){
      const peerHeight=peer.getBoundingClientRect().height;
      if(peerHeight>0){
        const panelRect=panel.getBoundingClientRect(),first=items[0].getBoundingClientRect(),last=items[items.length-1].getBoundingClientRect();
        const tailHeight=panelRect.bottom-last.bottom;
        const budget=peerHeight-(first.top-panelRect.top)-tailHeight-2;
        if(sourceExpanded){
          scroll.style.maxHeight=Math.max(160,budget+first.top-scroll.getBoundingClientRect().top)+'px';
        }else{
          limit=0;
          for(const item of items){if(item.getBoundingClientRect().bottom-first.top>budget)break;limit++;}
          limit=Math.max(1,Math.min(limit,items.length-1));
        }
        panel.style.minHeight=peerHeight+'px';
      }
    }
    items.forEach((item,index)=>{item.hidden=index>=limit;});
  }
  let sourceFitFrame;
  function scheduleSourceFit(){
    cancelAnimationFrame(sourceFitFrame);
    sourceFitFrame=requestAnimationFrame(fitSourceSpace);
  }
  renderSources = function () {
    const sourceCount = $('source-count');
    const table = $('source-table');
    if (!table) return;
    if(sourceRowsReference!==filtered){sourceRowsReference=filtered;sourceExpanded=false;}
    const sections = [
      ['Equipamentos de Hardware', 'Hardware'],
      ['TVs e Educatrons', 'TVs e Educatrons'],
      ['Plataforma de Recarga', 'Plataforma de Recarga'],
      ['Equipamentos de Rede', 'Equipamentos de Rede']
    ];
    const byFile = new Map();
    filtered.forEach(record => {
      const filename = textValue(record.arquivo) || 'Arquivo não identificado';
      if (!byFile.has(filename)) byFile.set(filename, { arquivo: filename, escola: textValue(record.unidade), total: 0, secoes: new Map() });
      const item = byFile.get(filename);
      item.total += 1;
      const section = textValue(record.aba);
      item.secoes.set(section, (item.secoes.get(section) || 0) + 1);
    });
    const scopedSchools=new Set(window.inventoryScopedSchoolCies?.()||filtered.map(record=>textValue(record.cie)));
    for(const school of DATA.schools||[])if(school.sem_dados&&scopedSchools.has(school.cie))for(const filename of school.files||[])if(!byFile.has(filename))byFile.set(filename,{arquivo:filename,escola:school.name,total:0,secoes:new Map()});
    const rows = [...byFile.values()].sort((a, b) => (a.escola || a.arquivo).localeCompare(b.escola || b.arquivo, 'pt-BR'));
    sourceCount.textContent = `${fmt(rows.length)} arquivo(s)`;
    const columns = `minmax(300px,1fr) 80px repeat(${sections.length},120px)`;
    const header = `<div class="source-row source-row-detail header" style="grid-template-columns:${columns}"><span>Escola</span><span>Registros</span>${sections.map(([, label]) => `<span>${escapeHtml(label)}</span>`).join('')}</div>`;
    const visibleRows=rows;
    const detail = visibleRows.map(item => {
      const name = sourceSchoolLabel(item);
      return `<div class="source-row source-row-detail" style="grid-template-columns:${columns}"><span class="source-name" title="${escapeHtml(item.arquivo)}">${escapeHtml(name)}</span><span>${fmt(item.total)}</span>${sections.map(([section]) => `<span class="source-category-count">${fmt(item.secoes.get(section) || 0)}</span>`).join('')}</div>`;
    }).join('');
    const schools = scopedSchools;
    const distribution = sections.map(([section, label]) => ({
      label, total: filtered.filter(record => textValue(record.aba) === section).length
    }));
    const other = filtered.length - distribution.reduce((sum, item) => sum + item.total, 0);
    if (other > 0) distribution.push({label: 'Outras abas', total: other});
    const summary = `<aside class="source-summary" aria-label="Resumo das fontes filtradas"><div class="section-kicker">NO RECORTE ATUAL</div><h3>Cobertura das fontes</h3><dl class="source-summary-metrics"><div><dt>Arquivos</dt><dd>${fmt(rows.length)}</dd></div><div><dt>Escolas / CIEs</dt><dd>${fmt(schools.size)}</dd></div><div><dt>Registros</dt><dd>${fmt(filtered.length)}</dd></div></dl><h4>Registros por frente</h4><div class="source-distribution">${distribution.map(item => {
      const share = filtered.length ? item.total / filtered.length * 100 : 0;
      return `<div><div class="source-distribution-label"><span>${escapeHtml(item.label)}</span><strong>${fmt(item.total)}</strong></div><div class="source-distribution-track" aria-hidden="true"><i style="width:${share}%"></i></div></div>`;
    }).join('')}</div><p>Os totais acompanham os filtros. Um arquivo pode reunir registros de várias frentes; a contagem de escolas considera CIEs distintos.</p></aside>`;
    const metrics = summary.match(/<dl class="source-summary-metrics">[\s\S]*?<\/dl>/)?.[0] || '';
    table.innerHTML = `<div class="source-layout"><div class="source-overview" aria-label="Cobertura da base">${metrics}</div><div class="source-detail"><div class="source-scroll" tabindex="0" role="region" aria-label="Detalhamento dos arquivos de origem"><div class="source-grid" id="source-school-rows">${header}${detail || '<div class="source-empty">Nenhum arquivo corresponde aos filtros atuais.</div>'}</div></div>${rows.length>12?'<button type="button" id="source-expand" class="ghost-btn list-expand" data-source-expand aria-controls="source-school-rows" aria-expanded="'+sourceExpanded+'">'+(sourceExpanded?'Mostrar menos':'Ver todas as escolas ('+fmt(rows.length)+')')+'</button>':''}</div>${summary.replace(metrics,'')}</div>`;
    fitSourceSpace();
  };

  if(typeof ResizeObserver!=='undefined'&&$('quality')){
    const sourceSizeObserver=new ResizeObserver(scheduleSourceFit);
    sourceSizeObserver.observe($('quality'));
  }
  window.addEventListener('resize',scheduleSourceFit);
  $('source-table')?.addEventListener('click',event=>{
    if(!event.target.closest('[data-source-expand]'))return;
    sourceExpanded=!sourceExpanded;renderSources();
    $('source-expand')?.focus({preventScroll:true});
  });

  const baseApply = apply;
  apply = function () {
    baseApply();
    renderSources();
  };

  const style = document.createElement('style');
  style.textContent = `.kpi-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.kpi-card.available{border-top-color:#1ca36c}.kpi-card.available .kpi-label:before{content:'✓';display:inline-grid;place-items:center;width:17px;height:17px;margin-right:7px;border-radius:5px;background:#def7e9;color:#157347;font-size:11px;font-weight:900;vertical-align:-3px}@media(max-width:1100px){.kpi-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:720px){.kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}.inventory-duplicate-label{display:block;margin-bottom:6px;color:#6e7d91;font-size:10px;font-weight:700}.inventory-duplicate-search{width:100%;margin-bottom:9px;padding:8px 9px;border:1px solid #e5eaf1;border-radius:7px;color:#142235;font-size:11px;outline:0}.inventory-duplicate-search:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.08)}.inventory-duplicate-row{display:grid;grid-template-columns:minmax(110px,.8fr) 55px minmax(180px,1.7fr);gap:10px;align-items:start;padding:9px 11px;border-bottom:1px solid #e5eaf1;font-size:11px}.inventory-duplicate-row:last-child{border-bottom:0}.inventory-duplicate-head{font-size:9px;text-transform:uppercase;color:#91a0b1;font-weight:800;background:#fafbfd}.inventory-duplicate-row>span:nth-child(2){text-align:right;font-weight:700}.inventory-duplicate-serial{font-weight:800;word-break:break-word}.inventory-duplicate-schools{display:flex;flex-wrap:wrap;gap:5px}.inventory-duplicate-school{border:0;border-radius:5px;background:#eaf0ff;color:#1d4ed8;padding:3px 5px;font:inherit;font-size:10px;line-height:1.25;cursor:pointer;text-align:left}.inventory-duplicate-school:hover{background:#dbe7ff}.source-scroll{overflow-x:auto;padding:3px 0 5px;border:1px solid #e6edf5;border-radius:10px;background:#fff}.source-grid{min-width:100%}.source-row-detail{min-width:960px;min-height:46px;align-items:center;transition:background .16s ease}.source-row-detail.header{min-height:42px;background:#f6f9fd;border-bottom:1px solid #dfe7f1}.source-row-detail:not(.header):hover{background:#f8fbff}.source-row-detail>span{display:flex;align-items:center;justify-content:center;text-align:center;font-variant-numeric:tabular-nums}.source-row-detail .source-name{padding:0 14px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#516984}.source-row-detail>span:nth-child(n+3){color:#1d4f86;font-weight:700}.source-row-detail.header>span{color:#41638d;font-size:9px;letter-spacing:.045em}.source-empty{padding:18px 10px;color:#718096;font-size:12px;text-align:center}@media(max-width:720px){.inventory-duplicate-row{grid-template-columns:1fr 45px}.inventory-duplicate-row>span:nth-child(3){grid-column:1 / -1}.inventory-duplicate-head>span:nth-child(3){display:none}}`;
  document.head.appendChild(style);
  const cieStyle = document.createElement('style');
  cieStyle.textContent = `.cie-rank-row{grid-template-columns:44px minmax(160px,1fr) 65px 78px 65px 65px}.cie-rank-row span:nth-last-child(-n+4){text-align:right;font-variant-numeric:tabular-nums}.cie-rank-row .available-value{color:#157347;font-weight:800}@media(max-width:720px){.cie-rank-row{grid-template-columns:42px minmax(120px,1fr) 52px 58px}.cie-rank-row span:nth-child(5),.cie-rank-row span:nth-child(6){display:none}}`;
  document.head.appendChild(cieStyle);
})();
