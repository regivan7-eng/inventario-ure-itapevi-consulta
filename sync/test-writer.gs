// Protótipo: permitido apenas na cópia de teste, sem acionadores e sem endpoint de escrita.
const TEST_BOOK_ID = '1nME9qDH7RGp0oerRKNlYoCpZMnNYhUzHt7ZB-ITMNpw';
function shaCandidate_(s) {return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function applyCandidateTest_(bookId, candidate) {
 if (bookId !== TEST_BOOK_ID) throw Error('Somente a cópia de teste é permitida.');
 if (!candidate || !['inventory','blue-monitor'].includes(candidate.kind)) throw Error('Coleção inválida.');
 if (!/^[a-zA-Z0-9-]{1,100}$/.test(candidate.requestId||'') || !/^[A-Za-z0-9+/=]+$/.test(candidate.payload||'') || candidate.payload.length>15000000 || shaCandidate_(candidate.payload)!==candidate.payloadSha) throw Error('Conteúdo inválido.');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try {
  const book=SpreadsheetApp.openById(bookId), blue=candidate.kind==='blue-monitor';
  const index=book.getSheetByName(blue?'BlueVersoes':'Versoes'),chunks=book.getSheetByName(blue?'BlueConteudo':'Conteudo');
  if(!index||!chunks||index.getLastRow()<2)throw Error('Base ausente.');
  const count=index.getLastRow()-1;
  if(index.getRange(2,1,count,1).getValues().some(r=>r[0]===candidate.requestId))return {repeated:true};
  const row=index.getRange(index.getLastRow(),1,1,6).getValues()[0];
  const date=row[1] instanceof Date?row[1].toISOString():String(row[1]);
  if(date!==candidate.expectedUpdatedAt || String(row[5])!==candidate.expectedPayloadSha)throw Error('Conflito: base foi alterada.');
  const parts=candidate.payload.match(/.{1,40000}/g),start=chunks.getLastRow()+1,end=start+parts.length-1;
  if(end>chunks.getMaxRows())chunks.insertRowsAfter(chunks.getMaxRows(),end-chunks.getMaxRows());
  chunks.getRange(start,1,parts.length,2).setValues(parts.map(p=>[candidate.requestId,p]));SpreadsheetApp.flush();
  index.appendRow([candidate.requestId,new Date().toISOString(),'automatic-sync-test',start,parts.length,candidate.payloadSha,'Teste isolado',Number(candidate.records)||0]);SpreadsheetApp.flush();
  return {saved:true,parts:parts.length};
 } finally {lock.releaseLock();}
}
function testCandidateWriter() {
 const book=SpreadsheetApp.openById(TEST_BOOK_ID),index=book.getSheetByName('Versoes'),chunks=book.getSheetByName('Conteudo');
 const row=index.getRange(index.getLastRow(),1,1,8).getValues()[0], date=row[1] instanceof Date?row[1].toISOString():String(row[1]);
 const payload=chunks.getRange(Number(row[3]),1,Number(row[4]),2).getValues().map(r=>r[1]).join('');
 if(shaCandidate_(payload)!==row[5])throw Error('Integridade inicial falhou.');
 const input={kind:'inventory',requestId:Utilities.getUuid(),payload,payloadSha:shaCandidate_(payload),expectedUpdatedAt:date,expectedPayloadSha:row[5],records:row[7]};
 const before=index.getLastRow(),result=applyCandidateTest_(TEST_BOOK_ID,input);
 if(!result.saved||index.getLastRow()!==before+1)throw Error('Gravação não confirmada.');
 if(!applyCandidateTest_(TEST_BOOK_ID,input).repeated||index.getLastRow()!==before+1)throw Error('Deduplicação falhou.');
 let blocked=false;try{applyCandidateTest_(TEST_BOOK_ID,Object.assign({},input,{requestId:Utilities.getUuid()}));}catch(e){blocked=/Conflito/.test(e.message);}
 if(!blocked||index.getLastRow()!==before+1)throw Error('Controle de concorrência falhou.');
 console.log('Teste isolado aprovado: gravação, deduplicação e conflito.');
}
