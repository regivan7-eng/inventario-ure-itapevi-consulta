(() => {
  'use strict';
  const columns=['Serial Number','Device Name','Unit Name','Unit CIE Code','Last Sync','Status','City','Usage Type','Model','Client Image Version','Device UUID','Type'];
  function parse(input){
    const value=String(input).replace(/^\uFEFF/,'');
    // Detectar o delimitador somente no cabeçalho, ignorando separadores entre aspas.
    let quoted=false,commas=0,semicolons=0;
    for(let i=0;i<value.length;i++){
      const c=value[i];
      if(c==='"'){if(quoted&&value[i+1]==='"')i++;else quoted=!quoted;}
      else if(!quoted){if(c==='\r'||c==='\n')break;if(c===',')commas++;if(c===';')semicolons++;}
    }
    const delimiter=semicolons>commas?';':',';
    const rows=[];let row=[],field='';quoted=false;
    for(let i=0;i<value.length;i++){
      const c=value[i];
      if(c==='"'){if(quoted&&value[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
      else if(c===delimiter&&!quoted){row.push(field);field='';}
      else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&value[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';}
      else field+=c;
    }
    if(quoted)throw Error('O CSV contém aspas não fechadas. A base anterior foi mantida.');
    row.push(field);if(row.some(v=>v.trim()))rows.push(row);
    const [rawHeader,...data]=rows,header=rawHeader?.map(v=>v.trim());
    if(!header||!['Serial Number','Device Name','Last Sync','Status'].every(key=>header.includes(key)))throw Error('O CSV não contém as colunas esperadas do Blue Monitor.');
    if(new Set(header).size!==header.length)throw Error('O CSV contém cabeçalhos repetidos.');
    if(!data.length)throw Error('O CSV não contém equipamentos. A base anterior foi mantida.');
    return data.map(values=>{
      if(values.length!==header.length)throw Error('Uma linha do CSV tem quantidade de colunas diferente do cabeçalho.');
      return Object.fromEntries(columns.map(column=>[column,header.includes(column)?values[header.indexOf(column)]:'']));
    });
  }
  window.blueMonitorCsv={columns,parse};
})();
