// Optional audio master clock for the gold FaceKit test. It does not import Three.js,
// touch the model loader, or own any mouth shapes. If audio fails, the silent test
// remains fully usable.
const play=document.querySelector('#play'),pause=document.querySelector('#pause'),prev=document.querySelector('#prev'),next=document.querySelector('#next'),speed=document.querySelector('#speed'),state=document.querySelector('#audioState');
const audio=new Audio();audio.preload='metadata';audio.preservesPitch=true;
let audioReady=false,raf=0,sourceAttached=false;
const setState=t=>{if(state)state.textContent=t;};
const api=()=>window.goldSpeech;

function attachSource(){if(sourceAttached)return;sourceAttached=true;setState('VOICE SAMPLE · LOADING…');audio.src='./voice-sample.webm?v=2';audio.load();}
function tick(){if(audio.paused||audio.ended){raf=0;return;}api()?.setExternalTime(audio.currentTime);raf=requestAnimationFrame(tick);}
async function startAudio(){if(!audioReady||!api()?.ready)return;if(audio.ended||audio.currentTime>=audio.duration-.04)audio.currentTime=0;audio.playbackRate=Number(speed?.value||.55);api().setExternalTime(audio.currentTime);try{await audio.play();play?.classList.add('active');setState('VOICE SAMPLE · PLAYING · REAL TIMELINE');if(!raf)raf=requestAnimationFrame(tick);}catch(e){setState('VOICE SAMPLE · PLAYBACK BLOCKED');api()?.releaseExternal();}}
function pauseAudio(){audio.pause();if(raf){cancelAnimationFrame(raf);raf=0;}play?.classList.remove('active');if(api()?.ready)api().setExternalTime(audio.currentTime||0);setState(audioReady?'VOICE SAMPLE · PAUSED':'VOICE SAMPLE · LOADING…');}

// Do not request the recording until the head and all speech morphs are ready.
function maybeAttach(){if(api()?.ready)attachSource();}
window.addEventListener('goldspeechready',maybeAttach,{once:true});maybeAttach();

// Capture PLAY only after the recording is available. Until then the underlying
// deterministic page can still run silently, which keeps audio failure non-fatal.
play?.addEventListener('click',e=>{if(!audioReady||!api()?.ready)return;e.preventDefault();e.stopImmediatePropagation();startAudio();},true);
pause?.addEventListener('click',()=>{if(audioReady)pauseAudio();},true);
for(const b of [prev,next])b?.addEventListener('click',()=>{if(audioReady&&!audio.paused)pauseAudio();},true);
document.addEventListener('click',e=>{if(e.target?.matches?.('[data-viseme]')&&audioReady&&!audio.paused)pauseAudio();},true);
speed?.addEventListener('input',()=>{if(audioReady)audio.playbackRate=Number(speed.value||.55);});

audio.addEventListener('loadedmetadata',()=>{audioReady=true;audio.playbackRate=Number(speed?.value||.55);setState(`VOICE SAMPLE · YOUR RECORDING · ${audio.duration.toFixed(2)}s · REAL TIMELINE READY`);});
audio.addEventListener('ended',()=>{if(raf){cancelAnimationFrame(raf);raf=0;}api()?.setExternalTime(audio.duration||api()?.clipEnd||8.34);play?.classList.remove('active');setState('VOICE SAMPLE · READY');});
audio.addEventListener('error',()=>{setState('VOICE SAMPLE · FAILED (FACE STILL AVAILABLE)');api()?.releaseExternal();});
