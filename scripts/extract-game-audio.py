"""Extract only mapped placeholder SFX; never execute the source game."""
from pathlib import Path
import UnityPy,json
selected={'sharedassets0.assets':{1141:'pistolShot',1069:'sniperShot',1026:'dryFire',997:'scope',1062:'grenadeBounce',1077:'frag',1092:'smoke',1031:'glassBreak',1085:'door',1248:'impact',987:'pain1',1167:'pain2',1205:'pain3',1106:'land',985:'uiHover',986:'hit',983:'headshot'},'resources.assets':{2425:'pistolMagOut',2390:'pistolMagIn',2456:'pistolSlide',2435:'sniperDraw',2438:'sniperMagOut',2485:'sniperMagIn',2488:'sniperBolt',2458:'casing',2512:'pin',2482:'throw',2445:'death1',2449:'death2'}}
out=Path('artifacts/cs-audio/raw');out.mkdir(parents=True,exist_ok=True)
env=UnityPy.load(r'E:\Builds\builds_Data\data.unity3d');rows=[]
for o in env.objects:
 key=selected.get(o.assets_file.name,{}).get(o.path_id)
 if o.type.name!='AudioClip' or not key:continue
 d=o.read();samples=d.samples
 if not samples:raise RuntimeError('No decoded sample '+key)
 name,data=next(iter(samples.items()));path=out/(key+'.wav');path.write_bytes(data)
 rows.append({'key':key,'asset':o.assets_file.name,'pathId':o.path_id,'sourceName':d.m_Name,'duration':d.m_Length,'rawFile':str(path)})
Path('artifacts/cs-audio/extracted.json').write_text(json.dumps(rows,indent=2));print(json.dumps({'extracted':len(rows),'clips':rows}))
