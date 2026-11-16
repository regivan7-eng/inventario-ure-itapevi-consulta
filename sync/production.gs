/** Consumidor dos candidatos: usa o mesmo doPost e LockService da integração existente. */
function processGithubCandidate_(collection,overrideText) {
 const names={'inventory':'inventory.json','blue-monitor':'blue-monitor.json'};
 if(!names[collection])throw Error('Coleção inválida.');
 const url='https://raw.githubusercontent.com/regivan7-eng/inventario-ure-itapevi-consulta/refs/heads/sync-data/candidates/'+names[collection];
 const response=overrideText?null:UrlFetchApp.fetch(url,{muteHttpExceptions:true});
 if(response&&response.getResponseCode()!==200)throw Error('Candidato indisponível.');
 const c=JSON.parse(overrideText||response.getContentText());
 if(c.kind!==collection||typeof c.same!=='boolean'||!Number.isInteger(c.records)||c.records<1||!Number.isInteger(c.files)||c.files<1||!/^[\w-]{1,100}$/.test(c.requestId||'')||!Number.isFinite(Date.parse(c.createdAt))||Date.now()-Date.parse(c.createdAt)>7200000||Date.parse(c.createdAt)>Date.now()+300000||!Number.isFinite(Date.parse(c.expectedUpdatedAt)))throw Error('Candidato inválido ou vencido.');
 if(typeof c.payload!=='string'||c.payload.length>15000000||!/^[A-Za-z0-9+/=]+$/.test(c.payload)||sha_(c.payload)!==c.payloadSha)throw Error('Integridade do candidato falhou.');
 const book=SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('INVENTORY_SPREADSHEET_ID'));
 const index=book.getSheetByName(collection==='inventory'?'Versoes':'BlueVersoes');
 if(!index||index.getLastRow()<2)throw Error('Base central ausente.');
 const row=index.getRange(index.getLastRow(),1,1,6).getValues()[0],when=date_(row[1]);
 if(when!==c.expectedUpdatedAt||String(row[5])!==c.expectedPayloadSha)throw Error('A base central mudou; candidato não aplicado.');
 if(c.same)return {collection:collection,phase:'unchanged',records:c.records};
 const token=PropertiesService.getScriptProperties().getProperty('INVENTORY_TOKEN');
 const request={token:token,collection:collection,action:'save',payload:c.payload,sha256:c.payloadSha,email:'automatic-sync',name:'Atualização automática',records:c.records,updatedAt:new Date().toISOString(),requestId:c.requestId,expectedUpdatedAt:c.expectedUpdatedAt};
 const result=JSON.parse(doPost({postData:{contents:JSON.stringify(request)}}).getContent());
 if(!result.ok)throw Error('Publicação não confirmada; a base deve ser conferida.');
 return {collection:collection,phase:result.repeated?'repeated':'updated',records:c.records};
}
function runGithubInventorySync() {
 const now=new Date(),tz='America/Sao_Paulo',day=Number(Utilities.formatDate(now,tz,'u')),hour=Number(Utilities.formatDate(now,tz,'H'));
 if(day>5||hour<8||hour>18)return;
 for(const collection of ['inventory','blue-monitor']){
  try{console.log(JSON.stringify(processGithubCandidate_(collection)));}
  catch(e){console.error(collection+': '+String(e.message||e));}
 }
}
function installGithubInventorySync() {
 const handler='runGithubInventorySync';
 if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()===handler))ScriptApp.newTrigger(handler).timeBased().everyMinutes(5).create();
 console.log('Acionador instalado; processamento limitado a dias úteis, 8h às 18h em Brasília.');
}
