import {POSE_STORAGE_KEY,validateLibrary,saveLibrary} from './PoseLibrary.js';

export function preserveBrowserPoses(storage=globalThis.localStorage){
    const raw=storage?.getItem(POSE_STORAGE_KEY);
    if(raw&&!storage.getItem('fast-snipe-poses-before-project-sync-v1'))storage.setItem('fast-snipe-poses-before-project-sync-v1',raw);
}
export async function loadProjectLibrary(){
    try{
        const response=await fetch('/assets/poses/studio-library.json',{cache:'no-store'});
        if(!response.ok)return null;
        const raw=await response.json();return raw===null?null:validateLibrary(raw);
    }catch{return null;}
}
export async function saveProjectLibrary(library,{storage=globalThis.localStorage,request=globalThis.fetch}={}){
    // Snapshot the user's current editor, never substitute an older project copy.
    const clean=validateLibrary(library);
    preserveBrowserPoses(storage);
    saveLibrary(clean,storage); // Keep edits recoverable even if the project write fails.
    const response=await request('/__studio/project-poses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(clean)});
    if(!response.ok){let message='Project save failed.';try{message=(await response.json()).error||message;}catch{}throw Error(message+' Your browser copy is preserved; the shared game was not updated.');}
    const result=await response.json();
    if(!result.saved||typeof result.revision!=='string')throw Error('Project save was not confirmed. Your browser copy is preserved.');
    clean.projectRevision=result.revision;
    return saveLibrary(clean,storage);
}
export async function loadProjectForWeapon(weapon){
    const project=await loadProjectLibrary();if(!project)return;
    weapon.projectPoseLibrary=project;
    // Only a confirmed Save to game activates shared authority. Legacy local poses
    // remain authoritative until the user first publishes their correct browser copy.
    if((project.projectRevision||!globalThis.localStorage?.getItem(POSE_STORAGE_KEY))&&!weapon.studioAudition){
        if(JSON.stringify(weapon.poseLibrary)!==JSON.stringify(project)){
            weapon.poseLibrary=project;weapon.poseRevision=(weapon.poseRevision||0)+1;
        }
    }
}
export function watchProjectForWeapon(weapon){
    let busy=false;
    const refresh=async()=>{if(busy||weapon.studioAudition)return;busy=true;try{await loadProjectForWeapon(weapon);}finally{busy=false;}};
    window.addEventListener('focus',refresh);
    window.addEventListener('storage',event=>{if(event.key===POSE_STORAGE_KEY||event.key===null)refresh();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
    const timer=setInterval(()=>{if(!document.hidden)refresh();},3000);
    refresh();return ()=>clearInterval(timer);
}
