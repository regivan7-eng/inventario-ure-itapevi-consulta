const {chromium} = require('playwright-core');
(async () => {
 const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 try {
  const page = await browser.newPage();
  await page.goto('https://regivan7-eng.github.io/inventario-ure-itapevi-consulta/?check='+Date.now()+'#centralizados',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(() => document.querySelector('#cc-comparison')?.innerText.includes('Conciliação por escola'),{timeout:90000});
  const text=await page.locator('#cc-comparison').innerText();
  const footer=await page.locator('.cc-reconcile-footer').innerText();
  console.log('Rodapé:', footer.replace(/\s+/g,' '));
  if (!text.includes('18.542')) throw Error('Total de recebidos não foi carregado');
  if (!footer.includes('26/10/2026')) throw Error('Fonte atualizada não foi refletida no painel');
  console.log('Comparativo atualizado carregado com sucesso.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
