import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,relative} from 'node:path';
import {studioPoseServer} from '../scripts/studio-pose-server.mjs';
import {emptyLibrary} from '../src/studio/PoseLibrary.js';

test('local project saving validates data and origin, writes the fixed asset and backs up previous versions',async t=>{
    const root=await mkdtemp(join(tmpdir(),'fast-snipe-studio-test-'));
    const path=resolve(root,'public/assets/poses/studio-library.json');
    await mkdir(resolve(root,'public/assets/poses'),{recursive:true});await writeFile(path,'null\n');
    let handler;studioPoseServer().configureServer({config:{root},middlewares:{use(route,fn){assert.equal(route,'/__studio/project-poses');handler=fn;}}});
    const server=createServer((req,res)=>handler(req,res,()=>{res.writeHead(404);res.end();}));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    t.after(async()=>{
        await new Promise(resolve=>server.close(resolve));
        const inside=relative(resolve(tmpdir()),resolve(root));
        assert.ok(!inside.startsWith('..')&&!inside.includes('..')&&inside.startsWith('fast-snipe-studio-test-'));
        await rm(root,{recursive:true,force:true});
    });
    const origin=`http://127.0.0.1:${server.address().port}`;
    const send=(data,from=origin)=>fetch(origin+'/',{method:'POST',headers:{Origin:from,'Content-Type':'application/json'},body:JSON.stringify(data)});
    assert.equal((await send(emptyLibrary(),'https://unrelated.example')).status,403);
    assert.equal((await send({version:99,poses:{}})).status,400);
    assert.equal(await readFile(path,'utf8'),'null\n');
    const library=emptyLibrary();library.peekPoses['assault:crouch:right:aim'].Left.elbow[1]=-.03;
    assert.equal((await send(library)).status,200);
    const first=await readFile(path,'utf8');assert.equal(JSON.parse(first).peekPoses['assault:crouch:right:aim'].Left.elbow[1],-.03);
    library.peekPoses['assault:crouch:right:aim'].Left.elbow[1]=-.04;
    assert.equal((await send(library)).status,200);
    const backups=await readdir(resolve(root,'.pose-backups'));
    const texts=await Promise.all(backups.map(name=>readFile(resolve(root,'.pose-backups',name),'utf8')));
    assert.ok(texts.includes(first));assert.ok(texts.includes('null\n'));
    assert.equal((await fetch(origin+'/')).status,405);
});
