const sources=['inventory','blue-monitor'];
// Review once, then publish each valid base independently. Centralizados must
// run last so its comparison uses the Inventory that was actually published.
export async function runAllUpdates({prepare,review,publish,centralized,onProgress=()=>{}}){
 const candidates=await Promise.all(sources.map(async collection=>{try{return {collection,prepared:await prepare(collection)}}catch(error){return {collection,error}}}));
 const changed=candidates.filter(item=>item.prepared&&!item.prepared.unchanged);
 if(changed.length&&!await review(candidates))return {cancelled:true,results:[]};
 const results=[];
 for(const item of candidates){
  const {collection,prepared,error}=item;
  if(error){results.push({collection,status:'failed',message:error.message,problems:error.problems});continue;}
  if(prepared.unchanged){results.push({collection,status:'unchanged',message:'A base já está atualizada.'});continue;}
  try{onProgress(collection);const value=await publish(collection,prepared);results.push({collection,status:'updated',message:'Atualização publicada.',records:value.records});}
  catch(error){results.push({collection,status:'failed',message:error.message,problems:error.problems});}
 }
 try{onProgress('centralizados');await centralized();results.push({collection:'centralizados',status:'updated',message:'Origem conferida e comparação atualizada.'});}
 catch(error){results.push({collection:'centralizados',status:'failed',message:error.message,problems:error.problems});}
 return {cancelled:false,results};
}
