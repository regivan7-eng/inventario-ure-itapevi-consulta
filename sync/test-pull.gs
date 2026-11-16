// Exclusivo para a planilha de teste; não instala acionadores.
function testPullCandidate() {
 const url='https://raw.githubusercontent.com/regivan7-eng/inventario-ure-itapevi-consulta/refs/heads/sync-data/candidates/inventory.json';
 const response=UrlFetchApp.fetch(url,{muteHttpExceptions:true});
 if(response.getResponseCode()!==200)throw Error('Candidato indisponível: HTTP '+response.getResponseCode());
 const candidate=JSON.parse(response.getContentText());
 if(candidate.kind!=='inventory'||shaCandidate_(candidate.payload)!==candidate.payloadSha)throw Error('Candidato inválido.');
 const book=SpreadsheetApp.openById(TEST_BOOK_ID),index=book.getSheetByName('Versoes');
 const row=index.getRange(index.getLastRow(),1,1,6).getValues()[0];
 candidate.expectedUpdatedAt=row[1] instanceof Date?row[1].toISOString():String(row[1]);
 candidate.expectedPayloadSha=String(row[5]);
 candidate.requestId=Utilities.getUuid();
 const before=index.getLastRow(),result=applyCandidateTest_(TEST_BOOK_ID,candidate);
 if(!result.saved||index.getLastRow()!==before+1)throw Error('Teste de gravação não confirmado.');
 const newRow=index.getRange(index.getLastRow(),1,1,6).getValues()[0];
 if(String(newRow[5])!==candidate.payloadSha)throw Error('Teste de integridade após gravação falhou.');
 console.log('Fluxo GitHub → cópia de teste confirmado. Registros: '+candidate.records);
}