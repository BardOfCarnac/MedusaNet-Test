const COMMIT='d3af5f9ff86ab6b2b1913d411a4e1922ec101953';
const BASE=`https://cdn.jsdelivr.net/gh/met4citizen/HeadAudio@${COMMIT}`;
const MODULE_URL=`${BASE}/dist/headaudio.min.mjs`;
const WORKLET_URL=`${BASE}/dist/headworklet.min.mjs`;
const MODEL_URL=`${BASE}/dist/model-en-mixed.bin`;

const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const visemeNames=['aa','E','I','O','U','PP','SS','TH','DD','FF','kk','nn','RR','CH','sil'];
const keys=visemeNames.map(v=>`viseme_${v}`);
const weights=Object.fromEntries(keys.map(k=>[k,0]));
const bars={};
let activeIndex=14,lastDistances=null,lastVadDb=-100,lastVadActive=false;
let HeadAudio=null,libError=null;
let audioCtx=null,stream=null,source=null,node=null,mic=false;
let last=performance.now(),blink=0,blinkPhase=0,nextBlink=performance.now()+1800,eyeX=0,eyeY=0,eyeTX=0,eyeTY=0,nextEye=0;

const libReady=import(MODULE_URL).then(m=>{HeadAudio=m.HeadAudio}).catch(e=>{libError=e;console.error(e)});

for(const name of visemeNames){
  const label=document.createElement('div');label.className='viseme-name';label.textContent=name;label.dataset.v=name;
  const bar=document.createElement('div');bar.className='viseme-bar';const fill=document.createElement('span');bar.append(fill);
  $('visemeGrid').append(label,bar);bars[name]={label,fill};
}

function notice(t,ok=false,ms=2800){const n=$('notice');n.textContent=t;n.hidden=false;n.classList.toggle('ok',ok);if(ms)setTimeout(()=>{if(n.textContent===t)n.hidden=true},ms)}
function status(t,w=false){$('status').innerHTML=t;$('status').classList.toggle('warn',w);if(w)notice($('status').textContent)}
function friendly(e){if(e?.name==='NotAllowedError')return'Microphone permission was denied for this site.';if(e?.name==='NotFoundError')return'No microphone was found.';if(e?.name==='NotReadableError')return'The microphone could not be read.';return e?.message||'HeadAudio could not start.'}

async function diagnostics(){
  let perm='unavailable';try{if(navigator.permissions?.query)perm=(await navigator.permissions.query({name:'microphone'})).state}catch{}
  $('diag').textContent=[
    `secure context: ${isSecureContext?'yes':'NO'}`,
    `site mic permission: ${perm}`,
    `getUserMedia: ${navigator.mediaDevices?.getUserMedia?'available':'UNAVAILABLE'}`,
    `HeadAudio module: ${libError?'FAILED':HeadAudio?'loaded':'loading…'}`,
    `model: ${node?'loaded':'not started'}`,
    `worklet: ${node?'registered':'not started'}`,
    `source: HeadAudio @ ${COMMIT.slice(0,8)}`
  ].join('\n');
}
async function ask(){try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop());status('Microphone permission granted. Tap <b>Mic on</b>.');notice('Microphone permission granted.',true)}catch(e){status(friendly(e),true)}diagnostics()}

function setParam(name,value){if(!node)return;const p=node.parameters.get(name);if(p)p.value=+value}
function syncControls(){
  $('speakerMeanOut').textContent=$('speakerMean').value;
  $('vadActiveOut').textContent=`${$('vadActive').value} dB`;
  $('vadInactiveOut').textContent=`${$('vadInactive').value} dB`;
  $('silSensitivityOut').textContent=(+$('silSensitivity').value).toFixed(2);
  setParam('speakerMeanHz',$('speakerMean').value);
  setParam('vadGateActiveDb',$('vadActive').value);
  setParam('vadGateInactiveDb',$('vadInactive').value);
  setParam('silSensitivity',$('silSensitivity').value);
}
['speakerMean','vadActive','vadInactive','silSensitivity'].forEach(id=>$(id).addEventListener('input',syncControls));
syncControls();

