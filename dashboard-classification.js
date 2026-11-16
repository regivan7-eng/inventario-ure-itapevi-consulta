(() => {
  'use strict';
  const normalized = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  function desktopCategory(record) {
    const label=normalized(record.categoria || record['CATEGORIA DO EQUIPAMENTO'] || record.Type).replace(/\s+/g,'');
    if(label==='DESKTOP'||label==='DESKTOPLENOVO')return 'Desktop Lenovo';
    if(label==='DESKTOP/OUTROS'||label==='DESKTOPLEGADO')return 'Desktop Legado';
    return null;
  }
  function isSamsungChromebook(record) {
    const model = normalized(record.MODELO || record.Modelo || record.modelo || record.Model);
    const maker = normalized(record.FABRICANTE || record.Fabricante || record.fabricante || record.Manufacturer);
    const type = normalized(record.Type);
    // XE310XDA: Samsung Chromebook Go, confirmado no suporte oficial Samsung.
    const knownModel = /\bXE310XDA(?:\b|[-_])/.test(model + ' ' + type);
    const chromebook = /CHROME\s*BOOK/.test(model + ' ' + type);
    return knownModel || (chromebook && /SAMSUNG/.test(maker + ' ' + model + ' ' + type));
  }
  function lenovoIdentity(record) {
    const model = normalized(record.MODELO || record.Modelo || record.modelo || record.Model);
    const maker = normalized(record.FABRICANTE || record.Fabricante || record.fabricante || record.Manufacturer);
    const category = normalized(record.categoria || record['CATEGORIA DO EQUIPAMENTO'] || record.Type);
    const type = normalized(record.Type);
    const notebookModel = /THINK\s*PAD|IDEAPAD|\bYOGA\b|^L14\b|^20X2/.test(model);
    const desktopModel = /\bTHINK\s*CENTRE\b|\bM75S\b/.test(model) || /^(11JA|11AA|M11JA)/.test(model);
    return { model, category, type, notebookModel, desktopModel,
      lenovo: /LENOVO/.test(maker + ' ' + category + ' ' + type + ' ' + model) };
  }
  function isLenovoNotebook(record) {
    const id = lenovoIdentity(record);
    if (id.desktopModel || /CHROME\s*BOOK/.test(id.model + ' ' + id.category)) return false;
    return id.notebookModel || (id.lenovo && /NOTEBOOK|LAPTOP|THINK\s*PAD|IDEAPAD/.test(id.category + ' ' + id.type));
  }
  function isLenovoDesktop(record) {
    const id = lenovoIdentity(record);
    if (id.notebookModel || /CHROME\s*BOOK/.test(id.model + ' ' + id.category)) return false;
    if (id.desktopModel) return true;
    if (/NOTEBOOK|LAPTOP/.test(id.category)) return false;
    return id.lenovo && /DESKTOP|MICROCOMPUTADOR|COMPUTADOR DE MESA|THINK\s*CENTRE|\b(?:11JA|11AA|M11JA)[A-Z0-9]*\b/.test(id.category + ' ' + id.type);
  }
  function inventoryCategory(record) {
    const label=Object.prototype.hasOwnProperty.call(record,'CATEGORIA DO EQUIPAMENTO')
      ? String(record['CATEGORIA DO EQUIPAMENTO'] ?? '').trim()
      : record.categoria || '';
    return normalized(label).replace(/\s+/g,'')==='DESKTOP/OUTROS' ? 'Desktop Legado' : label;
  }
  function prepareDashboardData(source) {
    // A categoria vem da planilha; fabricante e modelo permanecem em seus próprios campos.
    const schoolName=value=>window.inventorySchoolNames?.display(value)??String(value??'').trim();
    const records = source.records.map(record => ({ ...record, unidade:schoolName(record.unidade), categoria: inventoryCategory(record) }));
    // Canonical display value, including previously loaded shared datasets.
    records.forEach(record => { if (normalized(record.avaliacao) === 'BOM') record.avaliacao = 'Bom'; });
    const evaluations = new Map();
    const categories = new Map();
    records.forEach(record => { const label = record.categoria || 'Não informado'; categories.set(label, (categories.get(label) || 0) + 1); });
    records.forEach(record => { const label = record.avaliacao || 'Não informado'; evaluations.set(label, (evaluations.get(label) || 0) + 1); });
    return { ...source, records, schools:source.schools?.map(s=>({...s,name:schoolName(s.name)})), distribuicoes: { ...source.distribuicoes,
      avaliacao: [...evaluations].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      categoria: [...categories].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) } };
  }
  window.dashboardClassification = { inventoryCategory, desktopCategory, isSamsungChromebook, isLenovoDesktop, isLenovoNotebook, prepareDashboardData };
})();
