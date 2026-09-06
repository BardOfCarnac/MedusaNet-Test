// Optional audio layer for the gold FaceKit test.
// It never participates in head/model loading: if this file or the audio fails,
// speech-test-v1.js continues to work exactly as the silent diagnostic did.
const C=.095,V=.18,D=.07;
const VOICE_START=.84,VOICE_END=7.40;
const WORD_DURS=[
  [C,V,C,.13,C],[C,V,C,C],[C,.12,.12,C],[C,C,.12,.12,C],[C,C,V],
  [C,.15,C,.13,C,C],[.14,C],[.13],[C,.15,C],[C,.16,C,C],[C,.15,C],
  [.11,.13,.13],[.11,.13,.13,C],[C,C,V],[.11,V,C],[C,.12,.12],[C,.13],
  [.13,.13,C,C],[C,.13,.13,C]
];
const middle=[];for(const word of WORD_DURS)middle.push(...word,D);
const total=middle.reduce((a,b)=>a+b,0),eventStarts=[0];
let cursor=VOICE_START;for(const d of middle){eventStarts.push(cursor);cursor+=d/total*(VOICE_END-VOICE_START);}eventStarts.push(VOICE_END);

const play=document.querySelector('#play'),pause=document.querySelector('#pause'),prev=document.querySelector('#prev'),next=document.querySelector('#next'),speed=document.querySelector('#speed'),state=document.querySelector('#audioState');
const audio=new Audio();audio.preload='metadata';audio.preservesPitch=true;
let audioReady=false,internal=false,synced=0,raf=0,sourceAttached=false;
const setState=t=>{if(state)state.textContent=t;};

function attachSource(){if(sourceAttached)return;sourceAttached=true;audio.src='./voice-sample.webm?v=2';audio.load();}
function targetIndex(t){let lo=0,hi=eventStarts.length-1,best=0;while(lo<=hi){const m=(lo+hi)>>1;if(eventStarts[m]<=t){best=m;lo=m+1;}else hi=m-1;}return best;}
function clickInternal(b){internal=true;b?.click();internal=false;}
function resetFace(){for(let i=0;i<100;i++)clickInternal(prev);synced=0;}
function advanceTo(i){i=Math.max(0,Math.min(eventStarts.length-1,i));while(synced<i){clickInternal(next);synced++;}while(synced>i){clickInternal(prev);synced--;}play?.classList.add('active');}
function syncNow(){resetFace();advanceTo(targetIndex(audio.currentTime||0));}
function tick(){if(audio.paused||audio.ended){raf=0;return;}const wanted=targetIndex(audio.currentTime);if(wanted!==synced)advanceTo(wanted);raf=requestAnimationFrame(tick);}
async function startAudio(){if(!audioReady)return;audio.playbackRate=Number(speed?.value||.55);syncNow();try{await audio.play();setState('VOICE SAMPLE · PLAYING');if(!raf)raf=requestAnimationFrame(tick);}catch(e){setState('VOICE SAMPLE · PLAYBACK BLOCKED');}}
function pauseAudio(){audio.pause();play?.classList.remove('active');if(raf){cancelAnimationFrame(raf);raf=0;}setState(audioReady?'VOICE SAMPLE · PAUSED':'VOICE SAMPLE · LOADING…');}

// Wait until the FaceKit loader reports READY before touching the audio network.
const headStatus=document.querySelector('#status');
const maybeAttach=()=>{if(headStatus?.textContent.startsWith('READY'))attachSource();};
new MutationObserver(maybeAttach).observe(headStatus,{childList:true,subtree:true,characterData:true});
maybeAttach();

play?.addEventListener('click',e=>{if(!audioReady)return;e.preventDefault();e.stopImmediatePropagation();if(audio.ended||audio.currentTime>=audio.duration-.04)audio.currentTime=0;startAudio();},true);
pause?.addEventListener('click',()=>pauseAudio(),true);
for(const b of [prev,next])b?.addEventListener('click',()=>{if(!internal)pauseAudio();},true);
document.querySelectorAll('[data-viseme]').forEach(b=>b.addEventListener('click',()=>pauseAudio(),true));
speed?.addEventListener('input',()=>{if(audioReady)audio.playbackRate=Number(speed.value||.55);});
audio.addEventListener('loadedmetadata',()=>{audioReady=true;audio.playbackRate=Number(speed?.value||.55);setState(`VOICE SAMPLE · YOUR RECORDING · ${audio.duration.toFixed(2)}s · READY`);});
audio.addEventListener('ended',()=>{advanceTo(eventStarts.length-1);play?.classList.remove('active');if(raf){cancelAnimationFrame(raf);raf=0;}setState('VOICE SAMPLE · READY');});
audio.addEventListener('error',()=>setState('VOICE SAMPLE · FAILED (FACE STILL AVAILABLE)'));
