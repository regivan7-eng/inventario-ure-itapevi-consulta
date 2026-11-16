const names={inventory:'Inventário','blue-monitor':'Blue Monitor'};
const stages={
 source:'Abertura e listagem da pasta pública',download:'Download dos arquivos públicos',
 validation:'Leitura e validação dos arquivos',current:'Consulta da versão publicada',
 comparison:'Comparação com a base atual',publication:'Publicação na base central',
 confirmation:'Registro da conclusão',execution:'Confirmação da execução automática'
};
const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function describeSyncFailure(state={},collection='inventory'){
 const original=Array.isArray(state.errors)?state.errors.map(String):[];
 const text=normalize(original.join(' ')),code=state.failure?.code||'';
 const http=state.failure?.httpStatus||Number(text.match(/http\s+(\d{3})/)?.[1])||null;
 const base=names[collection]||collection;
 const retry='No painel, clique em “Verificar agora” → “'+base+'”. Confira o resultado; se a revisão for aprovada por você, confirme a publicação para resolver o aviso.';
 let kind='unknown',title='Falha sem causa técnica registrada',cause='O registro disponível não identifica a causa exata. Não há informação suficiente para apontar um arquivo ou campo como incorreto.',steps=[retry,'Se a falha persistir, o administrador deve consultar os registros da aplicação e do agendador no horário da tentativa.'];
 if(/disparo automatico|verificacao foi interrompida/.test(text)||state.failure?.stage==='execution'){
  kind='execution';title='Execução automática não confirmada';
  cause='O agendador não recebeu ou não registrou a confirmação de conclusão. Este registro não informa o motivo técnico (por exemplo, código HTTP ou tempo limite); não comprova erro no CSV ou nas planilhas.';
  steps=['Recarregue o painel e confira a data da última publicação desta base antes de repetir a atualização.',retry,'Se a verificação manual funcionar, conclua a revisão e a publicação. Se voltar a falhar, informe ao administrador o horário abaixo para conferir a execução do agendador e os logs do servidor. Não altere os arquivos apenas por este aviso.'];
 }else if(code.startsWith('GOOGLE_')||code==='STORAGE_INTEGRITY'||/base central|integridade/.test(text)&&!text.includes('cie')){
  kind='storage';title=code==='STORAGE_INTEGRITY'?'Falha de integridade da base publicada':'Falha de comunicação com a base central';
  cause=http?'A base central respondeu HTTP '+http+' durante a operação.':code==='STORAGE_INTEGRITY'?'A conferência de integridade da versão recebida falhou.':'A operação de consulta ou gravação na base central não foi confirmada. Isso não identifica um defeito no arquivo de origem.';
  steps=['Recarregue e confira a data da versão publicada antes de repetir a operação.',retry,'Se persistir, o administrador deve verificar a disponibilidade, as permissões e os registros do serviço de armazenamento no horário indicado.'];
 }else if(state.retryable||[408,425,429,500,502,503,504].includes(http)||/temporar|conexao|tempo de espera|timeout/.test(text)){
  kind='connection';title='Falha temporária de conexão'+(http?' · HTTP '+http:'');
  cause=http?'O serviço consultado respondeu HTTP '+http+'. A leitura não pôde ser concluída; esse retorno não comprova erro nos dados nem no compartilhamento.':'A conexão com o serviço consultado falhou ou excedeu o tempo de espera.';
  steps=[state.retryable&&!state.blocked?'Aguarde a próxima tentativa automática, dentro do horário programado, ou execute uma verificação manual.':'A atualização está aguardando conferência manual; use a ação abaixo.',retry,'Não edite células para resolver uma falha de conexão. Se ela persistir, o administrador deve conferir a disponibilidade do serviço no horário indicado.'];
 }else if(/http (401|403)|login|compartilhamento publico|recusou a leitura|link publico/.test(text)){
  kind='access';title='Falha de acesso ao link público';
  cause='O endereço público não permitiu a leitura esperada'+(http?' (HTTP '+http+')':'.');
  steps=['Abra o link de origem em uma janela anônima e confirme que permite visualizar e baixar o arquivo sem login.','Se o acesso público falhar, o responsável pela pasta deve conferir o link e a permissão de leitura já configurados.',retry];
 }else if(/mudou durante|pasta mudou|estado da automacao mudou/.test(text)){
  kind='concurrency';title='Origem ou versão alterada durante a leitura';cause='Os dados mudaram enquanto a atualização estava sendo preparada; é necessário conferir novamente a versão atual.';
  steps=['Aguarde o término da edição ou da publicação em andamento.',retry];
 }else if(/revisao manual necessaria|registros caiu|menos arquivos|nao constam na selecao|nome de escola diferente/.test(text)){
  kind='review';title='Mudança na base exige revisão';cause='A comparação encontrou uma alteração relevante em relação à base publicada. Isso pode ser uma mudança legítima; a confirmação automática foi interrompida para revisão.';
  steps=['Confira abaixo quais quantidades, escolas ou nomes mudaram. Verifique se a pasta ou o CSV está completo.','Se a mudança não for intencional, corrija a origem. Se for intencional, revise os números apresentados e confirme manualmente.',retry];
 }else if(state.failure?.code==='VALIDATION_ERROR'||/csv|cie|coluna|campo|formula|arquivo|planilha|ure|duplic|identific/.test(text)){
  kind='validation';title='Arquivo ou dados incompatíveis';cause='A validação apontou os problemas registrados abaixo. Corrija somente os arquivos e campos identificados antes de publicar.';
  steps=[];
  if(/formula|#ref!|#value!|#div\/0!/.test(text))steps.push('Abra o arquivo e a aba indicados, localize a célula informada e corrija a fórmula ou a referência quebrada. Salve e aguarde a sincronização do arquivo.');
  if(/cie|identific|ure/.test(text))steps.push('Confira o CIE e a identificação da escola nas colunas indicadas. No Blue Monitor, verifique “Unit CIE Code” e “Unit Name”. Use o código oficial da escola; não substitua por um código presumido.');
  if(/faltam|coluna|cabecalho|estrutura/.test(text))steps.push('Restaure os cabeçalhos obrigatórios listados no erro. Preserve seus nomes e a estrutura do modelo de origem.');
  if(/somente o arquivo|identifique o arquivo|formato/.test(text))steps.push(collection==='blue-monitor'?'Mantenha na pasta BlueMonitor somente o arquivo “Relação BLUE MONITOR.csv”, com o nome e o formato esperados.':'Confira o formato e o nome exigidos no erro: CIE - NOME DA ESCOLA - INVENTÁRIO.xlsx.');
  if(/corromp|ilegivel|csv nao gerou|registros invalidos/.test(text))steps.push('Abra o arquivo no programa de origem, confirme que há registros válidos e exporte novamente no formato esperado. Renomear a extensão não converte o arquivo.');
  if(/duplic|identico|mais de um arquivo/.test(text))steps.push('Compare as cópias indicadas e mantenha na pasta de importação apenas a versão completa e atual de cada escola. Preserve as demais cópias fora da pasta importada.');
  if(/limite|excede|ultrapass/.test(text))steps.push('Confira o limite informado e remova apenas conteúdo residual ou arquivos alheios à base. Se os dados válidos excederem o limite, solicite ao administrador o ajuste da capacidade; não descarte registros válidos.');
  if(!steps.length)steps.push('Abra a origem indicada no detalhe e confira a regra informada. Se o registro não indicar a linha ou o campo, execute uma nova verificação para obter um diagnóstico atualizado.');
  steps.push(retry);
 }
 const uncertain=['execution','storage','unknown'].includes(kind);
 return {kind,title,cause,code:state.failure?.code||null,httpStatus:http,
  stage:stages[state.failure?.stage]|| (kind==='execution'?stages.execution:'Etapa não registrada'),
  location:kind==='execution'||kind==='storage'?'Serviço de atualização de '+base:collection==='blue-monitor'?'Pasta BlueMonitor / Relação BLUE MONITOR.csv':'Pasta InventarioRC - V2; arquivo, aba e célula quando informados abaixo',
  impact:uncertain?'O resultado da tentativa não está confirmado. Confira a data da versão publicada antes de repetir a operação.':'Esta falha impediu a publicação desta tentativa; a base anteriormente publicada continua disponível.',
  observed:original.length?original:['A tentativa não registrou detalhes técnicos.'],steps};
}
