import * as THREE from 'three';

// A connected pavilion, not another repeated bedroom: fitness side, recovery
// seating and a refreshment bar flank a broad route between two entrances.
export function buildWellnessWing(m){
 const y=3.4,b=(...a)=>m.box(...a),d=(x,h,z,w,hh,dd,mat)=>b(x,y+h,z,w,hh,dd,mat,false,true);
 b(-18.5,y-.12,-4,9,.24,12,'oakFloor');b(-18.5,6.68,-4,9.3,.24,12.3,'plaster');
 m.wall('x',-23,-10,2,y,[{at:-5,width:7,height:2.55,sill:.3,kind:'glass'}],'stone');
 m.wall('z',-10,-23,-14,y,[{at:-18,width:3,height:2.2,sill:.6,kind:'glass'}],'plaster',true);
 m.wall('z',2,-23,-14,y,[{at:-18,width:1.2,height:2.3,kind:'door',name:'Wellness courtyard door'},{at:-21,width:2.2,height:2.1,sill:.6,kind:'glass'}],'plaster',true);
 b(-18,3.28,3.1,4.2,.24,2.2,'stone');
 m.rug(-21,y,-4.5,2.2,7,'blueRug');
 // Two low treadmills provide kneeling cover; their frames and consoles attach
 // to the same floor footprints instead of filling the circulation lane.
 for(const z of [-6.8,-3.5]){
  b(-21,y+.15,z,1.05,.3,2,'black');d(-21,.315,z,.84,.025,1.7,'darkStone');
  for(const x of [-21.48,-20.52]){d(x,.8,z-.7,.045,1.3,.045,'steel');d(x,1.17,z-.35,.045,.04,.8,'steel');}
  d(-21,1.4,z-.72,1.1,.34,.06,'metal');d(-21,1.41,z-.68,.84,.22,.02,'screen');
 }
 m.sofaFacing(-21,y,.1,2.7,-21,-1.25);m.table(-21,y,-1.25,1.3,.65,.42);
 // Wall-mounted training mirrors and a timber bench create a different palette.
 d(-21.15,1.65,-9.85,2.6,1.9,.025,'steel');for(const x of [-22.48,-19.82])d(x,1.65,-9.82,.04,1.98,.03,'metal');
 b(-15.25,y+.45,-8.2,1.1,.9,2.5,'walnut');b(-15.25,y+.94,-8.2,1.2,.08,2.6,'marble');
 for(const z of [-8.9,-8.5,-8.1])m.cylinder(-15.25,y+1.1,z,.065,.24,'white');
 b(-15.3,y+.28,-.3,1.2,.56,2,'walnut');d(-15.3,.63,-.3,1.12,.14,1.95,'fabric');
 // Weight rack and recovery storage stay against solid wall spans.
 b(-15.25,y+.58,-2.4,.65,1.16,1.5,'walnut');
 for(const h of [.55,1.16])for(const z of [-2.9,-2.4,-1.9]){
  const rod=m.cylinder(-15.25,y+h+.08,z,.015,.32,'steel');rod.rotation.z=Math.PI/2;
  for(const x of [-15.39,-15.11]){const weight=m.cylinder(x,y+h+.08,z,.075,.055,'black');weight.rotation.z=Math.PI/2;}
 }
 b(-15.6,y+.42,1.52,2.7,.84,.55,'walnut');
 for(let i=0;i<3;i++)for(let j=0;j<2;j++)d(-16.3+i*.65,.9+j*.075,1.52,.48,.07,.4,j?'linen':'white');
 m.sign('RECOVERY',-15.6,y+1.55,1.84,Math.PI);
 m.plant(-15.4,y,-9.4,.4);m.plant(-22,y,1.1,.35);
 m.lamp(-18,y+2.97,-6.5);m.lamp(-18,y+2.97,-.5);
 m.sign('WELLNESS / RECOVERY',-18,5.8,-9.85,0);
 // Timber battens and roof-edge planting make this wing recognizable outside.
 for(let z=-9.6;z<1.8;z+=.65)d(-23.2,1.65,z,.12,3.2,.1,'walnut');
 for(const z of [-9.95,1.95])b(-18.5,7.25,z,9,.9,.12,'stone');b(-22.95,7.25,-4,.12,.9,12,'stone');
 for(const z of [-8,.2]){b(-21.5,7.05,z,1.5,.5,1.3,'stone');m.plant(-21.5,7.3,z,.45);}
}
