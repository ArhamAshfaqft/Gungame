export const PUBLIC_STUN=[{urls:['stun:stun.cloudflare.com:3478','stun:stun.l.google.com:19302']}];
export const hasRelay=servers=>servers.some(server=>(Array.isArray(server.urls)?server.urls:[server.urls]).some(url=>/^turns?:/.test(url))&&typeof server.username==='string'&&typeof server.credential==='string');

// Long-lived TURN secrets stay in Pages Functions. Browsers receive expiring
// credentials only when creating/joining a match. Static/local builds still
// support direct connections, but must not claim relay connectivity is ready.
export async function loadIceConfig(fetcher=fetch){
 try{
  const response=await fetcher('/api/ice-servers',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('Relay service unavailable');
  const data=await response.json();
  const servers=Array.isArray(data.iceServers)?data.iceServers.filter(s=>s&&typeof s==='object'&&(typeof s.urls==='string'||Array.isArray(s.urls)&&s.urls.every(u=>typeof u==='string'))):[];
  if(!servers.length)throw Error('Missing connection servers');
  return{config:{iceServers:servers},relayAvailable:hasRelay(servers)};
 }catch{return{config:{iceServers:PUBLIC_STUN},relayAvailable:false};}
}

export function joinTimeoutMessage({relayAvailable,opened=false,iceState=''}){
 if(opened)return 'The host connection opened, but the room did not respond. Keep the host tab active and try a new room.';
 if(!relayAvailable)return 'Could not reach the host over the internet. The game relay is not configured or unavailable; some different-network connections cannot join until it is enabled.';
 if(iceState==='failed')return 'The network connection to the host failed, including the relay. Keep the host tab open and try again.';
 return 'Timed out connecting to the host. Keep the host tab open, check the room code, and try again.';
}
