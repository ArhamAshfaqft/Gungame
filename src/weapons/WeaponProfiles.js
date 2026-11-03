export const WEAPONS = Object.freeze({
    primary: { name: 'M98B // .338', mode: 'BOLT ACTION', magazine: 5, reserve: 35, interval: 0.85,
        reloadTime: 1.3, aimFov: 22, bodyDamage: 125, headDamage: 250, range: 160,
        hip: [0.24, -0.21, -0.64], aim: [-0.016, -0.15, -0.46], recoil: 1 },
    pistol: { name: 'M9 // 9 MM', mode: 'SEMI AUTO', magazine: 15, reserve: 45, interval: 0.18,
        reloadTime: 1.15, aimFov: 62, bodyDamage: 34, headDamage: 100, range: 80,
        hip: [0.17, -0.17, -0.55], aim: [-0.002, -0.093, -0.50], recoil: 0.35 },
});

export function createAmmoStores() {
    return Object.fromEntries(Object.entries(WEAPONS).map(([slot, profile]) =>
        [slot, { ammo: profile.magazine, reserve: profile.reserve, cooldown: 0 }]));
}

// Shared by breakable panels and solid-surface damage. Penetration loss is supplied
// by the raycast; grazing shots transfer less force into the surface.
export function environmentalDamage(slot,distance=0,damage,incidence=1){
 const profile=WEAPONS[slot]||WEAPONS.pistol;
 const start=profile.range*.15;
 const rangeLoss=Math.max(0,Math.min(1,(distance-start)/(profile.range-start)));
 return (damage??profile.bodyDamage)*(1-rangeLoss*.65)*(.35+.65*Math.max(0,Math.min(1,incidence)));
}
