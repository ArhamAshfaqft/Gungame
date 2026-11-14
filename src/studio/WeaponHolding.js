export const HOLDING_SLOTS=['assault','primary','pistol'];
export function emptyWeaponHolding(handFactory){
    return Object.fromEntries(HOLDING_SLOTS.map(slot=>[slot,{
        enabled:false,
        ready:{position:[.16,-.10,-.32],rotation:[0,0,0]},
        aim:{position:[.06,0,-.27],rotation:[0,0,0]},
        Left:handFactory(),Right:handFactory()
    }]));
}
export function validateWeaponHolding(input,defaults){
    const vector=(v,limit)=>{if(!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isFinite(n)||Math.abs(n)>limit))throw Error('Invalid stable weapon holding coordinate.');return [...v];};
    for(const slot of HOLDING_SLOTS){
        const from=input?.[slot],to=defaults[slot];if(!from)continue;
        if(typeof from.enabled!=='boolean')throw Error('Invalid stable holding option.');to.enabled=from.enabled;
        for(const stance of ['ready','aim'])for(const field of ['position','rotation'])to[stance][field]=vector(from[stance]?.[field]??to[stance][field],field==='rotation'?Math.PI:.8);
        for(const side of ['Left','Right']){
            const hand=from[side];if(!hand)continue;
            for(const field of ['position','rotation','shoulder','elbowTarget','shoulderRotation','elbowRotation','thumbRotation'])to[side][field]=vector(hand[field]??to[side][field],/rotation/i.test(field)?Math.PI:.6);
            for(const finger of Object.keys(to[side].fingers))to[side].fingers[finger]=vector(hand.fingers?.[finger]??to[side].fingers[finger],1.6);
            if(hand.contact!=null)to[side].contact={weaponPoint:vector(hand.contact.weaponPoint,10),palmPoint:vector(hand.contact.palmPoint,100)};
        }
    }
    return defaults;
}
