// Shared faceting for inventory, Blue Monitor and serial matching. Source rows stay intact.
(() => {
  'use strict';
  function resolve(rows, facets, selections, changedId) {
    const valuesOf = (row, facet) => { if(row._schoolOnly&&facet.id!=='filter-cie')return [''];const value=typeof facet.field==='function'?facet.field(row):row[facet.field]; return (Array.isArray(value)?value:[value]).map(value=>String(value??'')); };
    const selected = new Map(facets.map(f => [f.id, [...(selections.get(f.id) || [])].map(String)]));
    const matches = (row, except) => facets.every(f => f.id === except || (row._schoolOnly&&f.id!=='filter-cie') || !selected.get(f.id).length || valuesOf(row, f).some(value=>selected.get(f.id).includes(value)));
    // The last edited filter wins; discard incompatible older selections in a stable order.
    const order = [...facets].sort((a, b) => Number(b.id === changedId) - Number(a.id === changedId));
    let accepted = rows;
    for (const facet of order) {
      const available = new Set(accepted.flatMap(row => valuesOf(row, facet)));
      const retained = selected.get(facet.id).filter(value => available.has(value));
      selected.set(facet.id, retained);
      if (retained.length) accepted = accepted.filter(row => (row._schoolOnly&&facet.id!=='filter-cie') || valuesOf(row, facet).some(value=>retained.includes(value)));
    }
    // Remove individual OR values that no longer intersect the other selected filters.
    let changed;
    do {
      changed = false;
      for (const facet of facets) {
        const available = new Set(rows.filter(row => matches(row, facet.id)).flatMap(row => valuesOf(row, facet)));
        const before = selected.get(facet.id), after = before.filter(value => available.has(value));
        if (after.length !== before.length) { selected.set(facet.id, after); changed = true; }
      }
    } while (changed);
    const options = new Map(facets.map(f => [f.id, [...new Set(rows.filter(row => matches(row, f.id)).flatMap(row => valuesOf(row, f)).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR',{numeric:true}))]));
    return { selected, options, rows: rows.filter(row => matches(row)), removed: facets.reduce((n,f) => n + (selections.get(f.id)?.length || 0) - selected.get(f.id).length, 0) };
  }
  function schools(rows) {
    const names=new Map();
    for(const row of rows){const cie=String(row.cie??'').trim(),name=String(row.unidade??'').trim();if(!cie)continue;if(!names.has(cie))names.set(cie,new Set());if(name)names.get(cie).add(name);}
    return new Map([...names].map(([cie,names])=>{const name=[...names].sort((a,b)=>a.localeCompare(b,'pt-BR')).join(' / ')||'Escola não informada';return [cie,{cie,name,label:`${name} · CIE ${cie}`}];}));
  }
  function viewFilters() {
    const views=new Map();
    const copy=state=>new Map([...state].map(([id,values])=>[id,[...values]]));
    return {save:(view,state)=>views.set(view,copy(state)),restore:view=>copy(views.get(view)||new Map())};
  }
  const firstField=(row,keys)=>{for(const key of keys){const value=String(row[key]??'').trim();if(value&&!['-','N/A','NA','N/I'].includes(value.toUpperCase()))return value;}return 'Não informado';};
  const manufacturer=row=>{
    const value=firstField(row,['FABRICANTE','MARCA / FABRICANTE','MARCA','Fabricante','fabricante','Manufacturer','manufacturer']);
    return ({LENOVO:'Lenovo',MULTILASER:'Multilaser'})[value.toUpperCase()] || value;
  };
  const model=row=>firstField(row,['MODELO','TIPO / MODELO','Modelo','modelo','Model','model']);
  const registeredSchools=data=>(data.schools||[]).filter(s=>s.sem_dados).map(s=>({cie:s.cie,unidade:s.name,_schoolOnly:true}));
  window.inventoryFacets = { resolve, schools, viewFilters, manufacturer, model, registeredSchools };
})();
// Dashboard bindings.
(() => {
  'use strict';
  const labels={'filter-cie':['Escola','Todas as escolas'],'filter-category':['Categoria','Todas as categorias'],'filter-manufacturer':['Fabricante','Todos os fabricantes'],'filter-model':['Modelo','Todos os modelos'],'filter-status':['Situação','Todos os status']};
  const facets = [['filter-cie','cie'],['filter-category','categoria'],['filter-manufacturer',window.inventoryFacets.manufacturer],['filter-model',window.inventoryFacets.model],['filter-status','status']].map(([id,field]) => ({id,field:field==='categoria'?row=>row._schoolOnly?'':row.categoria||row.aba||'Não informado':field}));
  const extraIds=['filter-manufacturer','filter-model'];
  const categoryControl=document.getElementById('filter-category-trigger').closest('.multi-filter');
  const extraControls=extraIds.map(id=>{
    const wrap=document.createElement('div');wrap.className='multi-filter';wrap.dataset.filterId=id;
    const trigger=document.createElement('button');trigger.type='button';trigger.className='multi-filter-trigger';trigger.id=id+'-trigger';trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',id+'-menu');trigger.setAttribute('aria-label',labels[id][0]);
    const menu=document.createElement('div');menu.className='multi-filter-menu';menu.id=id+'-menu';menu.hidden=true;wrap.append(trigger,menu);return wrap;
  });
  categoryControl.after(...extraControls);
  function populateExtraFilters(){
    for(const id of extraIds){
      filterState.set(id,[]);
      const menu=document.getElementById(id+'-menu'),trigger=document.getElementById(id+'-trigger');menu.replaceChildren();
      const search=document.createElement('input');search.type='search';search.className='multi-filter-search';search.placeholder='Pesquisar...';search.setAttribute('aria-label','Pesquisar '+labels[id][0].toLowerCase());
      const options=document.createElement('div');options.className='multi-filter-options';menu.append(search,options);
      trigger.onclick=event=>{event.stopPropagation();const open=menu.hidden;closeFilterMenus(menu);menu.hidden=!open;trigger.setAttribute('aria-expanded',String(open));if(open)search.focus();};
      options.onchange=event=>{if(!event.target.matches('input[type="checkbox"]'))return;filterState.set(id,[...options.querySelectorAll('input:checked')].map(input=>input.value));updateFilterTrigger(id,labels[id][1]);apply();};
      search.oninput=()=>{const query=normalizeFilterSearch(search.value);for(const option of options.children)option.hidden=Boolean(query&&!normalizeFilterSearch(option.dataset.label).includes(query));};
      updateFilterTrigger(id,labels[id][1]);
    }
  }
  const priorPopulate=populateFilters;
  populateFilters=function(...args){priorPopulate(...args);populateExtraFilters();};
  populateExtraFilters();
  let schoolRows=null, schoolIndex=new Map();
  function refreshSchools(){if(schoolRows!==DATA.records){schoolRows=DATA.records;schoolIndex=window.inventoryFacets.schools(schoolRows);for(const s of DATA.schools||[])if(s.sem_dados)schoolIndex.set(s.cie,{...s,label:`${s.name} · CIE ${s.cie}`});}}
  const displayValue=(id,value)=>id==='filter-cie'?(schoolIndex.get(String(value))?.label||`CIE ${value}`):value;
  window.inventoryFilterValueLabel=displayValue;
  const baseTrigger=updateFilterTrigger;
  updateFilterTrigger=function(id,label){baseTrigger(id,id==='filter-cie'?'Todas as escolas':label);if(id!=='filter-cie')return;const trigger=document.getElementById(id+'-trigger');if(!trigger)return;const values=selectedValues(id);trigger.textContent=values.length===0?'Todas as escolas':values.length===1?(schoolIndex.get(String(values[0]))?.name||`CIE ${values[0]}`):`${values.length} escolas selecionadas`;trigger.title=values.map(value=>displayValue(id,value)).join('; ')||'Selecionar escolas e pesquisar por nome ou CIE';};
  let currentScope = '', changedId = '';
  const sectionFilters=window.inventoryFacets.viewFilters();
  const sectionNames={overview:'Visão geral',categories:'Categorias',quality:'Qualidade dos dados','blue-monitor':'Blue Monitor'};
  const currentView=()=>document.querySelector('.dashboard-view.active')?.dataset.viewPanel||'overview';
  function scope() { return document.getElementById('view-categories').classList.contains('active') ? document.querySelector('.category-tab.active')?.dataset.sheet || '' : ''; }
  window.inventoryFilterScope = () => scope();
  window.inventoryFilterContext=()=>currentView()==='blue-monitor'?'Inventário completo — filtros do Blue Monitor não se aplicam':[sectionNames[currentView()],scope()].filter(Boolean).join(' · ');
  const notice=document.createElement('p');notice.className='context-filter-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.hidden=true;document.getElementById('filters').after(notice);
  function refreshOptions() {
    if (typeof DATA === 'undefined' || !DATA) return;
    refreshSchools();
    const caption=document.querySelector('#filters .filter-label small');if(caption)caption.textContent=sectionNames[currentView()];
    const heading=document.querySelector('#filters .filter-label strong');if(heading)heading.textContent='Filtros desta seção';
    const nextScope=scope(), scopeChanged=nextScope!==currentScope;
    currentScope=nextScope;
    const rows=currentScope?DATA.records.filter(row=>row.aba===currentScope):DATA.records;
    const registered=window.inventoryFacets.registeredSchools(DATA);
    const result=window.inventoryFacets.resolve([...rows,...registered],facets,filterState,changedId);
    const scopedCies=[...new Set(result.rows.map(r=>String(r.cie||'')).filter(Boolean))];
    window.inventoryScopedSchoolCies=()=>scopedCies;
    changedId='';
    for(const facet of facets) {
      filterState.set(facet.id,result.selected.get(facet.id));
      const menu=document.getElementById(facet.id+'-menu');
      if(!menu)continue;
      const wrap=menu.querySelector('.multi-filter-options'), search=menu.querySelector('.multi-filter-search');
      if(scopeChanged)search.value='';
      const available=result.options.get(facet.id);
      if(facet.id==='filter-cie')available.sort((a,b)=>(schoolIndex.get(a)?.name||a).localeCompare(schoolIndex.get(b)?.name||b,'pt-BR',{sensitivity:'base'})||a.localeCompare(b,'pt-BR',{numeric:true}));
      // Keep matching nodes so keyboard focus and the menu's scroll position survive an edit.
      const nodes=new Map([...wrap.children].map(node=>[node.querySelector('input').value,node]));
      for(const [value,node] of nodes)if(!available.includes(value))node.remove();
      for(const [index,value] of available.entries()) {
        let option=nodes.get(value);
        if(!option){option=document.createElement('label');option.className='multi-filter-option';option.dataset.label=value.toLocaleLowerCase('pt-BR');const input=document.createElement('input');input.type='checkbox';input.value=value;const caption=document.createElement('span');caption.textContent=value;option.append(input,caption);}
        if(facet.id==='filter-cie'){
          option.classList.add('school-filter-option');option.dataset.label=normalizeFilterSearch(displayValue(facet.id,value));
          const caption=option.querySelector('span'), school=schoolIndex.get(value);
          if(caption.dataset.schoolLabel!==displayValue(facet.id,value)){caption.replaceChildren();const name=document.createElement('strong');name.textContent=school?.name||'Escola não informada';const cie=document.createElement('small');cie.textContent=`CIE ${value}`;caption.append(name,cie);caption.dataset.schoolLabel=displayValue(facet.id,value);}
        }
        option.hidden=Boolean(search.value&&!normalizeFilterSearch(option.dataset.label).includes(normalizeFilterSearch(search.value)));
        if(wrap.children[index]!==option)wrap.insertBefore(option,wrap.children[index]||null);
      }
      let empty=menu.querySelector('.context-filter-empty');
      if(!empty){empty=document.createElement('p');empty.className='context-filter-empty';empty.textContent='Nenhuma opção neste recorte.';menu.append(empty);}
      empty.hidden=available.length>0;
      updateFilterTrigger(facet.id,labels[facet.id][1]);
    }
    filtered=result.rows.filter(row=>!row._schoolOnly);
    if(result.removed){notice.textContent='Seleções incompatíveis foram removidas para acompanhar o contexto atual.';notice.hidden=false;}
    else{notice.hidden=true;notice.textContent='';}
  }
  document.getElementById('filters').addEventListener('change',event=>{const menu=event.target.closest('.multi-filter-menu');if(menu)changedId=menu.id.replace(/-menu$/,'');},true);
  const strip=document.createElement('div');strip.className='active-filter-strip';strip.setAttribute('aria-label','Filtros ativos');strip.hidden=true;document.getElementById('filters').after(strip);
  function drawChips(){
    strip.replaceChildren();
    const entries=[...filterState].flatMap(([id,values])=>values.map(value=>({id,value})));
    strip.hidden=!entries.length||document.getElementById('filters').hidden;
    if(!entries.length)return;
    const label=document.createElement('span');label.className='active-filter-label';label.textContent='Filtros ativos:';strip.appendChild(label);
    entries.forEach(({id,value})=>{
      const button=document.createElement('button');button.type='button';button.className='active-filter-chip';button.title=labels[id][0]+': '+displayValue(id,value);button.setAttribute('aria-label','Remover filtro '+labels[id][0]+': '+displayValue(id,value));
      const text=document.createElement('span');text.textContent=labels[id][0]+': '+displayValue(id,value);const icon=document.createElement('b');icon.textContent='×';icon.setAttribute('aria-hidden','true');button.append(text,icon);
      button.addEventListener('click',()=>{
        const retained=(filterState.get(id)||[]).filter(item=>item!==value);filterState.set(id,retained);
        document.getElementById(id+'-menu')?.querySelectorAll('input[type="checkbox"]').forEach(input=>{input.checked=retained.includes(input.value);});
        updateFilterTrigger(id,labels[id][1]);apply();
      });strip.appendChild(button);
    });
  }
  const priorKpis=renderKpis;renderKpis=function(...args){priorKpis(...args);const count=window.inventoryScopedSchoolCies?.().length;if(count!==undefined)document.getElementById('kpi-cies').textContent=new Intl.NumberFormat('pt-BR').format(count);};
  const priorRender=render;render=function(...args){refreshOptions();priorRender(...args);drawChips();};
  const priorApply=apply;apply=function(...args){priorApply(...args);drawChips();};
  const priorShow=showView;showView=function(...args){
    const from=currentView();sectionFilters.save(from,filterState);
    priorShow(...args);closeFilterMenus();
    const to=currentView();
    if(from!==to){
      filterState.clear();for(const [id,values] of sectionFilters.restore(to))filterState.set(id,values);
      document.querySelectorAll('#filters .multi-filter-search').forEach(search=>{search.value='';});
      changedId='';
    }
    if(typeof DATA!=='undefined'&&DATA)apply();drawChips();
  };
  const priorCategory=renderCategoryView;renderCategoryView=function(sheet,...args){if(scope()!==currentScope){closeFilterMenus();apply();return;}return priorCategory(sheet,...args);};
})();