async function toggleMic(){
  if(mic){stopMic();return}
  $('micBtn').disabled=true;$('micBtn').textContent='Starting…';
  try{
    await libReady;if(!HeadAudio)throw libError||new Error('HeadAudio module failed to load.');
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    audioCtx=new AudioContext();await audioCtx.resume();
    await audioCtx.audioWorklet.addModule(WORKLET_URL);
    node=new HeadAudio(audioCtx,{processorOptions:{vadEventsEnabled:true,visemeEventsEnabled:true},parameterData:{vadMode:1,vadGateActiveDb:+$('vadActive').value,vadGateInactiveDb:+$('vadInactive').value,silMode:1,silCalibrationWindowSec:3,silSensitivity:+$('silSensitivity').value,speakerMeanHz:+$('speakerMean').value}});
    await node.loadModel(MODEL_URL);
    node.onvalue=(key,value)=>{if(key in weights)weights[key]=clamp(value,0,1)};
    node.onvad=o=>{lastVadDb=Number.isFinite(o.db)?o.db:lastVadDb;lastVadActive=!!o.active;};
    node.onviseme=o=>{
      if(Number.isInteger(o.viseme))activeIndex=o.viseme;
      lastDistances=Array.isArray(o.distances)?o.distances:null;
    };
    node.onstarted=()=>{$('modePill').textContent='SPEECH'};
    node.onended=()=>{$('modePill').textContent='MIC'};
    node.oncalibrated=o=>{ $('silenceBtn').classList.remove('calibrating');$('silenceBtn').disabled=false;$('silenceBtn').textContent='Calibrate 3s of silence';if(o?.error){status(`Silence calibration failed: ${o.error}`,true)}else{status('Silence prototype calibrated for this room and microphone.');notice('Silence calibration complete.',true)} };
    source=audioCtx.createMediaStreamSource(stream);source.connect(node);
    mic=true;$('micBtn').textContent='Mic off';$('micBtn').classList.add('active');$('modePill').textContent='MIC';status('HeadAudio is live. Speak normally, then try silence calibration and speaker-mean tuning.');notice('HeadAudio connected.',true);
  }catch(e){console.error(e);status(friendly(e),true);stopMic(false)}finally{$('micBtn').disabled=false;diagnostics()}
}
function stopMic(update=true){
  mic=false;try{source?.disconnect()}catch{};try{node?.disconnect()}catch{};stream?.getTracks().forEach(t=>t.stop());source=null;node=null;stream=null;audioCtx?.close().catch(()=>{});audioCtx=null;
  for(const k of keys)weights[k]=0;activeIndex=14;lastDistances=null;lastVadDb=-100;lastVadActive=false;
  $('micBtn').textContent='Mic on';$('micBtn').classList.remove('active');$('modePill').textContent='IDLE';if(update)status('Microphone stopped.');
}

function calibrateSilence(){
  if(!node){status('Turn the microphone on before calibrating silence.',true);return}
  $('silenceBtn').disabled=true;$('silenceBtn').classList.add('calibrating');$('silenceBtn').textContent='Stay quiet…';status('HeadAudio is listening to three seconds of room silence.');node.calibrate();
}

