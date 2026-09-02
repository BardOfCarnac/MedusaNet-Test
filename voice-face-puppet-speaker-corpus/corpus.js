const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const STORAGE_KEY='voice-face-speaker-corpus-v1';

const PROMPTS=[
  {id:'room',category:'environment',label:'ROOM TONE',phoneme:'sil',viseme:'sil',display:'Stay completely quiet',hint:'2.5 seconds of ordinary room noise. Don’t hold your breath deliberately.',utterance:'',duration:2500,repetitions:1},

  {id:'fleece',category:'mono',label:'FLEECE',phoneme:'iː',viseme:'I',display:'see · see · see',hint:'Your normal vowel in “see”.',duration:3000},
  {id:'kit',category:'mono',label:'KIT',phoneme:'ɪ',viseme:'I',display:'sit · sit · sit',hint:'Your normal vowel in “sit/ink”.',duration:3000},
  {id:'dress',category:'mono',label:'DRESS',phoneme:'ɛ',viseme:'E',display:'bed · bed · bed',hint:'Your normal vowel in “bed”.',duration:3000},
  {id:'trap',category:'mono',label:'TRAP',phoneme:'æ',viseme:'E',display:'cat · cat · cat',hint:'Your normal vowel in “cat”.',duration:3000},
  {id:'strut',category:'mono',label:'STRUT',phoneme:'ʌ',viseme:'aa',display:'cup · cup · cup',hint:'Your normal vowel in “cup”.',duration:3000},
  {id:'father',category:'mono',label:'FATHER',phoneme:'ɑː',viseme:'aa',display:'father · father · father',hint:'Use your own natural pronunciation.',duration:3300},
  {id:'lot',category:'mono',label:'LOT',phoneme:'ɒ',viseme:'O',display:'lot · lot · lot',hint:'Use your natural LOT vowel.',duration:3000},
  {id:'thought',category:'mono',label:'THOUGHT',phoneme:'ɔː',viseme:'O',display:'thought · thought · thought',hint:'Use your natural THOUGHT vowel.',duration:3300},
  {id:'foot',category:'mono',label:'FOOT',phoneme:'ʊ',viseme:'U',display:'foot · foot · foot',hint:'Your normal vowel in “foot”.',duration:3000},
  {id:'goose',category:'mono',label:'GOOSE',phoneme:'uː',viseme:'U',display:'food · food · food',hint:'Your normal vowel in “food”.',duration:3000},
  {id:'comma',category:'mono',label:'COMMA / SCHWA',phoneme:'ə',viseme:'aa',display:'comma · comma · comma',hint:'The relaxed final vowel is the target.',duration:3300},

  {id:'face',category:'diph',label:'FACE',phoneme:'eɪ',viseme:'E>I',display:'hey · hey · hey',hint:'Let the vowel move naturally; don’t freeze it.',duration:3000},
  {id:'price',category:'diph',label:'PRICE',phoneme:'aɪ',viseme:'aa>I',display:'high · high · high',hint:'Your normal vowel in “high”.',duration:3000},
  {id:'choice',category:'diph',label:'CHOICE',phoneme:'ɔɪ',viseme:'O>I',display:'boy · boy · boy',hint:'Your normal vowel in “boy”.',duration:3000},
  {id:'goat',category:'diph',label:'GOAT',phoneme:'əʊ',viseme:'aa>U',display:'go · go · go',hint:'Use your own GOAT vowel.',duration:3000},
  {id:'mouth',category:'diph',label:'MOUTH',phoneme:'aʊ',viseme:'aa>U',display:'now · now · now',hint:'Your normal vowel in “now”.',duration:3000},

  {id:'p',category:'cons',label:'P',phoneme:'p',viseme:'PP',display:'pa · pa · pa · pa · pa',hint:'Crisp but natural /p/.',duration:3200,repetitions:5},
  {id:'b',category:'cons',label:'B',phoneme:'b',viseme:'PP',display:'ba · ba · ba · ba · ba',hint:'Natural voiced /b/.',duration:3200,repetitions:5},
  {id:'m',category:'cons',label:'M',phoneme:'m',viseme:'PP',display:'ma · ma · ma · ma · ma',hint:'Normal closed-lip /m/.',duration:3200,repetitions:5},
  {id:'f',category:'cons',label:'F',phoneme:'f',viseme:'FF',display:'fa · fa · fa · fa · fa',hint:'Natural /f/ contact.',duration:3200,repetitions:5},
  {id:'v',category:'cons',label:'V',phoneme:'v',viseme:'FF',display:'va · va · va · va · va',hint:'Natural voiced /v/.',duration:3200,repetitions:5},
  {id:'th',category:'cons',label:'TH',phoneme:'θ',viseme:'TH',display:'thin · thin · thin',hint:'Unvoiced TH as in “thin”.',duration:3200},
  {id:'s',category:'cons',label:'S',phoneme:'s',viseme:'SS',display:'sa · sa · sa · sa · sa',hint:'Natural /s/.',duration:3200,repetitions:5},
  {id:'z',category:'cons',label:'Z',phoneme:'z',viseme:'SS',display:'za · za · za · za · za',hint:'Natural voiced /z/.',duration:3200,repetitions:5},
  {id:'t',category:'cons',label:'T',phoneme:'t',viseme:'DD',display:'ta · ta · ta · ta · ta',hint:'Use your normal T; don’t force a textbook release.',duration:3200,repetitions:5},
  {id:'d',category:'cons',label:'D',phoneme:'d',viseme:'DD',display:'da · da · da · da · da',hint:'Natural /d/.',duration:3200,repetitions:5},
  {id:'k',category:'cons',label:'K',phoneme:'k',viseme:'kk',display:'ka · ka · ka · ka · ka',hint:'Natural /k/.',duration:3200,repetitions:5},
  {id:'g',category:'cons',label:'G',phoneme:'g',viseme:'kk',display:'ga · ga · ga · ga · ga',hint:'Natural hard /g/.',duration:3200,repetitions:5},
  {id:'n',category:'cons',label:'N',phoneme:'n',viseme:'nn',display:'na · na · na · na · na',hint:'Natural /n/.',duration:3200,repetitions:5},
  {id:'r',category:'cons',label:'R',phoneme:'r',viseme:'RR',display:'ra · ra · ra · ra · ra',hint:'Use your own natural R exactly as you normally speak.',duration:3200,repetitions:5},
  {id:'sh',category:'cons',label:'SH',phoneme:'ʃ',viseme:'CH',display:'sha · sha · sha · sha',hint:'Natural SH as in “she”.',duration:3200,repetitions:4},
  {id:'ch',category:'cons',label:'CH',phoneme:'tʃ',viseme:'CH',display:'cha · cha · cha · cha',hint:'Natural CH as in “church”.',duration:3200,repetitions:4},
  {id:'j',category:'cons',label:'J',phoneme:'dʒ',viseme:'CH',display:'ja · ja · ja · ja',hint:'Natural J as in “judge”.',duration:3200,repetitions:4},
];

