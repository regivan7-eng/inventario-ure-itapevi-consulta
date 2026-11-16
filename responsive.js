(() => {
  'use strict';
  const main=document.querySelector('.main');
  const filters=document.getElementById('filters');
  const filterToggle=document.createElement('button');
  filterToggle.type='button';filterToggle.className='mobile-filter-toggle';filterToggle.setAttribute('aria-controls','filters');filterToggle.setAttribute('aria-expanded','false');
  filters.dataset.mobileCollapsed='true';
  filters.before(filterToggle);
  function updateFilterToggle(){
    const selected=[...filterState.values()].reduce((n,values)=>n+values.length,0);
    const open=filters.dataset.mobileCollapsed==='false';
    filterToggle.textContent=(open?'Fechar filtros':'Filtros de análise')+(selected?' · '+selected+' selecionado(s)':'')+' '+(open?'−':'+');
    filterToggle.setAttribute('aria-expanded',String(open));
  }
  filterToggle.addEventListener('click',()=>{filters.dataset.mobileCollapsed=String(filters.dataset.mobileCollapsed!=='true');updateFilterToggle();});
  const originalApply=apply;
  apply=function(...args){originalApply(...args);updateFilterToggle();};
  updateFilterToggle();
  const watched=new WeakSet();
  const hints=new WeakMap();
  const resize=new ResizeObserver(entries=>entries.forEach(({target})=>updateHint(target)));
  function updateHint(region){
    const hint=hints.get(region);if(!hint)return;
    hint.hidden=region.scrollWidth<=region.clientWidth+2;
  }
  function decorate(){
    main.querySelectorAll('.rank-table,.records-table,.inventory-duplicate-table,.source-scroll,.bm-table-wrap,.qr-table-wrap').forEach(region=>{
      if(watched.has(region))return;
      watched.add(region);
      region.classList.add('scroll-region');region.tabIndex=0;region.setAttribute('role','region');
      const panel=region.closest('.panel');
      region.setAttribute('aria-label',(panel?.querySelector('h2,h3')?.textContent||'Tabela de dados')+' — rolagem horizontal');
      const hint=document.createElement('p');hint.className='scroll-hint';hint.textContent='↔ Deslize a tabela para consultar todas as colunas.';hint.hidden=true;
      region.before(hint);hints.set(region,hint);resize.observe(region);updateHint(region);
    });
  }
  let scheduled=false;
  const observer=new MutationObserver(()=>{
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;decorate();main.querySelectorAll('.scroll-region').forEach(updateHint);});
  });
  observer.observe(main,{childList:true,subtree:true});decorate();
  const baseShowView=showView;
  showView=function(...args){
    baseShowView(...args);
    filterToggle.hidden=filters.hidden;updateFilterToggle();
    document.querySelectorAll('nav a[data-view]').forEach(link=>{
      if(link.classList.contains('active'))link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
    if(window.matchMedia('(max-width:1024px)').matches)window.scrollTo({top:0,left:0,behavior:'instant'});
  };
})();
