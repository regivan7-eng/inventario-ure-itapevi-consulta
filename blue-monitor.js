(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const format = value => new Intl.NumberFormat('pt-BR').format(value);
  const text = value => String(value ?? '').trim();
  const escapeHtml = value => text(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalizedSerial = value => text(value).toUpperCase().replace(/[\s\-_.\/]/g, '');
  const placeholders = new Set(['', 'SN', 'N/A', 'NA', 'NOC', 'NAOCONSTA', 'NÃOCONSTA', 'SEMSERIAL', 'S/N', '0']);
  const validSerial = value => !placeholders.has(normalizedSerial(value));
  const sourceColumns = ['Serial Number', 'Device Name', 'Unit Name', 'Unit CIE Code', 'Last Sync', 'Status', 'City', 'Usage Type', 'Model', 'Client Image Version', 'Device UUID', 'Type'];
  const typeOrder = ['Chromebook Samsung', 'Desktop Lenovo', 'Notebook Lenovo', 'Desktop Legado', 'Ultra', 'Notebook avançado', 'Notebook básico', 'Notebook sala de aula', 'Outros / não identificado'];
  const selectedTypes = new Set();
  const selectedMatchTypes = new Set();
  let blue = [], inventory = [], matches = [], visibleDevices = [], visibleMatches = [];
  let devicePage = 1, matchPage = 1;
  const pageSize = 25;

  const parseCsv = input => window.blueMonitorCsv.parse(input);

  function syncDate(value) {
    const part = text(value).match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (!part) return null;
    const date = new Date(+part[3], +part[2] - 1, +part[1], +part[4], +part[5], +part[6]);
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  function daysSince(value) {
    const date = syncDate(value);
    return date ? Math.max(0, (Date.now() - date.valueOf()) / 86400000) : Infinity;
  }
  function priority(record) {
    const status = text(record['Status']).toLowerCase();
    if (['inservivel', 'desativado', 'aguardando manutencao'].includes(status)) return {label:'Crítica', className:'danger', score:3};
    if (status === 'desconhecido' || daysSince(record['Last Sync']) > 30) return {label:'Alta', className:'danger', score:2};
    if (daysSince(record['Last Sync']) > 7) return {label:'Atenção', className:'warn', score:1};
    return {label:'Normal', className:'neutral', score:0};
  }
  function equipmentType(record) {
    const desktop=window.dashboardClassification.desktopCategory(record);if(desktop)return desktop;
    if (window.dashboardClassification.isSamsungChromebook(record)) return 'Chromebook Samsung';
    if (window.dashboardClassification.isLenovoDesktop(record)) return 'Desktop Lenovo';
    if (window.dashboardClassification.isLenovoNotebook(record)) return 'Notebook Lenovo';
    const model = text(record.Model).toUpperCase();
    const nativeType = text(record.Type).toUpperCase();
    const identifier = `${model} ${nativeType}`;
    if (/\bUL150\b/.test(identifier)) return 'Ultra';
    if (/^(11JA|11AA|M11JA)/.test(model) || /\bTHINK\s*CENTRE\b/.test(identifier) || /\bM75S\b/.test(model)) return 'Desktop Lenovo';
    if (/\b(PRODESK|DC2A-S|D570|OPTIPLEX)\b/.test(identifier)) return 'Desktop Lenovo';
    if (/^20X2/.test(model)) return 'Notebook avançado';
    if (/^MLGW/.test(model)) return 'Notebook básico';
    if (/^(N1110|MLSE|POSITIVO MASTER N1110|POSITIVO MASTER N1210)/.test(model)) return 'Notebook sala de aula';
    return 'Outros / não identificado';
  }
  const inventoryModel = record => text(record.MODELO || record.Modelo || record.modelo);
  function inventoryEquipmentType(record) {
    return window.dashboardClassification.inventoryCategory(record) || 'Não informado';
  }
  function metric(label, value, className = '') {
    return `<div class="bm-metric ${className}"><small>${label}</small><strong>${format(value)}</strong></div>`;
  }
  function options(id, values, allLabel, labels = {}) {
    const select = byId(id), previous = select.value;
    const unique = [...new Set(values.map(text).filter(Boolean))].sort((a, b) => id === 'bm-sync' ? Number(a) - Number(b) : a.localeCompare(b, 'pt-BR'));
    select.replaceChildren(new Option(allLabel, ''), ...unique.map(value => new Option(labels[value] || value, value)));
    select.value = unique.includes(previous) ? previous : '';
  }
  function setBlue(rows, description) {
    blue = rows.map(row=>({...row,'Unit Name':window.inventorySchoolNames?.display(row['Unit Name'])??row['Unit Name']}));
    byId('bm-source').textContent = `${description} · ${format(rows.length)} equipamentos`;
    filterDevices();
    compareSerials();
  }
  function refreshTypeOptions() {
    const available = new Map();
    for (const record of blue) {
      if (!deviceMatches(record, 'bm-type')) continue;
      const type = equipmentType(record);
      available.set(type, (available.get(type) || 0) + 1);
    }
    byId('bm-type-menu').replaceChildren(...typeOrder.filter(type => available.has(type)).map(type => {
      const label = document.createElement('label');
      label.className = 'bm-type-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.value = type; checkbox.checked = selectedTypes.has(type);
      const caption = document.createElement('span');
      caption.textContent = `${type} (${format(available.get(type) || 0)})`;
      label.append(checkbox, caption);
      return label;
    }));
    const trigger = byId('bm-type-trigger');
    trigger.textContent = selectedTypes.size === 0 ? 'Todos os tipos de equipamento' : selectedTypes.size === 1 ? [...selectedTypes][0] : `${selectedTypes.size} tipos selecionados`;
  }
  function renderSummary(rows) {
    const count = status => rows.filter(record => record.Status === status).length;
    byId('bm-kpis').innerHTML = metric('Equipamentos filtrados', rows.length) + metric('Ativos', count('Ativo'), 'ok') + metric('Status desconhecido', count('Desconhecido'), 'warn') + metric('Sem sincronização há mais de 7 dias', rows.filter(x => daysSince(x['Last Sync']) > 7).length, 'warn') + metric('Sem sincronização há mais de 30 dias', rows.filter(x => daysSince(x['Last Sync']) > 30).length, 'danger') + metric('Aguardando manutenção', count('Aguardando Manutencao'), 'danger');
  }
  function deviceMatches(record, except = '') {
    const query = text(byId('bm-search').value).toLocaleUpperCase('pt-BR');
    const city = byId('bm-city').value, unit = byId('bm-unit').value, status = byId('bm-status').value, usage = byId('bm-usage').value;
    const sync = Number(byId('bm-sync').value);
    return (except === 'bm-search' || !query || [record['Serial Number'], record['Device Name'], record['Unit Name'], record['Unit CIE Code']].join(' ').toLocaleUpperCase('pt-BR').includes(query)) &&
      (except === 'bm-city' || !city || record.City === city) &&
      (except === 'bm-unit' || !unit || record['Unit Name'] === unit) &&
      (except === 'bm-status' || !status || record.Status === status) &&
      (except === 'bm-usage' || !usage || record['Usage Type'] === usage) &&
      (except === 'bm-sync' || !sync || daysSince(record['Last Sync']) > sync) &&
      (except === 'bm-type' || selectedTypes.size === 0 || selectedTypes.has(equipmentType(record)));
  }
  function refreshDeviceOptions() {
    const facets = [
      ['bm-city', 'City', 'Todos os municípios'],
      ['bm-unit', 'Unit Name', 'Todas as unidades'],
      ['bm-status', 'Status', 'Todos os status'],
      ['bm-usage', 'Usage Type', 'Todos os tipos de uso'],
    ];
    for (const [id, field, label] of facets) options(id, blue.filter(record => deviceMatches(record, id)).map(record => record[field]), label);
    const syncRows = blue.filter(record => deviceMatches(record, 'bm-sync'));
    options('bm-sync', [syncRows.some(record => daysSince(record['Last Sync']) > 7) ? '7' : '', syncRows.some(record => daysSince(record['Last Sync']) > 30) ? '30' : ''], 'Qualquer sincronização', {'7':'Há mais de 7 dias','30':'Há mais de 30 dias'});
    refreshTypeOptions();
  }
  function reconcileFacets(rows, facets, typeId, selected, changedId) {
    const state=new Map(facets.map(f=>[f.id,f.id===typeId?[...selected]:[byId(f.id).value].filter(Boolean)]));
    const result=window.inventoryFacets.resolve(rows,facets,state,changedId);
    for(const facet of facets) {
      const values=result.selected.get(facet.id);
      if(facet.id===typeId){selected.clear();values.forEach(value=>selected.add(value));}
      else byId(facet.id).value=values[0]||'';
    }
    if(result.removed){let notice=byId(typeId+'-notice');if(!notice){notice=document.createElement('p');notice.id=typeId+'-notice';notice.className='context-filter-notice';notice.setAttribute('role','status');byId(typeId+'-filter').closest('.bm-filters').after(notice);}notice.textContent='Seleções incompatíveis foram removidas para acompanhar o contexto atual.';notice.hidden=false;}
    else{const notice=byId(typeId+'-notice');if(notice)notice.hidden=true;}
  }
  function filterDevices(event) {
    const query=text(byId('bm-search').value).toLocaleUpperCase('pt-BR');
    reconcileFacets(blue.filter(record=>!query||[record['Serial Number'],record['Device Name'],record['Unit Name'],record['Unit CIE Code']].join(' ').toLocaleUpperCase('pt-BR').includes(query)),[
      {id:'bm-city',field:'City'},{id:'bm-unit',field:'Unit Name'},{id:'bm-status',field:'Status'},{id:'bm-usage',field:'Usage Type'},
      {id:'bm-sync',field:record=>['7','30'].filter(days=>daysSince(record['Last Sync'])>Number(days))},{id:'bm-type',field:equipmentType}
    ],'bm-type',selectedTypes,event?.target?.closest('#bm-type-menu')?'bm-type':event?.target?.id);
    visibleDevices = blue.filter(record => deviceMatches(record))
      .sort((a, b) => priority(b).score - priority(a).score || daysSince(b['Last Sync']) - daysSince(a['Last Sync']));
    refreshDeviceOptions();
    renderSummary(visibleDevices);
    devicePage = 1; renderDevicePage();
  }
  window.addEventListener('school-sort', event => { if(event.detail === 'devices') { devicePage = 1; renderDevicePage(); } if(event.detail === 'matches') { matchPage = 1; renderMatchPage(); } });
  function renderDevicePage() {
    const max = Math.max(1, Math.ceil(visibleDevices.length / pageSize));
    devicePage = Math.min(Math.max(1, devicePage), max);
    const first = (devicePage - 1) * pageSize;
    const rows = window.schoolSort.rows('devices', visibleDevices, r => r['Unit Name']).slice(first, first + pageSize);
    byId('bm-count').textContent = `${format(visibleDevices.length)} de ${format(blue.length)} equipamentos`;
    byId('bm-device-total').textContent = format(visibleDevices.length);
    byId('bm-device-rows').innerHTML = rows.map(record => {
      const level = priority(record);
      return `<tr><td><strong>${escapeHtml(record['Unit Name'] || '—')}</strong><small>CIE ${escapeHtml(record['Unit CIE Code'] || '—')}</small></td><td><strong>${escapeHtml(equipmentType(record))}</strong><small>Modelo ${escapeHtml(record.Model || 'não informado')}</small></td><td><strong>${escapeHtml(record['Device Name'] || '—')}</strong><small>${escapeHtml(record['Serial Number'] || 'Sem serial')}</small></td><td>${escapeHtml(record.City || '—')}</td><td>${escapeHtml(record.Status || '—')}</td><td>${escapeHtml(record['Last Sync'] || 'Sem data')}</td><td><span class="bm-pill ${level.className}">${level.label}</span></td></tr>`;
    }).join('') || '<tr><td colspan="7" class="bm-empty">Nenhum equipamento para os filtros selecionados.</td></tr>';
    byId('bm-device-page-info').textContent = `${visibleDevices.length ? format(first + 1) : 0}–${format(Math.min(first + pageSize, visibleDevices.length))} de ${format(visibleDevices.length)}`;
    byId('bm-device-prev').disabled = devicePage === 1;
    byId('bm-device-next').disabled = devicePage === max;
  }
  function compareSerials() {
    const blueBySerial = new Map();
    for (const record of blue) {
      if (!validSerial(record['Serial Number'])) continue;
      const key = normalizedSerial(record['Serial Number']);
      if (!blueBySerial.has(key)) blueBySerial.set(key, []);
      blueBySerial.get(key).push(record);
    }
    matches = inventory.map(record => {
      const serial = text(record.serial);
      const hits = validSerial(serial) ? (blueBySerial.get(normalizedSerial(serial)) || []) : [];
      const result = !validSerial(serial) ? 'no-serial' : hits.length > 1 ? 'multiple' : hits.length === 1 ? 'match' : 'missing';
      return {record, hits, result};
    });
    byId('bm-inv-source').textContent = inventory.length ? `${format(inventory.length)} registros do inventário atual` : 'Aguardando inventário';
    filterMatches();
  }
  function matchMatches(item, except = '') {
    const query = text(byId('bm-match-search').value).toLocaleUpperCase('pt-BR');
    const result = byId('bm-match-filter').value, school = byId('bm-match-school').value;
    const record = item.record;
    return (except === 'bm-match-filter' || !result || item.result === result) &&
      (except === 'bm-match-school' || !school || record.unidade === school) &&
      (except === 'bm-match-type' || selectedMatchTypes.size === 0 || selectedMatchTypes.has(inventoryEquipmentType(record))) &&
      (except === 'bm-match-search' || !query || [record.serial, record.unidade, record.cie, record.categoria, inventoryModel(record)].join(' ').toLocaleUpperCase('pt-BR').includes(query));
  }
  function refreshMatchTypeOptions() {
    const available = new Map();
    for (const item of matches) {
      if (!matchMatches(item, 'bm-match-type')) continue;
      const type = inventoryEquipmentType(item.record);
      available.set(type, (available.get(type) || 0) + 1);
    }
    const ordered = [...available.keys()].sort((a, b) => {
      const aOrder = typeOrder.indexOf(a), bOrder = typeOrder.indexOf(b);
      return (aOrder < 0 ? 100 : aOrder) - (bOrder < 0 ? 100 : bOrder) || a.localeCompare(b, 'pt-BR');
    });
    byId('bm-match-type-menu').replaceChildren(...ordered.map(type => {
      const label = document.createElement('label'); label.className = 'bm-type-option';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = type; checkbox.checked = selectedMatchTypes.has(type);
      const caption = document.createElement('span'); caption.textContent = `${type} (${format(available.get(type) || 0)})`;
      label.append(checkbox, caption);
      return label;
    }));
    byId('bm-match-type-trigger').textContent = selectedMatchTypes.size === 0 ? 'Todos os equipamentos' : selectedMatchTypes.size === 1 ? [...selectedMatchTypes][0] : `${selectedMatchTypes.size} tipos selecionados`;
  }
  function refreshMatchOptions() {
    const labels = {match:'Encontrado', missing:'Não encontrado', multiple:'Múltiplos no Blue Monitor', 'no-serial':'Sem serial válido'};
    options('bm-match-filter', matches.filter(item => matchMatches(item, 'bm-match-filter')).map(item => item.result), 'Todos os resultados', labels);
    options('bm-match-school', matches.filter(item => matchMatches(item, 'bm-match-school')).map(item => item.record.unidade), 'Todas as escolas');
    refreshMatchTypeOptions();
  }
  function renderMatchSummary(rows) {
    const count = result => rows.filter(item => item.result === result).length;
    byId('bm-match-kpis').innerHTML = metric('Registros filtrados', rows.length) + metric('Encontrados', count('match'), 'ok') + metric('Não encontrados', count('missing'), 'danger') + metric('Múltiplos no Blue Monitor', count('multiple'), 'warn') + metric('Sem serial válido', count('no-serial'), 'warn');
  }
  function filterMatches(event) {
    const query=text(byId('bm-match-search').value).toLocaleUpperCase('pt-BR');
    reconcileFacets(matches.filter(item=>!query||[item.record.serial,item.record.unidade,item.record.cie,item.record.categoria,inventoryModel(item.record)].join(' ').toLocaleUpperCase('pt-BR').includes(query)),[
      {id:'bm-match-school',field:item=>item.record.unidade},{id:'bm-match-filter',field:'result'},{id:'bm-match-type',field:item=>inventoryEquipmentType(item.record)}
    ],'bm-match-type',selectedMatchTypes,event?.target?.closest('#bm-match-type-menu')?'bm-match-type':event?.target?.id);
    visibleMatches = matches.filter(item => matchMatches(item));
    refreshMatchOptions();
    renderMatchSummary(visibleMatches);
    matchPage = 1; renderMatchPage();
  }
  function renderMatchPage() {
    const max = Math.max(1, Math.ceil(visibleMatches.length / pageSize));
    matchPage = Math.min(Math.max(1, matchPage), max);
    const first = (matchPage - 1) * pageSize;
    const rows = window.schoolSort.rows('matches', visibleMatches, r => r.record.unidade).slice(first, first + pageSize);
    const labels = {'match':['Encontrado',''], 'missing':['Não encontrado','danger'], 'multiple':['Múltiplos','warn'], 'no-serial':['Sem serial','neutral']};
    byId('bm-match-rows').innerHTML = rows.map(item => {
      const r = item.record, label = labels[item.result];
      return `<tr><td><strong>${escapeHtml(r.unidade || '—')}</strong><small>CIE ${escapeHtml(r.cie || '—')}</small></td><td><strong>${escapeHtml(inventoryEquipmentType(r))}</strong><small>Modelo ${escapeHtml(inventoryModel(r) || 'não informado')}</small></td><td><strong>${escapeHtml(r.serial || '—')}</strong></td><td>${escapeHtml(r.status || 'Não informado')}</td><td><span class="bm-pill ${label[1]}">${label[0]}</span></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="bm-empty">Nenhum registro para os filtros selecionados.</td></tr>';
    byId('bm-match-total').textContent = format(visibleMatches.length);
    byId('bm-match-page-info').textContent = `${visibleMatches.length ? format(first + 1) : 0}–${format(Math.min(first + pageSize, visibleMatches.length))} de ${format(visibleMatches.length)}`;
    byId('bm-match-prev').disabled = matchPage === 1;
    byId('bm-match-next').disabled = matchPage === max;
  }
  function downloadMatches() {
    const headers = ['Escola inventariada', 'CIE inventariado', 'Tipo de equipamento', 'Modelo inventariado', 'Serial inventariado', 'Situação no inventário', 'Resultado', 'Arquivo', 'Aba', 'Dispositivo Blue Monitor', 'Unidade Blue Monitor', 'CIE Blue Monitor', 'Município Blue Monitor', 'Última sincronização'];
    const label = {match:'Encontrado', missing:'Não encontrado', multiple:'Múltiplos no Blue Monitor', 'no-serial':'Sem serial válido'};
    const quote = value => `"${text(value).replace(/"/g, '""')}"`;
    const lines = [headers, ...visibleMatches.map(({record:r, hits, result}) => [r.unidade, r.cie, inventoryEquipmentType(r), inventoryModel(r), r.serial, r.status, label[result], r.arquivo, r.aba, hits[0]?.['Device Name'], hits[0]?.['Unit Name'], hits[0]?.['Unit CIE Code'], hits[0]?.City, hits[0]?.['Last Sync']])];
    window.inventoryExports.downloadTable(lines,{filename:'conferencia-inventario-blue-monitor',sheetName:'Conferência',title:'Conferência do inventário com Blue Monitor',scope:'Todas as páginas da conferência, respeitando os filtros e a seleção atuais.',widths:[52,17,32,32,28,24,28,70,32,38,52,18,25,28]});
  }
  window.refreshBlueMonitor = data => {
    inventory = Array.isArray(data?.records) ? data.records : [];
    compareSerials();
  };
  if (typeof DATA !== 'undefined' && DATA) window.refreshBlueMonitor(DATA);
  for (const id of ['bm-search', 'bm-city', 'bm-unit', 'bm-status', 'bm-usage', 'bm-sync']) byId(id).addEventListener('input', filterDevices);
  byId('bm-type-trigger').addEventListener('click', () => {
    const menu = byId('bm-type-menu');
    menu.hidden = !menu.hidden;
    byId('bm-type-trigger').setAttribute('aria-expanded', String(!menu.hidden));
  });
  byId('bm-match-type-trigger').addEventListener('click', () => {
    const menu = byId('bm-match-type-menu');
    menu.hidden = !menu.hidden;
    byId('bm-match-type-trigger').setAttribute('aria-expanded', String(!menu.hidden));
  });
  byId('bm-type-menu').addEventListener('change', event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    if (event.target.checked) selectedTypes.add(event.target.value);
    else selectedTypes.delete(event.target.value);
    filterDevices(event);
  });
  byId('bm-match-type-menu').addEventListener('change', event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    if (event.target.checked) selectedMatchTypes.add(event.target.value);
    else selectedMatchTypes.delete(event.target.value);
    filterMatches(event);
  });
  document.addEventListener('click', event => {
    for (const [filterId, menuId, triggerId] of [['bm-type-filter', 'bm-type-menu', 'bm-type-trigger'], ['bm-match-type-filter', 'bm-match-type-menu', 'bm-match-type-trigger']]) {
      if (event.target.closest(`#${filterId}`)) continue;
      byId(menuId).hidden = true;
      byId(triggerId).setAttribute('aria-expanded', 'false');
    }
  });
  for (const [filterId, menuId, triggerId] of [['bm-type-filter', 'bm-type-menu', 'bm-type-trigger'], ['bm-match-type-filter', 'bm-match-type-menu', 'bm-match-type-trigger']]) {
    byId(filterId).addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      byId(menuId).hidden = true;
      byId(triggerId).setAttribute('aria-expanded', 'false');
      byId(triggerId).focus();
    });
  }
  for (const id of ['bm-match-search', 'bm-match-filter', 'bm-match-school']) byId(id).addEventListener('input', filterMatches);
  byId('bm-match-clear').addEventListener('click', () => { for (const id of ['bm-match-search', 'bm-match-filter', 'bm-match-school']) byId(id).value = ''; selectedMatchTypes.clear(); filterMatches(); });
  byId('bm-clear').addEventListener('click', () => { for (const id of ['bm-search', 'bm-city', 'bm-unit', 'bm-status', 'bm-usage', 'bm-sync']) byId(id).value = ''; selectedTypes.clear(); filterDevices(); });
  byId('bm-device-prev').addEventListener('click', () => { devicePage--; renderDevicePage(); });
  byId('bm-device-next').addEventListener('click', () => { devicePage++; renderDevicePage(); });
  byId('bm-match-prev').addEventListener('click', () => { matchPage--; renderMatchPage(); });
  byId('bm-match-next').addEventListener('click', () => { matchPage++; renderMatchPage(); });
  byId('bm-export').addEventListener('click', downloadMatches);
  const priorityLegend=document.createElement('details');
  priorityLegend.className='page-explanatory-notes';
  priorityLegend.innerHTML='<summary>Notas explicativas</summary><h3>Status e Prioridade</h3><p><strong>Status</strong> é a situação informada no arquivo Blue Monitor, como Ativo, Desconhecido, Desativado ou Aguardando manutenção. <strong>Prioridade</strong> é calculada pelo painel para orientar a conferência.</p><dl><div><dt>Crítica</dt><dd>Status Inservível, Desativado ou Aguardando manutenção.</dd></div><div><dt>Alta</dt><dd>Status Desconhecido, mais de 30 dias sem sincronizar ou data de sincronização ausente/inválida.</dd></div><div><dt>Atenção</dt><dd>Mais de 7 até 30 dias sem sincronizar, sem condição de prioridade maior.</dd></div><div><dt>Normal</dt><dd>Sincronização nos últimos 7 dias, sem as condições anteriores.</dd></div></dl><p>Prevalece a prioridade mais alta. Um dispositivo Ativo pode ter prioridade Alta por estar há mais de 30 dias sem sincronizar. A prioridade indica necessidade de conferência; não comprova defeito.</p><h3>Conferência entre bases</h3><p>A comparação usa o número de série e ignora espaços, hífens, pontos e barras. Ausência de correspondência exige conferência das duas bases e não comprova, sozinha, ausência física do equipamento. Atualizar o Blue Monitor substitui somente a base de monitoramento; o inventário permanece separado.</p>';
  function appendPageNotes(viewId,details){
    const view=byId(viewId);if(!view)return;
    const footer=document.createElement('footer');footer.className='page-notes';footer.setAttribute('aria-label','Notas explicativas da página');footer.append(details);view.append(footer);
    const observer=new MutationObserver(()=>{if(view.lastElementChild!==footer)view.append(footer);});
    observer.observe(view,{childList:true});
  }
  appendPageNotes('view-blue-monitor',priorityLegend);
  const pageNotes=[
    ['view-overview','<h3>Indicadores e percentuais</h3><p>Os indicadores e gráficos acompanham os filtros selecionados. Disponibilidade é a quantidade com status Disponível dividida pelo total do mesmo recorte. Em atenção reúne Danificado, Em manutenção e Inservível.</p><h3>Escolas e atualização</h3><p>O CIE identifica cada escola. O ranking mostra até dez escolas por volume. A seção Atualizações da base considera a rede completa, independentemente dos filtros; a data de importação registra o envio ao sistema e não comprova a conferência física.</p><h3>Ficha da escola</h3><p>Na comparação por categoria, Escola e Rede mostram quantidade disponível e percentual sobre o total da categoria no respectivo universo. A rede inclui a escola. A diferença é expressa em pontos percentuais; esses indicadores não medem cobertura de alunos ou salas.</p>'],
    ['view-categories','<h3>Recorte por categoria</h3><p>As abas organizam os equipamentos por frente do inventário. Os indicadores, distribuições e registros acompanham a aba e os filtros selecionados. A composição por categoria representa os registros desse recorte.</p><h3>Situação e avaliação</h3><p>Status informa a situação registrada para o equipamento; Avaliação técnica é um campo distinto. Variações de maiúsculas e minúsculas em Bom são reunidas na apresentação. As categorias de Hardware seguem a coluna Categoria do equipamento da planilha, sem separação por fabricante ou modelo.</p><h3>Consulta dos registros</h3><p>A paginação organiza a lista em tela. Consulte as demais páginas para visualizar todos os registros do recorte.</p>'],
    ['view-quality','<h3>Pendências cadastrais</h3><p>Os achados ajudam a localizar informações que precisam de conferência nas planilhas de origem. Um equipamento pode aparecer em mais de um tipo de pendência; por isso, os totais de achados não devem ser somados como equipamentos distintos.</p><h3>Seriais repetidos</h3><p>Um serial repetido exige conferência e não comprova, sozinho, duplicação física de equipamentos.</p><h3>Identificação a revisar</h3><p>CIE ou URE ausentes não bloqueiam a importação: o CIE pode ser completado pelo nome do arquivo e a URE por Itapevi. Os casos ficam registrados para revisão e correção nas planilhas de origem.</p>']
  ];
  for(const [viewId,content] of pageNotes){const details=document.createElement('details');details.className='page-explanatory-notes';details.innerHTML='<summary>Notas explicativas</summary>'+content;appendPageNotes(viewId,details);}

  const uploadInput=byId('bm-file'),uploadLabel=uploadInput.closest('label');
  for(const child of uploadLabel.childNodes)if(child.nodeType===3&&child.textContent.includes('Atualizar'))child.textContent='Atualizar';
  uploadLabel.setAttribute('aria-label','Atualizar base Blue Monitor');
  byId('bm-export').textContent='Exportar';byId('bm-export').title='Baixar conferência em XLSX';
  let canPublish=false;
  function configurePublish(allowed){
    canPublish=allowed;document.getElementById('bm-restore')?.toggleAttribute('disabled',!allowed);uploadInput.disabled=!allowed;uploadLabel.setAttribute('aria-disabled',String(!allowed));
    uploadLabel.title=allowed?'Substituir e publicar a base Blue Monitor para todos':'Somente os responsáveis autorizados podem atualizar a base';
  }
  configurePublish(false);
  const centralDescription=(dataset,updatedAt)=>dataset.source+' · base compartilhada · publicada em '+new Date(updatedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
  window.setBlueMonitorDataset=(dataset,updatedAt)=>{if(Array.isArray(dataset?.records))setBlue(dataset.records,centralDescription(dataset,updatedAt));};
  const restoreBlue=document.createElement('button');restoreBlue.type='button';restoreBlue.className='ghost-btn';restoreBlue.textContent='Restaurar';restoreBlue.title='Restaurar a versão anterior do Blue Monitor';restoreBlue.id='bm-restore';restoreBlue.disabled=true;uploadLabel.after(restoreBlue);
  async function reviewBlue(dataset,restoring=false){
    if(!canPublish)return;uploadInput.disabled=true;restoreBlue.disabled=true;uploadLabel.setAttribute('aria-disabled','true');
    const previousDescription=byId('bm-source').textContent;let published=false;
    try{
      const [guard,ui]=await Promise.all([import('./inventory-validation.js'),import('./import-review.js')]);
      const check=guard.inspectBlueDataset(dataset);if(check.errors.length){document.getElementById('central-update-notice')?.close();await ui.showImportProblems(check.errors,{collection:'Blue Monitor'});return;}
      byId('bm-source').textContent='Conferindo CSV Blue Monitor. A base atual continua ativa…';
      window.inventoryUpdateNotice?.('Comparando o CSV com a base publicada. Nada foi substituído.','loading','Blue Monitor');
      const preview=await fetch('/api/blue-monitor/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dataset)});
      const prepared=await preview.json();document.getElementById('central-update-notice')?.close();
      if(!preview.ok){await ui.showImportProblems(prepared.errors||[prepared.error||'CSV inválido.'],{collection:'Blue Monitor'});return;}
      if(!await ui.reviewImport(prepared.report,{restoring,collection:'Blue Monitor'}))return;
      window.inventoryUpdateNotice?.('Publicando a versão conferida. Aguarde a confirmação…','loading','Blue Monitor');
      const response=await fetch('/api/blue-monitor',{method:'POST',headers:{'Content-Type':'application/json','X-Inventory-Approval':prepared.approval},body:JSON.stringify(dataset)});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível publicar o CSV.');
      setBlue(dataset.records,centralDescription(dataset,new Date().toISOString()));published=true;
      window.inventoryUpdateNotice?.((restoring?'Versão anterior restaurada':'Blue Monitor atualizado')+' com sucesso: '+format(dataset.records.length)+' equipamentos. A versão anterior foi preservada.','success','Blue Monitor');
    }catch(error){window.inventoryUpdateNotice?.((error.message||'Não foi possível publicar.')+' Recarregue para conferir a versão publicada.','error','Blue Monitor');}
    finally{if(!published)byId('bm-source').textContent=previousDescription;uploadInput.value='';configurePublish(canPublish);restoreBlue.disabled=!canPublish;}
  }
  uploadInput.addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file||!canPublish)return;
    try{if(!/\.csv$/i.test(file.name))throw Error('Selecione um arquivo CSV Blue Monitor.');const dataset={source:file.name,records:parseCsv(await file.text())};await reviewBlue(dataset);}
    catch(error){const ui=await import('./import-review.js');await ui.showImportProblems([error.message||'CSV ilegível.'],{collection:'Blue Monitor'});uploadInput.value='';}
  });
  restoreBlue.addEventListener('click',async()=>{try{const response=await fetch('/api/blue-monitor?history=latest',{cache:'no-store'});const result=await response.json();if(!response.ok||!result.dataset)throw Error('Não há uma versão anterior do Blue Monitor disponível.');await reviewBlue(result.dataset,true);}catch(error){window.inventoryUpdateNotice?.(error.message,'error','Blue Monitor');}});
  async function loadSharedBlue(){
    try{
      const response=await fetch('/api/blue-monitor',{cache:'no-store'});
      const result=await response.json();
      if(!response.ok||!Array.isArray(result.dataset?.records))throw Error('Base Blue Monitor compartilhada indisponível.');
      setBlue(result.dataset.records,centralDescription(result.dataset,result.updatedAt));
      configurePublish(Boolean(result.canUpdate));
    }catch(error){
      configurePublish(false);
      try{
        const response=await fetch('blue-monitor-data.json',{cache:'no-store'});
        if(!response.ok)throw Error();
        const payload=await response.json();
        setBlue(payload.rows.map(values=>Object.fromEntries(sourceColumns.map((column,index)=>[column,values[index]??'']))),'Cópia inicial · base compartilhada indisponível');
      }catch{byId('bm-source').textContent=error.message;}
    }
  }
  loadSharedBlue();
})();
