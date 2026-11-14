// Compact authoritative fluid state. Droplets and ripples remain local effects.
export function liquidState(system){
 if(!system)return null;
 return {bodies:system.bodies.map(b=>({id:b.mesh.userData.netWorldId,volume:b.volume})),cells:[...system.cells.values()].filter(c=>c.volume>.000001).map(c=>[c.x,c.z,c.floor,c.volume]),spilled:system.spilled};
}
export function applyLiquidState(system,state){
 if(!system||!state)return;
 for(const data of state.bodies){const body=system.bodies.find(b=>b.mesh.userData.netWorldId===data.id);if(!body)continue;body.volume=Math.max(0,Math.min(body.initialVolume,data.volume));body.level=body.bottom+body.volume/body.area;body.mesh.position.y=body.level;body.mesh.visible=body.volume>.0001;if(body.gameplayArea)body.gameplayArea.surface=body.level;}
 system.cells.clear();for(const [x,z,floor,volume] of state.cells){const key=`${x},${z},${Math.round(floor*20)}`;system.cells.set(key,{key,x,z,floor,volume});}
 system.spilled=state.spilled;
}
