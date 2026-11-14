import {animationKey,ensureAnimationEdit} from './AnimationEdits.js';

// Copy grip adjustments only. Weapon placement, body pose and authored motion
// belong to the destination action and must survive this operation.
export function copyHandGripsToStates(library,slot,clip,source,states){
    if(!clip.startsWith('view_'))throw Error('Grip copying requires a first-person action.');
    const hands=structuredClone({Left:source.Left,Right:source.Right});
    for(const state of states){
        const fallback=library.animationEdits?.[animationKey(slot,'view_all',state)]?.pose||library.poses[`${slot}:${state}`];
        const target=ensureAnimationEdit(library,slot,clip,state,fallback);
        for(const side of ['Left','Right'])target.pose[side]=structuredClone(hands[side]);
    }
}
