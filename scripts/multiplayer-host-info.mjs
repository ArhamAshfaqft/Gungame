import {networkInterfaces} from 'node:os';
export function hostAddresses(interfaces=networkInterfaces()){
 const entries=[];
 for(const [name,addresses] of Object.entries(interfaces))for(const address of addresses||[]){
  if(address.family!=='IPv4'||address.internal||address.address.startsWith('169.254.'))continue;
  const ip=address.address,privateIP=/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  entries.push({ip,rank:(privateIP?0:2)+(/virtual|docker|vethernet|vmware|vbox/i.test(name)?1:0)});
 }
 return [...new Set(entries.sort((a,b)=>a.rank-b.rank).map(entry=>entry.ip))];
}
export function multiplayerHostInfo(){
 return {
  name:'multiplayer-host-info',
  configureServer(server){
   server.middlewares.use('/__multiplayer/host-info',(_req,res)=>{
    res.setHeader('Content-Type','application/json');
    res.setHeader('Cache-Control','no-store');
    res.end(JSON.stringify({addresses:hostAddresses()}));
   });
  }
 };
}
