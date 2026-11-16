(() => {
 const workflow='https://github.com/regivan7-eng/inventario-ure-itapevi-consulta/actions/workflows/preparar-sync.yml';
 function enable(){const b=document.getElementById('import-folder-btn');if(!b)return;b.disabled=false;b.textContent='Update';b.title='Abrir a atualização das fontes no GitHub; exige acesso autorizado';}
 document.addEventListener('click',e=>{const b=e.target.closest?.('#import-folder-btn');if(!b)return;e.preventDefault();e.stopImmediatePropagation();window.open(workflow,'_blank','noopener');},true);
 window.inventoryReady?.then(()=>{enable();setInterval(enable,2000);});
})();
