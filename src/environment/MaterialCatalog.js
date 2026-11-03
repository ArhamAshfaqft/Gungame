// Shared by every map. Units are metres, kg and gameplay impact/energy budgets;
// these are deliberately calibrated game properties rather than lab measurements.
export const MATERIALS=Object.freeze(Object.fromEntries(Object.entries({
 wood:{density:600,fracture:180,blastScale:1.35,blastReach:1.15,penetrationPerMetre:9000,retention:.82,response:'splinter'},
 plaster:{density:850,fracture:180,blastScale:1.2,blastReach:1.05,penetrationPerMetre:11000,retention:.7,response:'fracture'},
 concrete:{density:2400,fracture:340,blastScale:.35,blastReach:.7,penetrationPerMetre:65000,retention:.5,response:'chip'},
 metal:{density:7800,fracture:Infinity,blastScale:.3,blastReach:.65,penetrationPerMetre:110000,retention:.65,response:'dent'},
 glass:{density:2500,fracture:1,blastScale:1,blastReach:2,penetrationPerMetre:1000,retention:.9,response:'shatter'},
 stone:{density:2600,fracture:230,blastScale:.65,blastReach:.8,penetrationPerMetre:45000,retention:.55,response:'brittle'},
 paper:{density:350,fracture:90,blastScale:1.5,blastReach:1.4,penetrationPerMetre:2500,retention:.85,response:'tear'},
 cloth:{density:70,fracture:120,blastScale:1.2,blastReach:1.2,penetrationPerMetre:1800,retention:.9,response:'tear'},
 ceramic:{density:2100,fracture:110,blastScale:.8,blastReach:1,penetrationPerMetre:22000,retention:.55,response:'brittle'},
}).map(([name,properties])=>[name,Object.freeze({name,...properties})])));
export const VISUAL_MATERIALS=Object.freeze({wood:'wood',walnut:'wood',woodPanel:'wood',oakFloor:'wood',floorPanel:'wood',metal:'metal',steel:'metal',stone:'stone',marble:'stone',bathTile:'stone',concrete:'concrete',plaster:'plaster',softWall:'plaster',fabric:'cloth',linen:'cloth',leather:'cloth',ochre:'cloth',curtain:'cloth',glass:'glass'});
