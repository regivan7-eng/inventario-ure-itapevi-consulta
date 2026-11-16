const {chromium} = require('playwright-core');
(async () => {
 const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 try {
  const page = await browser.newPage();
  page.on('console', msg => { if (msg.type()==='error' || msg.type()==='warning') console.log('Console:',msg.type(),msg.text().slice(0,300)); });
  page.on('pageerror', err=>console.log('Erro:',err.message));
  await page.goto('https://regivan7-eng.github.io/inventario-ure-itapevi-consulta/?check='+Date.now()+'#centralizados',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(() => document.querySelector('#cc-comparison')?.innerText.includes('Conciliação por escola'),{timeout:90000});
  await page.waitForSelector('#data-origin');
  const origin=await page.locator('#data-origin').innerText();
  console.log('Origem da base:',origin);
  if(!origin.includes('Base central')) throw Error('Base central não foi carregada: '+origin);
  const text=await page.locator('#cc-comparison').innerText();
  const footer=await page.locator('.cc-reconcile-footer').innerText();
  console.log('Rodapé:', footer.replace(/\s+/g,' '));
  const response=await fetch('https://raw.githubusercontent.com/regivan7-eng/inventario-ure-itapevi-consulta/sync-data/candidates/centralized.json?check='+Date.now());
  if (!response.ok) throw Error('Cópia de Centralizados indisponível');
  const source=await response.json();
  const date=new Date(source.sourceModified).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
  if (!text.includes('Recebidos')) throw Error('Total de recebidos não foi carregado');
  if (!footer.includes(date)) throw Error('Fonte atualizada não foi refletida no painel: '+date);
  console.log('Comparativo atualizado carregado com sucesso.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
