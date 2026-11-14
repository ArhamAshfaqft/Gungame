import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';

// Local development only. The destination is fixed; request data cannot select
// paths or execute code. Previous project libraries are backed up before writes.
export function studioPoseServer(){
    return {name:'studio-project-poses',configureServer(server){
        server.middlewares.use('/__studio/project-poses',(req,res,next)=>{
            if(req.url!=='/'&&req.url!=='')return next();
            const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
            if(req.method!=='POST')return json(405,{error:'Use POST to save project poses.'});
            if(![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin))return json(403,{error:'Project saves must come from this Studio.'});
            if(!req.headers['content-type']?.startsWith('application/json'))return json(415,{error:'Expected a JSON pose library.'});
            let bytes=0,large=false;const chunks=[];
            req.on('data',chunk=>{bytes+=chunk.length;if(bytes>8*1024*1024){large=true;chunks.length=0;}else if(!large)chunks.push(chunk);});
            req.on('end',async()=>{
                if(large)return json(413,{error:'Pose library exceeds 8 MB.'});
                try{
                    const {validateLibrary}=await import('../src/studio/PoseLibrary.js');
                    const library=validateLibrary(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                    library.projectRevision=randomUUID();
                    const text=JSON.stringify(library,null,2)+'\n';
                    const destination=resolve(server.config.root,'public/assets/poses/studio-library.json');
                    await mkdir(dirname(destination),{recursive:true});
                    let previous=null;try{previous=await readFile(destination,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
                    if(previous!==null&&previous!==text){
                        const backups=resolve(server.config.root,'.pose-backups');await mkdir(backups,{recursive:true});
                        await writeFile(resolve(backups,`studio-library-${Date.now()}.json`),previous);
                    }
                    const temporary=destination+'.tmp';await writeFile(temporary,text);await rename(temporary,destination);
                    json(200,{saved:true,revision:library.projectRevision,path:'public/assets/poses/studio-library.json'});
                }catch(error){json(400,{error:error.message});}
            });
        });
    }};
}
