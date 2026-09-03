(()=>{
  const audio=document.getElementById('audio');
  if(!audio)return;
  let fixing=false;
  const finite=()=>Number.isFinite(audio.duration)&&audio.duration>0;
  const recover=()=>{
    if(!finite())return;
    cleanup();
    fixing=false;
    try{audio.currentTime=0}catch{}
    // Re-run the editor's metadata handler now that Chrome has discovered
    // the real WebM duration.
    audio.dispatchEvent(new Event('loadedmetadata'));
  };
  const cleanup=()=>{
    audio.removeEventListener('durationchange',recover);
    audio.removeEventListener('timeupdate',recover);
    audio.removeEventListener('progress',recover);
  };
  audio.addEventListener('loadedmetadata',e=>{
    if(finite())return;
    // Android Chrome can expose MediaRecorder WebM duration as Infinity.
    // Do not let the editor build a timeline against that bogus value.
    e.stopImmediatePropagation();
    if(fixing)return;
    fixing=true;
    audio.addEventListener('durationchange',recover);
    audio.addEventListener('timeupdate',recover);
    audio.addEventListener('progress',recover);
    try{audio.currentTime=1e101}catch(err){
      cleanup();
      fixing=false;
      console.warn('Could not recover WebM duration',err);
    }
  },true);
})();
