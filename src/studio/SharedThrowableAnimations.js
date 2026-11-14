// Copy the player's accepted frag poses once, including local Studio edits.
// Subsequent canister adjustments remain independent when the library is saved.
export function shareThrowableAnimations(library){
    if(library.sharedThrowableAnimations===1)return library;
    const clone=value=>value==null?value:structuredClone(value);
    for(const slot of ['flash','smoke']){
        for(const state of ['hold','pin','high','low']){
            const source=library.poses?.[`frag:${state}`];
            if(source)library.poses[`${slot}:${state}`]=clone(source);
        }
        for(const field of ['thirdPerson','thirdPersonGrips','thirdPersonRightGrips','thirdPersonAim','thirdPersonFire','sharedFirstPerson','weaponHolding']){
            if(library[field]?.frag!==undefined)library[field][slot]=clone(library[field].frag);
        }
        for(const key of Object.keys(library.animationEdits||{}))if(key.startsWith(slot+'|'))delete library.animationEdits[key];
        for(const [key,value]of Object.entries(library.animationEdits||{}))if(key.startsWith('frag|'))library.animationEdits[slot+key.slice(4)]=clone(value);
    }
    library.sharedThrowableAnimations=1;
    return library;
}
