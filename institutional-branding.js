(() => {
  'use strict';
  // Shared by the general report and each school's complete inventory.
  const closing = '<section class="report-closing" aria-label="Assinatura e identificação institucional"><div class="report-signature"><div class="report-signature-line" aria-hidden="true"></div><p>Assinatura do responsável SEINTEC/SETEC</p></div><footer class="report-institutional-footer"><span><strong>SEINTEC</strong><span>Seção de Informação e Tecnologia</span></span><span><strong>URE - Itapevi</strong><span>Unidade Regional de Ensino de Itapevi</span></span></footer></section>';
  const report = content => '<div class="report-branding" aria-label="SEINTEC e URE Itapevi"><span class="report-seintec"><img src="SEINTEC_01.png" alt="SEINTEC — Seção de Informação e Tecnologia"></span><img class="report-ure-logo" src="LogoURE_VFinal_NEW.png" alt="Unidade Regional de Ensino de Itapevi"></div><p class="report-system-name">Sistema Integrado SEINTEC · URE - Itapevi</p>'+content+closing;
  window.inventoryBranding={report};
})();

