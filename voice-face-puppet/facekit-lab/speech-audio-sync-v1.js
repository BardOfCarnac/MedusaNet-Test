// Sync the user's held-out standard-sentence recording to the deterministic FaceKit test.
// Audio is the master clock. The face still uses speech-test-v1.js for all mouth logic;
// this module only advances that existing event stream at times derived from the recording.

const CHUNKS=['voice-sample-01.txt','voice-sample-02.txt','voice-sample-03.txt','voice-sample-04.txt'];
const ACTIVE_START=0.90;
const ACTIVE_END=7.40;
const C=.095,V=.18,D=.07;
const WORD_DURS=[
  [C,V,C,.13,C],
  [C,V,C,C],
  [C,.12,.12,C],
  [C,C,.12,.12,C],
  [C,C,V],
  [C,.15,C,.13,C,C],
  [.14,C],
  [.13],
  [C,.15,C],
  [C,.16,C,C],
  [C,.15,C],
  [.11,.13,.13],
  [.11,.13,.13,C],
  [C,C,V],
  [.11,V,C],
  [C,.12,.12],
  [C,.13],
  [.13,.13,C,C],
  [C,.13,.13,C]
];

const middleDurations=[];
for(const word of WORD_DURS){middleDurations.push(...word,D);}
const totalWeight=middleDurations.reduce((a,b)=>a+b,0);
const eventStarts=[0]; // initial REST event from speech-test-v1.js
let cursor=ACTIVE_START;
for(const d of middleDurations){
  eventStarts.push(cursor);
  cursor+=(d/totalWeight)*(ACTIVE_END-ACTIVE_START);
}
eventStarts.push(ACTIVE_END); // final REST event

const audio=new Audio();
audio.preload='auto';
audio.preservesPitch=true;
let audioReady=false;
let internalStep=false;
let raf=0;
let syncedIndex=0;

const play=document.querySelector('#play');
const pause=document.querySelector('#pause');
const prev=document.querySelector('#prev');
const next=document.querySelector('#next');
const speed=document.querySelector('#speed');
const voiceStatus=document.querySelector('#voiceStatus');

function setVoiceStatus(text,error=false){
  if(!voiceStatus)return;
  voiceStatus.textContent=text;
  voiceStatus.style.color=error?'#ffb36b':'#ff6775';
}

function targetIndexAt(t){
  let lo=0,hi=eventStarts.length-1,best=0;
  while(lo<=hi){
    const m=(lo+hi)>>1;
    if(eventStarts[m]<=t){best=m;lo=m+1;}else hi=m-1;
  }
  return best;
}

function clickInternal(button){
  internalStep=true;
  button?.click();
  internalStep=false;
}

function resetFace(){
  // Event count is small; clamped STEP buttons make this a safe deterministic reset
  // without exposing internals from the FaceKit module.
  for(let i=0;i<100;i++)clickInternal(prev);
  syncedIndex=0;
}

function advanceFaceTo(index){
  index=Math.max(0,Math.min(eventStarts.length-1,index));
  while(syncedIndex<index){clickInternal(next);syncedIndex++;}
  while(syncedIndex>index){clickInternal(prev);syncedIndex--;}
  play?.classList.add('active');
}

function resyncFace(){
  resetFace();
  advanceFaceTo(targetIndexAt(audio.currentTime||0));
}

function tick(){
  if(audio.paused||audio.ended){raf=0;return;}
  const wanted=targetIndexAt(audio.currentTime);
  if(wanted!==syncedIndex)advanceFaceTo(wanted);
  raf=requestAnimationFrame(tick);
}

async function startAudio(){
  if(!audioReady)return;
  audio.playbackRate=Number(speed?.value||.55);
  resyncFace();
  try{
    await audio.play();
    play?.classList.add('active');
    if(!raf)raf=requestAnimationFrame(tick);
  }catch(err){
    setVoiceStatus('VOICE SAMPLE · PLAYBACK BLOCKED · '+(err?.message||'tap again'),true);
  }
}

function pauseAudio(){
  audio.pause();
  play?.classList.remove('active');
  if(raf){cancelAnimationFrame(raf);raf=0;}
}

// Capture PLAY before the original diagnostic's timer-based playback listener.
// Once the sample is loaded, audio.currentTime becomes the only playback clock.
play?.addEventListener('click',e=>{
  if(!audioReady)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if(audio.ended||audio.currentTime>=audio.duration-.04)audio.currentTime=0;
  startAudio();
},true);

pause?.addEventListener('click',()=>pauseAudio(),true);
for(const button of [prev,next])button?.addEventListener('click',()=>{
  if(!internalStep)pauseAudio();
},true);
document.querySelectorAll('[data-viseme]').forEach(button=>button.addEventListener('click',()=>pauseAudio(),true));

speed?.addEventListener('input',()=>{
  if(audioReady)audio.playbackRate=Number(speed.value||.55);
});

audio.addEventListener('ended',()=>{
  advanceFaceTo(eventStarts.length-1);
  play?.classList.remove('active');
  if(raf){cancelAnimationFrame(raf);raf=0;}
});
audio.addEventListener('error',()=>setVoiceStatus('VOICE SAMPLE · AUDIO ERROR',true));

async function loadVoice(){
  try{
    setVoiceStatus('VOICE SAMPLE · LOADING…');
    const parts=await Promise.all(CHUNKS.map(async name=>{
      const r=await fetch(name+'?v=1',{cache:'no-store'});
      if(!r.ok)throw new Error(name+' '+r.status);
      return (await r.text()).trim();
    }));
    audio.src='data:audio/webm;codecs=opus;base64,'+parts.join('');
    await new Promise((resolve,reject)=>{
      const ok=()=>{cleanup();resolve();};
      const bad=()=>{cleanup();reject(new Error('audio metadata failed'));};
      const cleanup=()=>{audio.removeEventListener('loadedmetadata',ok);audio.removeEventListener('error',bad);};
      audio.addEventListener('loadedmetadata',ok);
      audio.addEventListener('error',bad);
      audio.load();
    });
    audioReady=true;
    audio.playbackRate=Number(speed?.value||.55);
    setVoiceStatus(`VOICE SAMPLE · YOUR RECORDING · ${audio.duration.toFixed(2)}s · SYNCED`);
  }catch(err){
    console.error(err);
    setVoiceStatus('VOICE SAMPLE · LOAD FAILED',true);
  }
}

loadVoice();
