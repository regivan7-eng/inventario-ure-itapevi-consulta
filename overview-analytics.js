(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const fmt = n => new Intl.NumberFormat('pt-BR').format(n);
  const pct = (n,total) => total ? new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(n/total*100)+'%' : '0%';
  const attention = r => ['danificado','em manutencao','inservivel'].includes(norm(r.status));
  function summarize(rows) {
    const categories=new Map(),schools=new Map(),evaluations=new Map();
    for(const r of rows) {
      const category=r.categoria||'Não informado';
      if(!categories.has(category))categories.set(category,{label:category,total:0,available:0,attention:0});
      const c=categories.get(category);c.total++;c.available+=norm(r.status)==='disponivel';c.attention+=attention(r);
      const key=r.cie||r.unidade||'Não identificado';
      if(!schools.has(key))schools.set(key,{label:r.unidade||'Escola não identificada',cie:r.cie,total:0,attention:0});
      const s=schools.get(key);s.total++;s.attention+=attention(r);
      const value=norm(r.avaliacao);
      const unknown=['','-','nao informado','sem avaliacao','n/a'].includes(value);
      const evalKey=unknown?'nao informado':value;
      if(!evaluations.has(evalKey))evaluations.set(evalKey,{label:unknown?'Sem avaliação informada':String(r.avaliacao).trim(),total:0});
      evaluations.get(evalKey).total++;
    }
    return {categories:[...categories.values()].sort((a,b)=>b.total-a.total),schools:[...schools.values()].sort((a,b)=>b.attention-a.attention||b.total-a.total),evaluations:[...evaluations.values()].sort((a,b)=>b.total-a.total)};
  }
  window.overviewAnalytics={summarize};
  const overview=document.getElementById('view-overview');
  const section=document.createElement('section');
  section.className='overview-analytics';section.id='overview-analytics';
  section.innerHTML='<div class="oa-heading"><div class="section-kicker">DIAGNÓSTICO DO INVENTÁRIO</div><h2>Onde concentrar a análise</h2><p>Comparações do universo selecionado nos filtros. Atenção = danificado, em manutenção ou inservível.</p></div><div id="oa-insights" class="oa-insights"></div><div class="grid-2 oa-charts-grid"><article class="panel"><div class="panel-head"><div><div class="section-kicker">COMPOSIÇÃO OPERACIONAL</div><h2>Condição por categoria</h2><p class="panel-subtitle">Participação dentro de cada categoria; total à direita.</p></div></div><div class="oa-legend"><span><i class="oa-available"></i>Disponível</span><span><i class="oa-attention"></i>Em atenção</span><span><i class="oa-other"></i>Demais status</span></div><div id="oa-categories"></div></article><article class="panel"><div class="panel-head"><div><div class="section-kicker">DEMANDA POR ESCOLA</div><h2>Maiores volumes em atenção</h2><p class="panel-subtitle">Até 8 escolas por quantidade. Percentual sobre o total da própria escola.</p></div></div><div id="oa-schools"></div><p class="oa-footnote">CIE identifica a unidade. Clique na escola para aplicar o filtro.</p></article><article class="panel oa-evaluation"><div class="panel-head"><div><div class="section-kicker">CONDIÇÃO TÉCNICA</div><h2>Avaliação dos equipamentos</h2><p class="panel-subtitle">Quantidade e participação no total filtrado. Variações de maiúsculas e minúsculas são reunidas na visualização.</p></div></div><div id="oa-evaluations"></div></article></div>';
  overview.appendChild(section);
  function renderOperationalReadiness() {
    const labels={'Equipamentos de Hardware':'Hardware','TVs e Educatrons':'TVs e Educatrons','Plataforma de Recarga':'Plataforma de Recarga','Equipamentos de Rede':'Equipamentos de Rede'};
    const groups=new Map();
    for(const record of filtered){
      const key=record.aba||'Aba não informada';
      if(!groups.has(key))groups.set(key,{key,label:labels[key]||key,total:0,available:0});
      const item=groups.get(key);item.total++;item.available+=norm(record.status)==='disponivel';
    }
    const order=Object.keys(labels);
    const rows=[...groups.values()].sort((a,b)=>(order.indexOf(a.key)<0?99:order.indexOf(a.key))-(order.indexOf(b.key)<0?99:order.indexOf(b.key)));
    document.getElementById('operational-readiness').innerHTML=rows.map(item=>
      '<div class="readiness-row"><div class="readiness-head"><h3>'+escape(item.label)+'</h3><strong>'+pct(item.available,item.total)+'</strong></div><div class="readiness-track" role="img" aria-label="'+escape(item.label)+': '+fmt(item.available)+' disponíveis de '+fmt(item.total)+' equipamentos"><i style="width:'+item.available/item.total*100+'%"></i></div><div class="readiness-details"><span><b>'+fmt(item.available)+'</b> disponíveis</span><span>'+fmt(item.total)+' no total</span></div></div>'
    ).join('')||'<p class="empty">Sem equipamentos para os filtros selecionados.</p>';
  }
  function renderAnalytics() {
    renderOperationalReadiness();
    const rows=filtered;
    const {categories,schools,evaluations}=summarize(rows);
    const total=rows.length, flagged=rows.filter(attention).length,available=rows.filter(r=>norm(r.status)==='disponivel').length;
    const top5=schools.slice(0,5).reduce((n,s)=>n+s.attention,0);
    document.getElementById('oa-insights').innerHTML=[
      ['Disponibilidade',pct(available,total),fmt(available)+' equipamentos com status disponível'],
      ['Equipamentos em atenção',pct(flagged,total),fmt(flagged)+' registros nas três situações destacadas'],
      ['Concentração da demanda',pct(top5,flagged),'da atenção está nas 5 escolas com maiores volumes']
    ].map(([label,value,note])=>'<div class="oa-insight"><span>'+label+'</span><strong>'+value+'</strong><small>'+note+'</small></div>').join('');
    const displayed=categories.slice(0,8);
    if(categories.length>8)displayed.push(categories.slice(8).reduce((a,c)=>({label:'Demais categorias',total:a.total+c.total,available:a.available+c.available,attention:a.attention+c.attention}),{total:0,available:0,attention:0}));
    document.getElementById('oa-categories').innerHTML=displayed.map(c=>{
      const parts=[{label:'Disponível',value:c.available,cls:'oa-available'},{label:'Em atenção',value:c.attention,cls:'oa-attention'},{label:'Demais status',value:c.total-c.available-c.attention,cls:'oa-other'}];
      const ratio=p=>c.total?p.value/c.total*100:0;
      const description=c.label+': '+parts.map(p=>p.label+' '+fmt(p.value)+' ('+pct(p.value,c.total)+')').join(', ');
      const segments=parts.map(p=>'<span class="'+p.cls+'" style="width:'+ratio(p)+'%" title="'+p.label+': '+fmt(p.value)+' ('+pct(p.value,c.total)+')">'+(ratio(p)>=14?'<span class="oa-segment-label">'+pct(p.value,c.total)+'</span>':'')+'</span>').join('');
      const small=parts.filter(p=>p.value>0&&ratio(p)<14).map(p=>'<span><i class="'+p.cls+'"></i>'+p.label+' '+pct(p.value,c.total)+'</span>').join('');
      return '<div class="oa-stack-row oa-stack-labeled"><div class="oa-row-label">'+escape(c.label)+'</div><b>'+fmt(c.total)+'</b><div class="oa-stack" role="img" aria-label="'+escape(description)+'">'+segments+'</div>'+(small?'<div class="oa-small-percentages" aria-hidden="true">'+small+'</div>':'')+'</div>';
    }).join('')||'<p class="empty">Sem equipamentos para os filtros selecionados.</p>';
    const leaders=schools.filter(s=>s.attention).slice(0,8),max=leaders[0]?.attention||1;
    document.getElementById('oa-schools').innerHTML=leaders.map(s=>'<div class="oa-school-row"><div class="oa-school"><span>'+escape(s.label)+'</span><small>CIE '+escape(s.cie||'não informado')+' · '+fmt(s.total)+' equipamentos</small></div><div class="oa-track"><i style="width:'+s.attention/max*100+'%"></i></div><b>'+fmt(s.attention)+'<small>'+pct(s.attention,s.total)+'</small></b></div>').join('')||'<p class="empty">'+(total?'Nenhum equipamento nas situações de atenção.':'Sem equipamentos para os filtros selecionados.')+'</p>';
    const maxEval=evaluations[0]?.total||1;
    document.getElementById('oa-evaluations').innerHTML=evaluations.map(e=>'<div class="oa-eval-row"><span>'+escape(e.label)+'</span><div class="oa-track oa-eval-track"><i style="width:'+e.total/maxEval*100+'%"></i></div><b>'+fmt(e.total)+'<small>'+pct(e.total,total)+'</small></b></div>').join('')||'<p class="empty">Sem avaliações para os filtros selecionados.</p>';
  }
  renderDonut=function(){
    const groups=new Map();
    filtered.forEach(r=>{const key=norm(r.status)||'nao informado';if(!groups.has(key))groups.set(key,{label:r.status||'Não informado',value:0});groups.get(key).value++;});
    const rows=[...groups.values()].sort((a,b)=>b.value-a.value);
    const statusColors={'disponivel':'#087da9','danificado':'#dc7940','em manutencao':'#b4770b','inservivel':'#c34e58','nao informado':'#7594aa','chamado aberto':'#7666a9','aguardando peca':'#85934d'}; const colors=rows.map(r=>statusColors[norm(r.label)]||'#60758b');
    const total=filtered.length;let start=0;
    const stops=rows.map((r,i)=>{const end=start+r.value/(total||1)*100;const stop=colors[i%colors.length]+' '+start+'% '+end+'%';start=end;return stop;}).join(',');
    document.getElementById('status-chart').innerHTML=total?'<div class="donut" role="img" aria-label="Distribuição de todos os status do inventário filtrado" style="background:conic-gradient('+stops+')"><div class="donut-center">'+fmt(total)+'</div></div><div class="legend">'+rows.map((r,i)=>'<div class="legend-item"><i class="legend-dot" style="background:'+colors[i%colors.length]+'"></i><span>'+escape(r.label)+'</span><span>'+fmt(r.value)+' · '+pct(r.value,total)+'</span></div>').join('')+'</div>':'<p class="empty">Sem equipamentos para os filtros selecionados.</p>';
  };
  const originalRender=render;
  render=function(){originalRender();renderAnalytics();};
})();