let corpus=loadCorpus();
let stream=null;
let running=false;
let activeRecorder=null;
let activePrompt=null;
let runAbort=false;
let audioCtx=null;

function loadCorpus(){
  try{
    const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(x?.clips)return x;
  }catch{}
  return {version:1,createdAt:new Date().toISOString(),clips:{},device:null};
}
function saveCorpus(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(corpus))}catch(e){console.warn('Could not persist corpus locally',e)}
  render();
}
function chooseMime(){
  for(const t of ['audio/webm;codecs=opus','audio/webm','audio/mp4'])if(window.MediaRecorder?.isTypeSupported?.(t))return t;
  return '';
}
function blobToDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)})}
async function ensureMic(){
  if(stream?.active)return stream;
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  const track=stream.getAudioTracks()[0];
  const settings=track?.getSettings?.()||{};
  const devices=await navigator.mediaDevices.enumerateDevices().catch(()=>[]);
  const info=devices.find(d=>d.kind==='audioinput'&&(!settings.deviceId||d.deviceId===settings.deviceId));
  corpus.device={label:info?.label||track?.label||'default',sampleRate:settings.sampleRate||null,channelCount:settings.channelCount||null,echoCancellation:settings.echoCancellation??null,noiseSuppression:settings.noiseSuppression??null,autoGainControl:settings.autoGainControl??null};
  saveCorpus();
  return stream;
}
async function requestPermission(){
  try{await ensureMic();setNow('MIC READY','Microphone permission granted.','You can start recording the corpus.')}catch(e){setNow('MIC ERROR',e.message||'Could not access microphone.','Check the site microphone permission.')}
  diagnostics();
}
async function decodeMetrics(blob){
  try{
    audioCtx=audioCtx||new AudioContext();
    const ab=await blob.arrayBuffer();
    const buf=await audioCtx.decodeAudioData(ab.slice(0));
    let sum=0,peak=0,n=0;
    for(let c=0;c<buf.numberOfChannels;c++){
      const x=buf.getChannelData(c);
      for(let i=0;i<x.length;i++){const v=x[i];sum+=v*v;peak=Math.max(peak,Math.abs(v));n++}
    }
    const rms=Math.sqrt(sum/Math.max(1,n));
    return {duration:buf.duration,rmsDb:20*Math.log10(rms+1e-12),peakDb:20*Math.log10(peak+1e-12),sampleRate:buf.sampleRate,channels:buf.numberOfChannels};
  }catch{return {duration:null,rmsDb:null,peakDb:null,sampleRate:null,channels:null}}
}
function qualityFor(prompt,metrics){
  if(!metrics||metrics.rmsDb==null)return {kind:'warn',text:'level unknown'};
  if(prompt.id==='room')return {kind:'good',text:`room ${metrics.rmsDb.toFixed(1)} dBFS`};
  if(metrics.peakDb>-0.6)return {kind:'warn',text:`CLIPPING risk · peak ${metrics.peakDb.toFixed(1)} dBFS`};
  if(metrics.rmsDb<-38)return {kind:'warn',text:`quiet · RMS ${metrics.rmsDb.toFixed(1)} dBFS`};
  return {kind:'good',text:`RMS ${metrics.rmsDb.toFixed(1)} · peak ${metrics.peakDb.toFixed(1)} dBFS`};
}
function setNow(label,prompt,hint,progress=0,active=false){$('nowLabel').textContent=label;$('nowPrompt').textContent=prompt;$('nowHint').textContent=hint;$('progressFill').style.width=`${clamp(progress,0,1)*100}%`;$('nowCard').classList.toggle('active',active)}
async function recordPrompt(prompt){
  if(running&&activePrompt)return false;
  await ensureMic();
  running=true;activePrompt=prompt;
  render();
  setNow(`GET READY · ${prompt.label}`,prompt.display,prompt.hint,0,true);
  await sleep(650);
  if(runAbort){running=false;activePrompt=null;render();return false}
  const chunks=[];
  const mime=chooseMime();
  const rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);activeRecorder=rec;
  rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
  const stopped=new Promise(resolve=>rec.addEventListener('stop',resolve,{once:true}));
  rec.start(200);
  const start=performance.now();
  setNow(`RECORDING · ${prompt.label}`,prompt.display,prompt.hint,0,true);
  while(performance.now()-start<prompt.duration){
    if(runAbort)break;
    const elapsed=performance.now()-start;
    $('progressFill').style.width=`${clamp(elapsed/prompt.duration,0,1)*100}%`;
    await sleep(70);
  }
  if(rec.state!=='inactive')rec.stop();
  await stopped;
  activeRecorder=null;
  const blob=new Blob(chunks,{type:rec.mimeType||chunks[0]?.type||'audio/webm'});
  const metrics=await decodeMetrics(blob);
  const dataUrl=await blobToDataURL(blob);
  corpus.clips[prompt.id]={
    id:prompt.id,category:prompt.category,label:prompt.label,phoneme:prompt.phoneme,viseme:prompt.viseme,
    display:prompt.display,hint:prompt.hint,repetitions:prompt.repetitions||3,
    recordedAt:new Date().toISOString(),mimeType:blob.type,size:blob.size,metrics,audioDataUrl:dataUrl
  };
  saveCorpus();
  const q=qualityFor(prompt,metrics);
  setNow(`CAPTURED · ${prompt.label}`,prompt.display,q.text,1,false);
  running=false;activePrompt=null;render();
  return true;
}
async function runSequence(list){
  if(running)return;
  runAbort=false;
  for(const p of list){
    if(runAbort)break;
    const ok=await recordPrompt(p);
    if(!ok&&runAbort)break;
    await sleep(300);
  }
  if(!runAbort)setNow('SET COMPLETE','Nice. That phase is recorded.','You can re-record any individual card before downloading the bundle.',1,false);
  runAbort=false;
}
function totalDuration(){return Object.values(corpus.clips).reduce((a,c)=>a+(c.metrics?.duration||0),0)}
function fmtTime(sec){const m=Math.floor(sec/60),s=Math.round(sec%60);return `${m}:${String(s).padStart(2,'0')}`}
function gridFor(cat){return cat==='environment'?'environmentGrid':cat==='mono'?'monoGrid':cat==='diph'?'diphGrid':'consGrid'}
function createCard(p){
  const clip=corpus.clips[p.id];
  const q=clip?qualityFor(p,clip.metrics):null;
  const card=document.createElement('div');card.className='promptCard'+(clip?` done ${q.kind==='warn'?'bad':''}`:'')+(activePrompt?.id===p.id?' recording':'');card.dataset.id=p.id;
  const text=document.createElement('div');text.innerHTML=`<b>${p.label} · ${p.phoneme}</b><small>${p.display}<br>${p.hint} → viseme ${p.viseme}</small>${clip?`<div class="quality ${q.kind}">${q.text}</div>`:''}`;
  const btn=document.createElement('button');btn.textContent=clip?'Redo':'Record';btn.disabled=running;btn.onclick=()=>recordPrompt(p);
  card.append(text,btn);return card;
}
function render(){
  for(const id of ['environmentGrid','monoGrid','diphGrid','consGrid'])$(id).innerHTML='';
  for(const p of PROMPTS)$(gridFor(p.category)).append(createCard(p));
  const n=Object.keys(corpus.clips).length;$('doneCount').textContent=`${n} / ${PROMPTS.length}`;$('minutes').textContent=fmtTime(totalDuration());
  $('roomLevel').textContent=corpus.clips.room?.metrics?.rmsDb!=null?`${corpus.clips.room.metrics.rmsDb.toFixed(1)} dBFS`:'—';
  $('deviceLabel').textContent=(corpus.device?.label||'default').replace(/^Default - /,'').slice(0,22);
  $('downloadBtn').disabled=n<2||running;
  for(const id of ['runVowelsBtn','runConsonantsBtn','runAllBtn','clearBtn'])$(id).disabled=running;
}
async function micCheck(){
  try{
    await ensureMic();
    setNow('MIC CHECK','Say one normal sentence now.','This does not save audio; it only verifies the browser can hear you.',0,true);
    const ctx=new AudioContext();const src=ctx.createMediaStreamSource(stream);const an=ctx.createAnalyser();an.fftSize=2048;src.connect(an);const arr=new Float32Array(an.fftSize);let peak=0,sum=0,n=0;
    const start=performance.now();
    while(performance.now()-start<2500){an.getFloatTimeDomainData(arr);let s=0,p=0;for(const v of arr){s+=v*v;p=Math.max(p,Math.abs(v))}const r=Math.sqrt(s/arr.length);sum+=r;n++;peak=Math.max(peak,p);$('progressFill').style.width=`${((performance.now()-start)/2500)*100}%`;await sleep(80)}
    src.disconnect();await ctx.close();const rms=sum/Math.max(1,n);setNow('MIC CHECK OK','Microphone is live.',`Average level ${(20*Math.log10(rms+1e-12)).toFixed(1)} dBFS · peak ${(20*Math.log10(peak+1e-12)).toFixed(1)} dBFS`,1,false);
  }catch(e){setNow('MIC CHECK FAILED',e.message||'Could not hear microphone.','Check site permission.')}
}
function exportBundle(){
  const ordered=PROMPTS.filter(p=>corpus.clips[p.id]).map(p=>corpus.clips[p.id]);
  const bundle={format:'voice-face-single-speaker-corpus-v1',createdAt:new Date().toISOString(),purpose:'speaker-specific lip-sync acoustic training',instructions:'Each clip is independently labelled. Do not use held-out diagnostic sentence recordings as training data.',device:corpus.device,promptCount:PROMPTS.length,recordedCount:ordered.length,totalAudioSeconds:+totalDuration().toFixed(3),clips:ordered};
  const blob=new Blob([JSON.stringify(bundle)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`single-speaker-lipsync-corpus-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setNow('BUNDLE READY','Training corpus downloaded.','Upload that JSON here and I can build the first model directly from these labelled recordings.',1,false);
}
function clearCorpus(){
  if(running){runAbort=true;try{activeRecorder?.stop()}catch{}return}
  if(!confirm('Clear all locally recorded corpus clips?'))return;
  corpus={version:1,createdAt:new Date().toISOString(),clips:{},device:corpus.device};localStorage.removeItem(STORAGE_KEY);saveCorpus();setNow('CLEARED','Corpus cleared.','Start again with Room Tone.',0,false)
}
async function diagnostics(){
  let perm='unavailable';try{if(navigator.permissions?.query)perm=(await navigator.permissions.query({name:'microphone'})).state}catch{}
  $('diag').textContent=[`secure context: ${isSecureContext?'yes':'NO'}`,`microphone permission: ${perm}`,`MediaRecorder: ${window.MediaRecorder?'available':'UNAVAILABLE'}`,`preferred mime: ${chooseMime()||'browser default'}`,`saved clips: ${Object.keys(corpus.clips).length}/${PROMPTS.length}`,`local persistence: ${'localStorage' in window?'available':'unavailable'}`].join('\n');
}

$('permissionBtn').onclick=requestPermission;$('micCheckBtn').onclick=micCheck;
$('runVowelsBtn').onclick=()=>runSequence(PROMPTS.filter(p=>p.category==='environment'||p.category==='mono'||p.category==='diph'));
$('runConsonantsBtn').onclick=()=>runSequence(PROMPTS.filter(p=>p.category==='cons'));
$('runAllBtn').onclick=()=>runSequence(PROMPTS);
$('downloadBtn').onclick=exportBundle;$('clearBtn').onclick=clearCorpus;
render();diagnostics();navigator.mediaDevices?.addEventListener?.('devicechange',diagnostics);
