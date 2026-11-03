import {readFileSync,writeFileSync} from 'node:fs';
const samples=Array.from({length:5},(_,i)=>readFileSync(`public/assets/audio/footsteps/concrete-${i}.wav`).toString('base64'));
writeFileSync('public/assets/audio/footsteps/samples.json',JSON.stringify({version:1,format:'wav-base64',samples}));
