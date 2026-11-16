(() => {
  const states = new Map();
  const compare = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true }).compare;
  window.schoolSort = {
    rows(key, rows, name) {
      const direction = states.get(key) ?? (['category','matches','devices'].includes(key) ? 1 : 0);
      return direction ? [...rows].sort((a,b) => direction * compare(String(name(a) || ''), String(name(b) || ''))) : rows;
    },
    button(key, label) {
      const direction = states.get(key) ?? (['category','matches','devices'].includes(key) ? 1 : 0);
      return '<button type="button" data-school-sort="'+key+'" aria-label="Ordenar '+label+' de '+(direction===1?'Z a A':'A a Z')+'">'+label+' '+(direction===1?'↑':direction===-1?'↓':'↕')+'</button>';
    }
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-school-sort]');
    if (!button) return;
    const key = button.dataset.schoolSort;
    const current = states.get(key) ?? (['category','matches','devices'].includes(key) ? 1 : 0);
    states.set(key, current===1 ? -1 : 1);
    if(key==='duplicates') window.redrawDuplicateSchools?.();
    if(key==='cies') renderCies();
    if(key==='category') renderCategoryView(document.querySelector('.category-tab.active')?.dataset.sheet,1);
    window.dispatchEvent(new CustomEvent('school-sort', {detail:key}));
    document.querySelectorAll('[data-school-sort="'+key+'"]').forEach(node => {
      const label=node.textContent.replace(/[↕↑↓]/g,'').trim();
      node.textContent=label+' '+(states.get(key)===1?'↑':'↓');
      node.setAttribute('aria-label','Ordenar '+label+' de '+(states.get(key)===1?'Z a A':'A a Z'));
    });
  });
})();
