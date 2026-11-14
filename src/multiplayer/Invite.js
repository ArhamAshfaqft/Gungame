export function isLoopback(host){return ['localhost','127.0.0.1','::1','[::1]'].includes(host.toLowerCase());}
export function makeInvite(address,code,map,addresses=[]){
 const url=new URL(address);
 if(!['http:','https:','ws:','wss:'].includes(url.protocol)||url.username||url.password)throw Error('Enter the host’s http:// address.');
 url.protocol=url.protocol==='wss:'?'https:':url.protocol==='ws:'?'http:':url.protocol;
 if(isLoopback(url.hostname)){
  const host=addresses.find(host=>!isLoopback(host));
  if(!host)throw Error('No Wi-Fi address found. Enter the host PC’s reachable address to generate an invite.');
  url.hostname=host;
 }
 // The host serves the built game on its multiplayer port, even when the host
 // is currently playing through a localhost-only Vite development page.
 url.pathname='/';url.search='';url.hash='';url.searchParams.set('multiplayer','1');url.searchParams.set('map',map==='villa'?'villa':'training');url.searchParams.set('room',code);
 return url.href;
}
export async function resolveInvite(address,code,map,{request=fetch}={}){
 const base=new URL(address);let addresses=[];
 if(isLoopback(base.hostname)){
  const info=new URL('/__multiplayer/host-info',base);info.protocol=base.protocol==='wss:'?'https:':base.protocol==='ws:'?'http:':base.protocol;
  // Vite and the private host both expose discovery. The Vite endpoint also
  // supports a server that was started before this endpoint was introduced.
  for(const endpoint of [info.href,'/__multiplayer/host-info']){
   try{const response=await request(endpoint,{cache:'no-store',signal:AbortSignal.timeout(2000)});if(!response.ok)continue;const data=await response.json();addresses=(data.addresses||[]).filter(value=>typeof value==='string'&&/^\d{1,3}(\.\d{1,3}){3}$/.test(value));if(addresses.length)break;}catch{}
  }
 }
 return makeInvite(address,code,map,addresses);
}
