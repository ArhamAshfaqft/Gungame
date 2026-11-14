// Retire only the known legacy wrist offsets; weapon placement, reload keys,
// other weapons and independently authored grips retain their saved values.
export function upgradePistolGrips(library){
 if(library.pistolPalmGrip===1)return library;
 const old={Left:{position:[.00923515348763921,.02881590702734385,-.021024116681625793],rotation:[0,0,0]},Right:{position:[.009,.026,.034],rotation:[0,.0890117918517108,.8970992355250853]}};
 for(const state of ['hip','fire','aim'])for(const side of ['Left','Right']){
  const hand=library.poses?.[`pistol:${state}`]?.[side];if(!hand)continue;
  if(['position','rotation'].every(field=>hand[field]?.every((n,i)=>Math.abs(n-old[side][field][i])<1e-7)))for(const field of ['position','rotation'])hand[field]=[0,0,0];
 }
 library.pistolPalmGrip=1;return library;
}
