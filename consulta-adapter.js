/* Adaptador de consulta: nenhuma operação de gravação é exposta. */
(() => {
  const LEGACY_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzHKOqlm1SzBUQN6i46PUINo8twYtQYxM6kkla8pR1cW1BuhlxCi3F8YfwJFvR51KPS/exec';
  const SHAREPOINT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzLMqg0yh6ujbx-w1kcmLs20a5H6JCDU3cfEy2CPDTOitieAb7wBeg7pAo9HYRwjKt0/exec';
  const originalFetch = window.fetch.bind(window);
  let queue = Promise.resolve();
  function readPublic(endpoint, kind, timeout = 30000) {
    const task = queue.catch(() => {}).then(() => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => finish(new Error('Tempo esgotado ao consultar o Google.')), timeout);
      function finish(error, result) {
        clearTimeout(timer); script.remove(); delete window.inventoryPublicCallback;
        if (error) reject(error); else resolve(result);
      }
      window.inventoryPublicCallback = result => {
        if (!result?.ok || result.kind !== kind) return finish(new Error('Base central indisponível.'));
        finish(null, result);
      };
      script.onerror = () => finish(new Error('Não foi possível consultar a base central.'));
      script.src = endpoint + '?kind=' + encodeURIComponent(kind);
      document.head.append(script);
    })).then(async result => {
      const raw = atob(result.payload), bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const dataset = JSON.parse(await new Response(stream).text());
      if (!Array.isArray(dataset.records)) throw new Error('Conteúdo da base inválido.');
      return {dataset, updatedAt: result.updatedAt, canUpdate: false};
    });
    queue = task; return task;
  }
  async function readSharePoint(kind) {
    try {
      return await readPublic(SHAREPOINT_ENDPOINT, kind, 12000);
    } catch (error) {
      if (kind === 'centralized') throw error;
      return readPublic(LEGACY_ENDPOINT, kind);
    }
  }

  window.fetch = async (url, options = {}) => {
    const path = typeof url === 'string' ? url : url.url;
    const method = String(options.method || 'GET').toUpperCase();
    if (path === 'dashboard_data.json' || path === 'blue-monitor-data.json') {
      const response = await originalFetch(path.replace('.json', '.json.gz'));
      if (!response.ok) return response;
      const bytes = await response.arrayBuffer();
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream, {headers: {'Content-Type':'application/json'}});
    }
    if (path === '/api/session' && method === 'GET') return Response.json({canUpdate:false});
    if (path === '/api/centralizados/comparison' && method === 'GET') {
      try {
        const [sourceResponse, currentResponse, mod] = await Promise.all([
          (async () => {
            try {
              let d;
              try {
                ({dataset: d} = await readSharePoint('centralized'));
              } catch (_) {
                const r = await originalFetch('https://raw.githubusercontent.com/regivan7-eng/inventario-ure-itapevi-consulta/sync-data/candidates/centralized.json?t=' + Date.now(), {cache:'no-store'});
                if (!r.ok) throw new Error('Fonte indisponível');
                d = await r.json();
              }
              if (!Array.isArray(d.records) || !d.checkedAt) throw new Error('Fonte inválida');
              if (Date.now() - Date.parse(d.checkedAt) > 72 * 60 * 60 * 1000) return Response.json({...d,stale:true,notice:'A origem de Centralizados não foi conferida nas últimas 72 horas.'});
              return Response.json(d);
            } catch (_) {
              const r = await originalFetch('centralized-data.json');
              const d = await r.json();
              return Response.json({...d,stale:true,notice:'Exibindo a última cópia disponível; não foi possível conferir a atualização de Centralizados.'});
            }
          })(), window.fetch('/api/data'), import('./centralized-comparison.js')
        ]);
        const source = await sourceResponse.json();
        const current = currentResponse.ok ? await currentResponse.json() : {dataset:await (await window.fetch('dashboard_data.json')).json(),updatedAt:'2026-11-08T08:36:52.759Z'};
        return Response.json({source, comparison:mod.buildCentralizedComparison(source,current),canUpdate:false});
      } catch(error) { return Response.json({error:error.message},{status:503}); }
    }
    if ((path === '/api/data' || path === '/api/blue-monitor') && method === 'GET') {
      try { return Response.json(await readSharePoint(path.endsWith('blue-monitor') ? 'blue' : 'inventory')); }
      catch (error) { return Response.json({error:error.message}, {status:503}); }
    }
    if (typeof path === 'string' && path.startsWith('/api/')) return Response.json({error:'Recurso indisponível nesta versão de consulta.'}, {status:503});
    return originalFetch(url, options);
  };
})();
