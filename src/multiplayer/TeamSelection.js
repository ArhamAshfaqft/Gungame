export function chooseSide(players,side='auto'){
 if(!['auto','red','blue','spectator'].includes(side))throw new Error('Choose Red, Blue, or Spectator.');
 if(side==='spectator')return{team:-1,spectator:true};
 const counts=[0,0];for(const p of players)if(!p.spectator&&p.team>=0)counts[p.team]++;
 const team=side==='red'?0:side==='blue'?1:counts[0]<=counts[1]?0:1;
 if(counts[team]>=2)throw new Error(`${team===0?'Red':'Blue'} team is full (2 players). Choose the other side or Spectator.`);
 return{team,spectator:false};
}
export function spectatorTargets(players,own){return players.filter(p=>p.id!==own.id&&!p.spectator&&p.hp>0&&(own.spectator||p.team===own.team)).map(p=>p.id);}
