// Real domestic wooden-door recordings; see public/assets/audio/doors/NOTICE.md.
// Use the same packed format as the combat bank, decoded once per audio context.
export function loadWoodenDoors(bank){
 if(bank.woodenDoorsLoading)return bank.woodenDoorsLoading;
 bank.woodenDoorsLoading=fetch('/assets/audio/doors/samples.json').then(response=>{
  if(!response.ok)throw new Error('Door audio unavailable');
  return response.json();
 }).then(pack=>Promise.all(Object.entries(pack.samples).map(async([key,encoded])=>{
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  bank.buffers.set(key,await bank.engine.ctx.decodeAudioData(bytes.buffer));
 }))).catch(()=>{bank.woodenDoorsLoading=null;});
 return bank.woodenDoorsLoading;
}
