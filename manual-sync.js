(() => {
  const label = 'Recarregar dados';
  const description = 'Recarregar a última versão publicada das fontes do SharePoint';

  function prepareButton() {
    const button = document.getElementById('import-folder-btn');
    if (!button || (button.textContent === label && !button.disabled && button.title === description)) return;
    button.textContent = label;
    button.title = description;
    button.disabled = false;
  }

  document.addEventListener('click', event => {
    if (!event.target.closest?.('#import-folder-btn')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.reload();
  }, true);

  window.inventoryReady?.then(() => {
    prepareButton();
    const container = document.getElementById('import-folder-btn')?.parentElement;
    if (container) new MutationObserver(prepareButton).observe(container, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'title']
    });
  });
})();
