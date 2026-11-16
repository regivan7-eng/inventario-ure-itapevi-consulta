(() => {
  const dataUrl = "/api/data";
  const originalButton = document.getElementById("import-folder-btn");
  const originalInput = document.getElementById("data-folder-input");
  let canUpdate = false;
  let publishButton = null;
  let centralLoaded=false,centralLoad=null;
  const evolutionUI=import('./data-evolution-ui.js').catch(error=>{console.warn(error);return null;});
  const reflectData=async(kind,dataset,updatedAt)=>{try{const ui=await evolutionUI;ui?.showDataState({kind,dataset:dataset||(typeof DATA!=='undefined'?DATA:null),updatedAt,onRetry:loadCentralData});}catch(error){console.warn('Não foi possível atualizar os indicadores de conexão:',error);}};

  const status = (message, type = "") => window.setImportStatus?.(message, type);
  const formatNumber = value => new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
  function formulaErrorMessage(errors) {
    const details = errors.slice(0, 3).map(error => {
      const file = error.arquivo || "Arquivo sem nome";
      const sheet = error.aba || "Aba não identificada";
      const cell = error.celula || "célula não identificada";
      const formula = error.formula ? ` (${error.formula})` : "";
      return `${file} — ${sheet}!${cell}${formula}`;
    });
    const remaining = errors.length > details.length ? ` e mais ${errors.length - details.length}` : "";
    return `Foram encontrados ${errors.length} erro(s) de fórmula: ${details.join(" · ")}${remaining}.`;
  }
  function showUpdateNotice(message, type = "loading", collection = "Inventário") {
    let notice = document.getElementById("central-update-notice");
    if (!notice) {
      notice = document.createElement("dialog");
      notice.id = "central-update-notice";
      notice.setAttribute("aria-labelledby", "central-update-title");
      notice.setAttribute("aria-describedby", "central-update-message");
      notice.innerHTML = '<div class="update-notice-brand"><img src="LogoURE_VFinal_NEW.png" alt="URE Itapevi"><span>URE ITAPEVI · SEINTEC</span></div><div class="update-notice-heading"><span class="update-icon" aria-hidden="true"></span><h2 id="central-update-title" tabindex="-1"></h2></div><p class="update-message" id="central-update-message" role="status" aria-live="polite" aria-atomic="true"></p><div class="update-notice-actions"><button type="button" class="update-notice-close">Concluir</button></div>';
      notice.querySelector(".update-notice-close").addEventListener("click", () => notice.close());
      notice.addEventListener("cancel", event => { if (notice.dataset.type === "loading") event.preventDefault(); });
      document.body.appendChild(notice);
    }
    notice.dataset.type = type;
    notice.setAttribute("aria-busy", String(type === "loading"));
    notice.querySelector(".update-icon").textContent = type === "success" ? "✓" : type === "error" ? "!" : "";
    notice.querySelector("h2").textContent = type === "success" ? collection + " atualizado" : type === "error" ? "Não foi possível atualizar" : "Atualizando " + collection;
    notice.querySelector(".update-message").textContent = message;
    const close = notice.querySelector(".update-notice-close");
    close.disabled = type === "loading";
    close.textContent = type === "loading" ? "Aguarde a conclusão…" : type === "error" ? "Entendi" : "Concluir";
    if (!notice.open) notice.showModal();
  }
  window.inventoryUpdateNotice = showUpdateNotice;
  function updateFeedback(message, type = "loading") {
    status(message, type === "loading" ? "loading" : type);
    showUpdateNotice(message, type);
  }
  const replaceControl = (node) => {
    const next = node.cloneNode(true);
    node.replaceWith(next);
    return next;
  };

  function finishInitialLoad(){
    document.documentElement?.removeAttribute('data-inventory-loading');
    document.getElementById('inventory-loading-state')?.remove();
  }
  function showInitialFallback(){
    if(centralLoaded||typeof BASE_DATA==='undefined')return;
    window.setDashboardData?.(BASE_DATA);
    document.getElementById('data-origin').textContent='Base inicial';
    document.getElementById('data-date').textContent='Referência: '+(BASE_DATA.meta?.gerado_em||'não informada');
  }
  function loadCentralData(){
    if(centralLoad)return centralLoad;
    centralLoad=fetchCentralData().finally(()=>{centralLoad=null;});
    return centralLoad;
  }
  async function fetchCentralData() {
    configureImport(canUpdate);
    await reflectData('loading');
    try {
      // A falha de armazenamento não altera a permissão da sessão autenticada.
      try{
        const sessionResponse=await fetch('/api/session',{cache:'no-store'});
        if(sessionResponse.ok){const session=await sessionResponse.json();canUpdate=Boolean(session.canUpdate);configureImport(canUpdate);}
      }catch(error){console.warn('Não foi possível renovar a permissão de atualização:',error);}

      // A referência inicial só é exibida se a consulta central falhar ou estiver vazia.
      document.getElementById("reset-data-btn")?.setAttribute("hidden", "");
      window.clearLatestSnapshot?.().catch(() => {});
      const response = await fetch(dataUrl, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível consultar a base central.");
      canUpdate = Boolean(result.canUpdate);
      if (result.dataset) {
        centralLoaded=true;
        finishInitialLoad();
        document.getElementById("data-origin").textContent = "Base central";
        window.setDashboardData?.(result.dataset);
        status("Base central carregada para todos os visualizadores.", "ready");
        document.getElementById("data-date").textContent = "publicada em " + new Date(result.updatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
        await reflectData('central',result.dataset,result.updatedAt);
      } else {
        finishInitialLoad();showInitialFallback();
        await reflectData('empty');
        status(canUpdate ? "Base inicial carregada. Ao buscar novos arquivos, ela passará a ser a base central." : "Base inicial carregada. Aguardando a primeira atualização central.", "ready");
      }
      configureImport(canUpdate);
    } catch (error) {
      console.warn(error);
      finishInitialLoad();showInitialFallback();
      status((centralLoaded?'A última base carregada foi mantida. ':'Base inicial em exibição. ')+(error.message||'A base central está indisponível no momento.')+' Use Tentar reconectar ou Update para tentar novamente.', "error");
      await reflectData('error');
      configureImport(canUpdate);
    }
  }

  function configureImport(allowed) {
    if (!originalButton || !originalInput) return;
    const button = replaceControl(document.getElementById("import-folder-btn"));
    const input = replaceControl(document.getElementById("data-folder-input"));
    publishButton = button;
    button.disabled = !allowed;
    button.title = allowed ? "Selecionar arquivos para revisão; a conexão será conferida antes de publicar" : "Somente o responsável autorizado pode atualizar a base";
    if (!allowed) return;
    button.addEventListener("click", async () => {
      try {
        const ui=await import('./import-review.js');
        const choice=await ui.chooseImport();
        if(choice?.kind==='files')await publishFiles(choice.files,null,choice.mode);
        else if(choice?.kind==='history'){
          const response=await fetch(dataUrl+'?history=latest',{cache:'no-store'});
          const result=await response.json();
          if(!response.ok||!result.dataset)throw Error('Não há uma versão anterior disponível para restaurar.');
          await publishFiles(null,result.dataset);
        }
      } catch(error){updateFeedback(error.message||'Não foi possível preparar a atualização.','error');}
    });
    input.addEventListener("change", () => {
      if (input.files?.length) publishFiles(input.files,null,'schools');
      input.value = "";
    });
  }

  async function publishFiles(fileList,restoreDataset=null,mode='schools') {
    let ui;
    try {
      if(publishButton){publishButton.disabled=true;publishButton.textContent='Analisando…';}
      const [guard,review]=await Promise.all([import('./inventory-validation.js'),import('./import-review.js')]);ui=review;
      const files=fileList?[...fileList]:[];
      updateFeedback(restoreDataset?'Preparando a versão anterior para revisão…':'Lendo e verificando os arquivos selecionados…','loading');
      let ignoredRows=0,positions,importedDataset;
      if(!restoreDataset){
        const inspection=await guard.inspectFiles(files,window.XLSX,{checkIdentity:true});
        positions=inspection.positions;importedDataset=inspection.dataset;
        ignoredRows=inspection.ignoredRows||0;
        if(inspection.errors.length){document.getElementById('central-update-notice')?.close();await ui.showImportProblems(inspection.errors);status('Atualização bloqueada. A base atual foi mantida.','error');return;}
      }
      const dataset=restoreDataset||importedDataset||await window.buildDashboardDataFromFiles(files);
      if(positions){const indexes=new Map();for(const row of dataset.records){const key=row.arquivo+'\0'+row.aba,index=indexes.get(key)||0;row._sourceRow=positions.get(key)?.[index];indexes.set(key,index+1);}}
      const local=guard.inspectDataset(dataset);
      if(local.errors.length){document.getElementById('central-update-notice')?.close();await ui.showImportProblems(local.errors);status('Atualização bloqueada. A base atual foi mantida.','error');return;}
      updateFeedback('Conferindo a nova base com a versão publicada. Nada foi substituído.','loading');
      const submission={mode:restoreDataset?'restore':mode,dataset};
      const preview=await fetch(dataUrl+'/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(submission)});
      const prepared=await preview.json();
      document.getElementById('central-update-notice')?.close();
      if(!preview.ok){
        if(preview.status===400&&Array.isArray(prepared.errors)&&prepared.errors.length)await ui.showImportProblems(prepared.errors);
        else updateFeedback(prepared.error||'Não foi possível preparar a revisão. Tente novamente em instantes. Nenhum dado foi publicado.','error');
        return;
      }
      const accepted=await ui.reviewImport(prepared.report,{restoring:Boolean(restoreDataset),ignoredRows});
      if(!accepted){status('Atualização cancelada. A base publicada permanece intacta.','ready');return;}
      updateFeedback('Publicando a versão conferida. Aguarde a confirmação…','loading');
      const response=await fetch(dataUrl,{method:'POST',headers:{'Content-Type':'application/json','X-Inventory-Approval':prepared.approval},body:JSON.stringify(submission)});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'A nova base não pôde ser publicada.');
      window.setDashboardData?.(result.dataset);
      await reflectData('central',result.dataset,result.updatedAt);
      document.getElementById('data-origin').textContent='Base central';
      document.getElementById('data-date').textContent='publicada em '+new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
      window.showView?.('overview');
      updateFeedback((restoreDataset?'Versão anterior restaurada':mode==='schools'?'Escolas atualizadas':'Base substituída')+' com sucesso. Base central: '+formatNumber(result.records)+' registros e '+prepared.report.after.schools+' escolas. '+(mode==='schools'&&!restoreDataset?'As demais escolas foram preservadas. ':'')+'A versão anterior foi preservada.','success');
    } catch(error){console.error(error);updateFeedback(error.message||'O envio falhou. Recarregue para conferir a versão publicada.','error');}
    finally{if(publishButton){publishButton.disabled=false;publishButton.textContent='Update';}}
  }

  // Apply the shared dataset only after controls and navigation are initialized.
  window.inventoryReady.then(loadCentralData).catch(error => {
    console.error(error);
    status("Não foi possível iniciar o painel. Recarregue a página.", "error");
  });
})();
