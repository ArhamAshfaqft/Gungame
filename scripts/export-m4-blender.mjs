import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {MeshoptDecoder} from 'meshoptimizer';
const source=readFileSync('public/assets/weapons/m4a1.glb');
const n=source.readUInt32LE(12),json=JSON.parse(source.subarray(20,20+n));
const binStart=28+n,bin=source.subarray(binStart,binStart+source.readUInt32LE(20+n));
await MeshoptDecoder.ready;
const chunks=[];let offset=0,count=0;
for(const view of json.bufferViews){
 const ext=view.extensions?.EXT_meshopt_compression;let data;
 if(ext){
  if(ext.buffer!==0)throw Error('Unexpected source buffer');
  data=Buffer.alloc(ext.count*ext.byteStride);
  MeshoptDecoder.decodeGltfBuffer(data,ext.count,ext.byteStride,bin.subarray(ext.byteOffset||0,(ext.byteOffset||0)+ext.byteLength),ext.mode,ext.filter);
  delete view.extensions.EXT_meshopt_compression;if(!Object.keys(view.extensions).length)delete view.extensions;count++;
 }else {if(view.buffer!==0)throw Error('Unexpected uncompressed buffer');data=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);}
 const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
 view.buffer=0;view.byteOffset=offset;view.byteLength=data.length;chunks.push(data);offset+=data.length;
}
json.buffers=[{byteLength:offset}];
for(const key of ['extensionsUsed','extensionsRequired'])if(json[key])json[key]=json[key].filter(name=>name!=='EXT_meshopt_compression');
const raw=Buffer.from(JSON.stringify(json)),text=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(text);
const binary=Buffer.concat(chunks),padded=Buffer.alloc(Math.ceil(binary.length/4)*4);binary.copy(padded);
const out=Buffer.alloc(28+text.length+padded.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(text.length,12);out.writeUInt32LE(0x4e4f534a,16);text.copy(out,20);out.writeUInt32LE(padded.length,20+text.length);out.writeUInt32LE(0x004e4942,24+text.length);padded.copy(out,28+text.length);
mkdirSync('blender-assets',{recursive:true});writeFileSync('blender-assets/M4A1-Blender.glb',out);
console.log('Decoded',count,'buffer views. Wrote',out.length,'bytes to blender-assets/M4A1-Blender.glb');
