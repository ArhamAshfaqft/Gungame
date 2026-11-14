import {spawn} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const build=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'build'],{cwd:root,stdio:'inherit'});
build.on('exit',code=>{
 if(code!==0){console.error('The game could not build. Your source files and poses are unchanged.');process.exitCode=code||1;return;}
 const server=spawn(process.execPath,[resolve(root,'server/index.mjs')],{cwd:root,stdio:['inherit','pipe','inherit']});let opened=false;
 server.stdout.on('data',chunk=>{process.stdout.write(chunk);const url=chunk.toString().match(/Host: (http:\/\/127\.0\.0\.1:\d+\/\?multiplayer=1&map=training)/)?.[1];if(url&&!opened&&process.platform==='win32'){opened=true;const browser=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{stdio:'ignore',windowsHide:true});browser.on('error',()=>{});}});
 server.on('exit',c=>process.exitCode=c||0);
});
