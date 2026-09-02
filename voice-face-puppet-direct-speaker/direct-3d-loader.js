const MODEL_STORAGE='voice-face-direct-speaker-model-v1';

function installFromWindowName(){
  if(!window.name)return false;
  try{
    const payload=JSON.parse(window.name);
    const model=payload?.type==='voice-face-direct-speaker-install'?payload.model:null;
    if(!model||model.format!=='single-speaker-direct-vowel-v1')return false;
    if(model?.audio?.targetSampleRate!==16000||model?.audio?.fftSize!==512||model?.audio?.nMels!==24)return false;
    if(!Array.isArray(model?.classifier?.classes)||model.classifier.classes.length!==5)return false;
    localStorage.setItem(MODEL_STORAGE,JSON.stringify(model));
    window.name='';
    sessionStorage.setItem('voice-face-direct-speaker-installed','1');
    if(location.search.includes('install='))history.replaceState(null,'',location.pathname);
    return true;
  }catch(e){
    console.warn('Private direct-speaker install failed',e);
    return false;
  }
}

installFromWindowName();
await import('./direct-3d.js?v=5');
