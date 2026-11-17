"""Keep one supplied character variant and pack only its referenced GLB data."""
from pathlib import Path
import json,struct
source=Path('red-team.glb').read_bytes()
size=struct.unpack_from('<I',source,12)[0]
doc=json.loads(source[20:20+size]);binary=source[28+size:]
# The supplied file repeats the same five mesh parts four times.
for node in doc['nodes']:
 node['children']=[i for i in node.get('children',[]) if doc['nodes'][i].get('mesh',0)<5]
doc['meshes']=doc['meshes'][:5];doc.pop('animations',None)
used=set()
for mesh in doc['meshes']:
 for primitive in mesh['primitives']:
  used.update(primitive['attributes'].values());used.add(primitive['indices'])
for skin in doc['skins']:used.add(skin['inverseBindMatrices'])
indices=sorted(used);mapping={old:new for new,old in enumerate(indices)}
doc['accessors']=[doc['accessors'][i] for i in indices]
for mesh in doc['meshes']:
 for primitive in mesh['primitives']:
  primitive['attributes']={name:mapping[i] for name,i in primitive['attributes'].items()};primitive['indices']=mapping[primitive['indices']]
for skin in doc['skins']:skin['inverseBindMatrices']=mapping[skin['inverseBindMatrices']]
views=sorted({a['bufferView'] for a in doc['accessors']}|{im['bufferView'] for im in doc['images']})
viewmap={old:new for new,old in enumerate(views)};packed=bytearray();newviews=[]
for i in views:
 view=dict(doc['bufferViews'][i]);start=view.get('byteOffset',0)
 while len(packed)%4:packed.append(0)
 view['byteOffset']=len(packed);packed.extend(binary[start:start+view['byteLength']]);newviews.append(view)
for a in doc['accessors']:a['bufferView']=viewmap[a['bufferView']]
for im in doc['images']:im['bufferView']=viewmap[im['bufferView']]
doc['bufferViews']=newviews;doc['buffers']=[{'byteLength':len(packed)}]
# Unreachable duplicate nodes must not retain references to removed meshes.
for node in doc['nodes']:
 if node.get('mesh',0)>=5:node.pop('mesh',None);node.pop('skin',None)
text=json.dumps(doc,separators=(',',':')).encode();text+=b' '*((-len(text))%4)
packed+=b'\0'*((-len(packed))%4)
result=struct.pack('<III',0x46546c67,2,28+len(text)+len(packed))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(packed),0x004e4942)+packed
out=Path('public/assets/operators/red-team.glb');out.write_bytes(result)
print(f'{len(source):,} -> {len(result):,} bytes; one five-part character')