const svg={mouth:$('mouth'),upper:$('upperLip'),lower:$('lowerLip'),teeth:$('teeth'),tongue:$('tongue'),chin:$('chin'),head:$('headGroup'),lidL:$('lidL'),lidR:$('lidR'),irisL:$('irisL'),irisR:$('irisR')};
const poses={
  aa:{o:.92,w:.57,r:0,press:0,teeth:.05,tongue:0},E:{o:.42,w:.77,r:0,press:0,teeth:.35,tongue:0},I:{o:.24,w:.82,r:0,press:0,teeth:.42,tongue:0},O:{o:.62,w:.40,r:.88,press:0,teeth:0,tongue:0},U:{o:.22,w:.29,r:1,press:0,teeth:0,tongue:0},
  PP:{o:.02,w:.48,r:0,press:1,teeth:0,tongue:0},SS:{o:.20,w:.72,r:0,press:0,teeth:.66,tongue:0},TH:{o:.22,w:.61,r:0,press:0,teeth:.50,tongue:.8},DD:{o:.30,w:.62,r:0,press:0,teeth:.25,tongue:.18},FF:{o:.12,w:.57,r:0,press:.18,teeth:.8,tongue:0},kk:{o:.38,w:.56,r:0,press:0,teeth:.08,tongue:0},nn:{o:.25,w:.61,r:0,press:0,teeth:.16,tongue:.25},RR:{o:.40,w:.55,r:.15,press:0,teeth:.08,tongue:0},CH:{o:.24,w:.66,r:.08,press:0,teeth:.5,tongue:0},sil:{o:.02,w:.50,r:0,press:0,teeth:0,tongue:0}
};
let mouthState={o:.02,w:.5,r:0,press:0,teeth:0,tongue:0};
function renderMouth(){
  let target={o:0,w:0,r:0,press:0,teeth:0,tongue:0},sum=0;
  for(let i=0;i<visemeNames.length;i++){const name=visemeNames[i],v=weights[`viseme_${name}`];if(v>0){sum+=v;const p=poses[name];for(const k in target)target[k]+=p[k]*v}}
  if(sum<.001)target={...poses.sil};else for(const k in target)target[k]/=sum;
  for(const k in mouthState)mouthState[k]=lerp(mouthState[k],target[k],.32);
  const m=mouthState,width=clamp(34+m.w*44-m.r*12-m.press*6,22,92),height=clamp(2+m.o*52-m.press*11,1.5,62),cx=300,cy=392,l=cx-width,r=cx+width,top=cy-height*(.47+.08*m.r),bot=cy+height*(.60+.05*m.o);
  svg.mouth.setAttribute('d',`M ${l} ${cy} Q ${cx} ${top} ${r} ${cy} Q ${cx} ${bot} ${l} ${cy}Z`);svg.upper.setAttribute('d',`M ${l} ${cy} Q ${cx} ${top-1.4} ${r} ${cy}`);svg.lower.setAttribute('d',`M ${l} ${cy} Q ${cx} ${bot+1.5} ${r} ${cy}`);
  svg.teeth.setAttribute('d',`M ${l+7} ${cy} Q ${cx} ${cy-Math.max(1,height*.23)} ${r-7} ${cy} Q ${cx} ${cy+Math.max(.5,height*.04)} ${l+7} ${cy}Z`);svg.teeth.style.opacity=clamp(m.teeth,0,.8);
  svg.tongue.setAttribute('d',`M ${cx-width*.27} ${cy+height*.12} Q ${cx} ${cy+height*.03} ${cx+width*.27} ${cy+height*.12} Q ${cx} ${cy+height*.38} ${cx-width*.27} ${cy+height*.12}Z`);svg.tongue.style.opacity=clamp(m.tongue,0,.75);svg.chin.style.transform=`translateY(${Math.min(15,m.o*13)}px)`;
}
function updateDiagnostics(){
  const active=visemeNames[clamp(activeIndex,0,14)]||'sil';$('activeViseme').textContent=active;$('shapePill').textContent=active.toUpperCase();$('vadDb').textContent=Number.isFinite(lastVadDb)?`${lastVadDb.toFixed(1)} dB`:'— dB';$('vadState').textContent=lastVadActive?'active':'inactive';$('meterFill').style.width=`${clamp((lastVadDb+70)/45*100,0,100)}%`;
  let gap=null;if(lastDistances&&lastDistances.length>1){const sorted=lastDistances.filter(Number.isFinite).slice().sort((a,b)=>a-b);if(sorted.length>1)gap=sorted[1]-sorted[0];}
  $('confidence').textContent=gap==null?'—':gap.toFixed(1);$('confidencePill').textContent=gap==null?'gap —':`gap ${gap.toFixed(1)}`;
  for(const name of visemeNames){const v=weights[`viseme_${name}`]||0;bars[name].fill.style.width=`${v*100}%`;bars[name].label.classList.toggle('active',name===active)}
}
function life(t,dt){
  if(t>nextBlink&&!blinkPhase)blinkPhase=1;if(blinkPhase===1){blink=Math.min(1,blink+dt/85);if(blink>=1)blinkPhase=2}else if(blinkPhase===2){blink=Math.max(0,blink-dt/120);if(blink<=0){blinkPhase=0;nextBlink=t+1400+Math.random()*3300}}svg.lidL.style.opacity=blink;svg.lidR.style.opacity=blink;
  if(t>nextEye){eyeTX=(Math.random()-.5)*4;eyeTY=(Math.random()-.5)*2.8;nextEye=t+650+Math.random()*1800}eyeX+=(eyeTX-eyeX)*.035;eyeY+=(eyeTY-eyeY)*.035;svg.irisL.setAttribute('transform',`translate(${eyeX} ${eyeY})`);svg.irisR.setAttribute('transform',`translate(${eyeX} ${eyeY})`);svg.head.style.transform=`translate(${Math.sin(t*.00055)*.8}px,${Math.sin(t*.00081)*.55}px) rotate(${Math.sin(t*.00072)*.22}deg)`;
}
function tick(t){const dt=Math.min(50,t-last);last=t;if(node)node.update(dt);renderMouth();updateDiagnostics();life(t,dt);requestAnimationFrame(tick)}

$('permissionBtn').onclick=ask;$('permissionDiagBtn').onclick=ask;$('micBtn').onclick=toggleMic;$('silenceBtn').onclick=calibrateSilence;$('diagBtn').onclick=diagnostics;
const aside=$('controls'),scrim=$('scrim');function drawer(on){aside.classList.toggle('open',on);scrim.classList.toggle('show',on)}$('drawerBtn').onclick=()=>drawer(!aside.classList.contains('open'));scrim.onclick=()=>drawer(false);

diagnostics();libReady.finally(diagnostics);requestAnimationFrame(tick);
