import {animationKey,sampleAnimationEdit} from './AnimationEdits.js';

const HOLDING_ACTIONS=new Set([
    'view_idle','view_walk','view_crouch','view_sprint','view_fire','view_bolt',
    'view_peekLeft','view_peekRight','view_crouchPeekLeft','view_crouchPeekRight'
]);

// Holding actions inherit the weapon's authored idle fit. Reload and equip
// retain their independent motion; explicit action edits always take priority.
export function inheritedViewEdit(library,slot,clip,state){
    const map=library.animationEdits;
    return map?.[animationKey(slot,clip,state)]
        ||((HOLDING_ACTIONS.has(clip)||(slot==='pistol'&&clip==='view_reload'))?map?.[animationKey(slot,'view_idle',state)]:null)
        ||map?.[animationKey(slot,'view_all',state)]||null;
}

export function sampleInheritedViewFit(library,slot,clip,state,time=0){
    const edit=inheritedViewEdit(library,slot,clip,state);
    let fit=edit?sampleAnimationEdit(edit,time):library.poses[`${slot}:${state}`]||library.poses[`${slot}:hip`];
    const shared=library.animationEdits?.[animationKey(slot,'view_idle',state)]
        ||library.animationEdits?.[animationKey(slot,'view_idle','hip')];
    // Missing ADS/action grips inherit the authored holding hands, while the
    // ADS weapon transform stays independent for proper sight alignment.
    if(shared&&(HOLDING_ACTIONS.has(clip)||(slot==='pistol'&&clip==='view_reload'))
        &&!library.animationEdits?.[animationKey(slot,clip,state)]){
        const grip=sampleAnimationEdit(shared,time);
        fit={...fit,Left:grip.Left,Right:grip.Right};
    }
    return fit;
}
