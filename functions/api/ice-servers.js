const STUN=[{urls:['stun:stun.cloudflare.com:3478','stun:stun.l.google.com:19302']}];
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

export async function onRequest({request,env}){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
 const origin=request.headers.get('Origin');
 if(origin&&origin!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Use the game website.'},403);
 if(!env.TURN_KEY_ID||!env.TURN_KEY_API_TOKEN)return json({iceServers:STUN,relayAvailable:false});
 if(env.TURN_RATE_LIMITER){const result=await env.TURN_RATE_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'});if(!result.success)return json({error:'Please wait before reconnecting.'},429);}
 try{
  const response=await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`,{
   method:'POST',headers:{Authorization:`Bearer ${env.TURN_KEY_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({ttl:14400}),signal:AbortSignal.timeout(6000)
  });
  if(!response.ok)return json({error:'Relay credentials are temporarily unavailable.'},503);
  const data=await response.json();
  // Whitelist fields: provider errors and the master token never reach clients.
  const servers=(Array.isArray(data.iceServers)?data.iceServers:[]).map(s=>({urls:(Array.isArray(s.urls)?s.urls:[s.urls]).filter(u=>typeof u==='string'&&/^stun:|^turns?:/.test(u)&&!/:53(?:\?|$)/.test(u)),...(typeof s.username==='string'?{username:s.username}:{}),...(typeof s.credential==='string'?{credential:s.credential}:{})})).filter(s=>s.urls.length);
  const relay=servers.some(s=>s.urls.some(u=>/^turns?:/.test(u))&&s.username&&s.credential);
  if(!relay)return json({error:'Relay credentials are temporarily unavailable.'},503);
  return json({iceServers:servers,relayAvailable:true,expiresAt:Date.now()+14400000});
 }catch{return json({error:'Relay credentials are temporarily unavailable.'},503);}
}
