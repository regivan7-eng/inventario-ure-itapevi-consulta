/* Adaptador de consulta: nenhuma opera��o de grava��o � exposta. */
(() => {
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbzHKOqlm1SzBUQN6i46PUINo8twYtQYxM6kkla8pR1cW1BuhlxCi3F8YfwJFvR51KPS/exec';
  const originalFetch = window.fetch.bind(window);
  let queue = Promise.resolve();
  function readPublic(kind) {
    if (!ENDPOINT) return Promise.reject(new Error('Consulta central ainda n�o configurada.'));
    const task = queue.catch(() => {}).then(() => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => finish(new Error('Tempo esgotado ao consultar o Google.')), 30000);
      function finish(error, result) {
        clearTimeout(timer); script.remove(); delete window.inventoryPublicCallback;
        if (error) reject(error); else resolve(result);
      }
      window.inventoryPublicCallback = result => {
        if (!result?.ok || result.kind !== kind) return finish(new Error('Base central indispon�vel.'));
        finish(null, result);
      };
      script.onerror = () => finish(new Error('N�o foi poss�vel consultar a base central.'));
      script.src = ENDPOINT + '?kind=' + encodeURIComponent(kind);
      document.head.append(script);
    })).then(async result => {
      const raw = atob(result.payload), bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const dataset = JSON.parse(await new Response(stream).text());
      if (!Array.isArray(dataset.records)) throw new Error('Conte�do da base inv�lido.');
      return {dataset, updatedAt: result.updatedAt, canUpdate: false};
    });
    queue = task; return task;
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
          originalFetch('centralized-data.json'), window.fetch('/api/data'), import('./centralized-comparison.js')
        ]);
        const source = await sourceResponse.json();
        const current = currentResponse.ok ? await currentResponse.json() : {dataset:await (await window.fetch('dashboard_data.json')).json(),updatedAt:'2026-11-08T08:36:52.759Z'};
        return Response.json({source, comparison:mod.buildCentralizedComparison(source,current),canUpdate:false});
      } catch(error) { return Response.json({error:error.message},{status:503}); }
    }
    if ((path === '/api/data' || path === '/api/blue-monitor') && method === 'GET') {
      try { return Response.json(await readPublic(path.endsWith('blue-monitor') ? 'blue' : 'inventory')); }
      catch (error) { return Response.json({error:error.message}, {status:503}); }
    }
    if (typeof path === 'string' && path.startsWith('/api/')) return Response.json({error:'Recurso indispon�vel nesta vers�o de consulta.'}, {status:503});
    return originalFetch(url, options);
  };
})();

