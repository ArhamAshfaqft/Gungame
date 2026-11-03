import fs from 'node:fs';import * as T from 'three';import {VillaMap,VILLA_ROOMS} from '../src/world/VillaMap.js';
const m=new VillaMap(new T.Scene()),parts=[],esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
const rect=(x,y,w,h,fill,stroke='none')=>parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}"/>`);
const line=(x,y,a,b,color,width=2)=>parts.push(`<path d="M${x},${y}L${a},${b}" fill="none" stroke="${color}" stroke-width="${width}"/>`);
const text=(x,y,t,size=11,color='#263e4b')=>parts.push(`<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" fill="${color}">${esc(t)}</text>`);
parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="1680" height="500" viewBox="0 0 1680 500"><rect width="1680" height="500" fill="#f5f7f8"/><g font-family="Arial,sans-serif">');text(840,38,'SOLSTICE VILLA — CIRCULATION AND ROOM PLAN',23);text(840,64,'Built geometry reference · doors shown as openings · furniture footprints shaded · dimensions in metres',12);
for(const [index,level] of [0,3.4,6.8].entries()){
 const ox=36+index*550,X=x=>ox+(x+24)*10,Z=z=>110+(z+11)*10;text(ox+245,98,['B1 / SERVICE','1F / RECEPTION','2F / PRIVATE'][index],17);
 for(const [y,a,b,c,d,name] of VILLA_ROOMS)if(y===level)rect(X(a),Z(c),(b-a)*10,(d-c)*10,['#e8ddd0','#e4ece4','#e4e8f1'][index],'#d5dadd');
 rect(X(-2.7),Z(-11),54,220,'#d6e9f3');
 for(const b of m.colliders){if(!b.supportMesh?.userData.collider||b.villaPanel||b.ramp||b.max.y<=level+.15||b.min.y>=level+1.8||b.max.y-b.min.y>2.9)continue;const w=b.max.x-b.min.x,d=b.max.z-b.min.z,cx=(b.min.x+b.max.x)/2,cz=(b.min.z+b.max.z)/2;if(w>8&&d>8||cz< -11||cz>11||!(cx>=-14&&cx<=14||cx>=14&&cx<=24&&cz>=-10&&cz<=2||level===3.4&&cx>=-23&&cx<=-14&&cz>=-10&&cz<=2))continue;rect(X(b.min.x),Z(b.min.z),w*10,d*10,'#c1c7ca');}
 for(const w of m.wallSpecs){if(w.base!==level)continue;let cursor=w.from;const draw=(a,b)=>{if(b<=a)return;if(w.axis==='x')line(X(w.coord),Z(a),X(w.coord),Z(b),'#29414c');else line(X(a),Z(w.coord),X(b),Z(w.coord),'#29414c');};
  for(const o of [...w.openings].sort((a,b)=>a.at-b.at)){draw(cursor,o.at-o.width/2);const a=o.at-o.width/2,b=o.at+o.width/2;if(w.axis==='x')line(X(w.coord),Z(a),X(w.coord),Z(b),o.kind==='glass'?'#6cb9c5':'#3684b0',1);else line(X(a),Z(w.coord),X(b),Z(w.coord),o.kind==='glass'?'#6cb9c5':'#3684b0',1);cursor=b;}draw(cursor,w.to);
 }
 for(const [a,b] of [[-1.3,1.3],[10.45,12.55]]){rect(X(a),Z(-8),(b-a)*10,70,'#aac0cb','#506c7c');for(let z=-7.8;z<-1;z+=.5)line(X(a),Z(z),X(b),Z(z),'#6c8898',.6);}
 for(const [y,a,b,c,d,name] of VILLA_ROOMS)if(y===level){const words=name.split(' '),mid=Math.ceil(words.length/2),x=X((a+b)/2),z=Z((c+d)/2);if(name.length>15){text(x,z,words.slice(0,mid).join(' '),10);text(x,z+12,words.slice(mid).join(' '),10);}else text(x,z,name,10);}
 text(ox+245,374,['Workshop and service loops','Public rooms, garden and wellness loop','Private rooms and guarded terraces'][index],12);
}
text(840,420,'Ordinary doors: 1.35–1.45 m  |  Central hall: 5.4 m  |  Pantry: rear-corner enclosure  |  Two internal stair routes',13);
text(840,447,'Intentional destructible floor breaches remain possible. Intact floors and guarded landings are checked separately.',12);
parts.push('</g></svg>');fs.writeFileSync('docs/villa-floorplan.svg',parts.join('\n'));console.log('Wrote docs/villa-floorplan.svg');
