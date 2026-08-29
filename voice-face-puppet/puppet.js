const LIB_COMMIT = 'd4f1d4aaf85be9bf8a6e2264f828dd8cab019a92';
const LIB_BASE = `https://cdn.jsdelivr.net/gh/Amoner/lipsync-engine@${LIB_COMMIT}/src`;

let FrequencyAnalyzer = null;
let VISEME_SHAPES = null;
let EXTENDED_VISEMES = null;
let libraryError = null;
const libraryReady = Promise.all([
  import(`${LIB_BASE}/analyzers/FrequencyAnalyzer.js`),
  import(`${LIB_BASE}/core/visemes.js`),
]).then(([a, v]) => {
  FrequencyAnalyzer = a.FrequencyAnalyzer;
  VISEME_SHAPES = v.VISEME_SHAPES;
  EXTENDED_VISEMES = v.EXTENDED_VISEMES;
}).catch(err => {
  libraryError = err;
  console.error('lipsync-engine module load failed', err);
});

const $ = id => document.getElementById(id);
const controls = {
  sensitivity: $('sensitivity'), mouthEx: $('mouthEx'), smoothing: $('smoothing'), roundness: $('roundness'), consonantSnap: $('consonantSnap'),
  blinkRate: $('blinkRate'), headMotion: $('headMotion'), eyeMotion: $('eyeMotion'), headWidth: $('headWidth'),
  headLength: $('headLength'), eyeSpacing: $('eyeSpacing'), eyeSize: $('eyeSize'), mouthWidth: $('mouthWidth'), browHeight: $('browHeight')
};
const defaults = Object.fromEntries(Object.entries(controls).map(([k, el]) => [k, +el.value]));
const outputs = Object.fromEntries(Object.keys(controls).map(k => [k, $(k+'Out')]));
const fmt = (k,v) => k === 'browHeight' ? `${Math.round(v)}px` : (k === 'consonantSnap' ? `${Math.round(v)}f` : Number(v).toFixed(2).replace(/\.00$/,''));
function syncOutputs(){ for (const [k,el] of Object.entries(controls)) outputs[k].textContent = fmt(k,+el.value); }
syncOutputs();

const svg = {
  headGroup: $('headGroup'), head: $('head'), glow: $('headGlow'), earL:$('earL'), earR:$('earR'),
  irisL:$('irisL'), irisR:$('irisR'), eyeL:$('eyeLineL'), eyeR:$('eyeLineR'), lidL:$('lidL'), lidR:$('lidR'),
  browL:$('browL'), browR:$('browR'), mouth:$('mouth'), teeth:$('teeth'), hair:$('hair'), chin:$('chin'),
  upperLip:$('upperLip'), lowerLip:$('lowerLip'), tongue:$('tongue')
};

let audioCtx=null, analyserNode=null, source=null, stream=null, lipAnalyzer=null;
let micActive=false, demoActive=false;
let blink=0, blinkPhase=0, nextBlink=performance.now()+1800;
let eyeTargetX=0, eyeTargetY=0, eyeX=0, eyeY=0, nextEyeShift=0;
let last=performance.now();
let lastFrame = {viseme:'sil', intensity:0, amplitude:0, confidence:1, shape:{open:0,width:.5,round:0}, transition:{from:'sil',to:'sil',progress:1}};
let renderState = {open:0,width:.5,round:0,press:0};
let demoIndex=0, demoNext=0;
const demoSequence=['sil','PP','aa','E','I','O','U','FF','TH','SS','CH','nn','RR','DD','kk'];

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function ease(current,target,speed){return current+(target-current)*speed;}
function showNotice(text, ok=false, timeout=0){
  const n=$('notice'); n.textContent=text; n.hidden=false; n.classList.toggle('ok',ok);
  if(timeout) setTimeout(()=>{ if(n.textContent===text) n.hidden=true; }, timeout);
}
function setStatus(text,warn=false){$('status').innerHTML=text;$('status').classList.toggle('warn',warn);if(warn)showNotice($('status').textContent,false);}

async function microphoneDiagnostics(){
  const framed=window.top!==window.self;
  let policy='unknown', permission='unavailable';
  try{
    if(document.permissionsPolicy?.allowsFeature) policy=document.permissionsPolicy.allowsFeature('microphone')?'allowed':'blocked';
    else if(document.featurePolicy?.allowsFeature) policy=document.featurePolicy.allowsFeature('microphone')?'allowed':'blocked';
  }catch(_){ }
  try{
    if(navigator.permissions?.query){const p=await navigator.permissions.query({name:'microphone'});permission=p.state;p.onchange=()=>microphoneDiagnostics();}
  }catch(_){ }
  const libState = libraryError ? 'FAILED' : (FrequencyAnalyzer ? 'loaded' : 'loading');
  $('diag').textContent=[
    `secure context: ${window.isSecureContext?'yes':'NO'}`,
    `embedded frame: ${framed?'YES':'no'}`,
    `frame mic policy: ${policy}`,
    `site mic permission: ${permission}`,
    `getUserMedia: ${navigator.mediaDevices?.getUserMedia?'available':'UNAVAILABLE'}`,
    `lipsync-engine: ${libState}`,
    `origin: ${location.origin || '(opaque)'}`
  ].join('\n');
  $('standaloneBtn')?.classList.toggle('show', framed || policy==='blocked');
}
function openStandalone(){const w=window.open(location.href,'_blank','noopener,noreferrer');if(!w)showNotice('The browser blocked the new tab.',false);}
function micError(err){
  if(!window.isSecureContext)return 'Microphone needs a normal HTTPS page.';
  if(err?.name==='NotAllowedError'||err?.name==='PermissionDeniedError')return 'Chrome denied microphone access for this site.';
  if(err?.name==='NotFoundError')return 'No microphone was found.';
  if(err?.name==='NotReadableError')return 'The microphone exists but could not be read; another app may be using it.';
  return `Microphone failed${err?.message?': '+err.message:''}.`;
}
async function askForMicPermission(){
  stopDemo();
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('getUserMedia unavailable');
    const s=await navigator.mediaDevices.getUserMedia({audio:true,video:false}); s.getTracks().forEach(t=>t.stop());
    setStatus('Chrome granted microphone permission. Tap <b>Mic on</b>.'); showNotice('Microphone permission granted.',true,2800);
  }catch(e){setStatus(micError(e),true);} finally{microphoneDiagnostics();}
}

function configureAnalyzer(){
  if(!lipAnalyzer) return;
  const sensitivity=+controls.sensitivity.value;
  lipAnalyzer.opts.silenceThreshold=clamp(0.022/sensitivity,0.004,0.04);
  lipAnalyzer.opts.smoothingFactor=+controls.smoothing.value;
  lipAnalyzer.opts.holdFrames=Math.max(1,Math.round(+controls.consonantSnap.value));
}
async function toggleMic(){
  if(micActive){stopMic();return;}
  stopDemo();
  try{
    await libraryReady;
    if(!FrequencyAnalyzer) throw new Error(`lipsync-engine failed to load${libraryError?.message?': '+libraryError.message:''}`);
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended')await audioCtx.resume();
    analyserNode=audioCtx.createAnalyser();
    source=audioCtx.createMediaStreamSource(stream); source.connect(analyserNode);
    lipAnalyzer=new FrequencyAnalyzer(analyserNode,audioCtx.sampleRate,{
      fftSize:256,
      silenceThreshold:clamp(0.022/(+controls.sensitivity.value),0.004,0.04),
      smoothingFactor:+controls.smoothing.value,
      holdFrames:Math.max(1,Math.round(+controls.consonantSnap.value)),
      intensitySmoothing:.2,
      energySmoothing:.5,
    });
    micActive=true;
    $('micBtn').textContent='Mic off'; $('micBtn').classList.add('active'); $('modePill').textContent='MIC · LIPSYNC';
    setStatus('Microphone active. Mouth tracking is now driven by lipsync-engine’s 15-viseme FrequencyAnalyzer.');
    showNotice('lipsync-engine connected — speak normally.',true,2600);
  }catch(e){stopMic(false);setStatus(micError(e),true);console.error(e);} finally{microphoneDiagnostics();}
}
function stopMic(updateStatus=true){
  micActive=false; stream?.getTracks().forEach(t=>t.stop()); stream=null; source=null; analyserNode=null; lipAnalyzer=null;
  audioCtx?.close().catch(()=>{}); audioCtx=null;
  $('micBtn').textContent='Mic on'; $('micBtn').classList.remove('active'); if(!demoActive)$('modePill').textContent='IDLE';
  if(updateStatus)setStatus('Microphone stopped.');
}
function toggleDemo(){
  if(demoActive){stopDemo();return;}
  stopMic(false); demoActive=true; demoIndex=0; demoNext=0;
  $('demoBtn').classList.add('active'); $('demoBtn').textContent='Stop demo'; $('modePill').textContent='DEMO · VISEMES';
  setStatus('Demo cycles through the same 15 viseme shape targets used by the library.');
}
function stopDemo(){demoActive=false;$('demoBtn').classList.remove('active');$('demoBtn').textContent='Demo voice';if(!micActive)$('modePill').textContent='IDLE';}

function demoFrame(now){
  if(!VISEME_SHAPES) return lastFrame;
  if(now>=demoNext){demoNext=now+360;demoIndex=(demoIndex+1)%demoSequence.length;}
  const viseme=demoSequence[demoIndex];
  return {viseme,intensity:viseme==='sil'?0:.72,amplitude:viseme==='sil'?0:.12,confidence:.9,shape:{...VISEME_SHAPES[viseme]},transition:{from:lastFrame.viseme,to:viseme,progress:.8}};
}

const visemeLabels={sil:'REST',PP:'M / B / P',FF:'F / V',TH:'TH',DD:'D / T / N / L',kk:'K / G',CH:'CH / SH / J',SS:'S / Z',nn:'N / NG',RR:'R',aa:'AA / AH',E:'EH / AE',I:'IH / IY',O:'OH / AO',U:'UW / OW'};
function renderMouth(frame){
  const shape=frame.shape||{open:0,width:.5,round:0};
  const intensity=clamp(frame.intensity??0,0,1);
  const ex=+controls.mouthEx.value;
  const roundBoost=+controls.roundness.value;
  const targetOpen=clamp(shape.open*(0.38+intensity*.82)*ex,0,1.25);
  const targetWidth=clamp(shape.width,0.2,.85);
  const targetRound=clamp(shape.round*roundBoost,0,1);
  const targetPress=frame.viseme==='PP'?1:0;
  const speed=frame.viseme==='PP'?.62:.38;
  renderState.open=ease(renderState.open,targetOpen,speed);
  renderState.width=ease(renderState.width,targetWidth,.34);
  renderState.round=ease(renderState.round,targetRound,.34);
  renderState.press=ease(renderState.press,targetPress,targetPress>.5?.72:.28);

  const base=+controls.mouthWidth.value;
  let halfWidth=(34+renderState.width*42-renderState.round*15-renderState.press*10)*base;
  let height=2+renderState.open*(50+renderState.round*8)-renderState.press*12;
  halfWidth=clamp(halfWidth,22,94);height=clamp(height,1.5,62);
  const cx=300,cy=392,l=cx-halfWidth,r=cx+halfWidth;
  const top=cy-height*(.45-renderState.press*.18),bot=cy+height*(.62+renderState.open*.1);
  svg.mouth.setAttribute('d',`M ${l} ${cy} Q ${cx} ${top} ${r} ${cy} Q ${cx} ${bot} ${l} ${cy}Z`);
  svg.upperLip.setAttribute('d',`M ${l} ${cy} Q ${cx} ${top-1.6} ${r} ${cy}`);
  svg.lowerLip.setAttribute('d',`M ${l} ${cy} Q ${cx} ${bot+1.6} ${r} ${cy}`);

  const teethVis=['FF','TH','SS','CH','E','I'].includes(frame.viseme) || (renderState.open>.42 && renderState.round<.55);
  svg.teeth.setAttribute('d',`M ${l+8} ${cy} Q ${cx} ${cy-height*.26} ${r-8} ${cy} Q ${cx} ${cy+Math.max(1,height*.04)} ${l+8} ${cy}Z`);
  svg.teeth.style.opacity=teethVis?clamp(.22+intensity*.5,0,.78):0;
  const tongueVis=['TH','DD','nn'].includes(frame.viseme) && renderState.open>.08;
  svg.tongue.style.opacity=tongueVis?clamp(.35+intensity*.45,0,.8):0;
  svg.tongue.setAttribute('transform',`translate(0 ${Math.min(8,renderState.open*6)})`);
  svg.chin.style.transform=`translateY(${Math.min(16,renderState.open*14)}px)`;
  $('shapePill').textContent=visemeLabels[frame.viseme]||frame.viseme||'REST';
  const trans=frame.transition||{};
  $('debugPill').textContent=`${frame.viseme||'sil'} · conf ${(frame.confidence??0).toFixed(2)} · ${trans.from||'—'}→${trans.to||'—'}`;
}

function updateFaceGeometry(){
  const hw=+controls.headWidth.value,hl=+controls.headLength.value;
  svg.head.setAttribute('transform',`translate(${300-300*hw} ${306-306*hl}) scale(${hw} ${hl})`);
  svg.glow.setAttribute('transform',`translate(${300-300*hw} ${306-306*hl}) scale(${hw} ${hl})`);
  svg.hair.setAttribute('transform',`translate(${300-300*hw} 0) scale(${hw} 1)`);
  svg.earL.setAttribute('transform',`translate(${(1-hw)*90} 0)`); svg.earR.setAttribute('transform',`translate(${(hw-1)*90} 0)`);
  const spacing=+controls.eyeSpacing.value,size=+controls.eyeSize.value,off=(spacing-1)*48;
  svg.eyeL.setAttribute('transform',`translate(${-off} 0) translate(${234-234*size} ${266-266*size}) scale(${size})`);
  svg.eyeR.setAttribute('transform',`translate(${off} 0) translate(${366-366*size} ${266-266*size}) scale(${size})`);
  svg.lidL.setAttribute('transform',`translate(${-off} 0) translate(${234-234*size} ${266-266*size}) scale(${size})`);
  svg.lidR.setAttribute('transform',`translate(${off} 0) translate(${366-366*size} ${266-266*size}) scale(${size})`);
  const bh=+controls.browHeight.value;svg.browL.setAttribute('transform',`translate(${-off} ${bh})`);svg.browR.setAttribute('transform',`translate(${off} ${bh})`);
}
function animateLife(now,dt){
  if(now>nextBlink&&blinkPhase===0)blinkPhase=1;
  if(blinkPhase===1){blink=Math.min(1,blink+dt/85);if(blink>=1)blinkPhase=2;}
  else if(blinkPhase===2){blink=Math.max(0,blink-dt/120);if(blink<=0){blinkPhase=0;nextBlink=now+(1200+Math.random()*3400)/(+controls.blinkRate.value);}}
  svg.lidL.style.opacity=blink;svg.lidR.style.opacity=blink;
  if(now>nextEyeShift){const e=+controls.eyeMotion.value;eyeTargetX=(Math.random()-.5)*10*e;eyeTargetY=(Math.random()-.5)*6*e;nextEyeShift=now+600+Math.random()*1900;}
  eyeX+=(eyeTargetX-eyeX)*.035;eyeY+=(eyeTargetY-eyeY)*.035;
  const spacing=+controls.eyeSpacing.value,size=+controls.eyeSize.value,off=(spacing-1)*48;
  svg.irisL.setAttribute('transform',`translate(${-off+eyeX} ${eyeY}) translate(${234-234*size} ${266-266*size}) scale(${size})`);
  svg.irisR.setAttribute('transform',`translate(${off+eyeX} ${eyeY}) translate(${366-366*size} ${266-266*size}) scale(${size})`);
  const hm=+controls.headMotion.value;
  const rot=Math.sin(now*.00072)*1.05*hm,tx=Math.sin(now*.00055+1.4)*3*hm,ty=Math.sin(now*.00081)*2*hm;
  svg.headGroup.style.transform=`translate(${tx}px,${ty}px) rotate(${rot}deg)`;
}
function tick(now){
  const dt=Math.min(50,now-last);last=now;
  if(micActive&&lipAnalyzer){configureAnalyzer();lastFrame=lipAnalyzer.analyze();}
  else if(demoActive){lastFrame=demoFrame(now);}
  else {lastFrame={viseme:'sil',intensity:0,amplitude:0,confidence:1,shape:{open:0,width:.5,round:0},transition:{from:lastFrame.viseme,to:'sil',progress:1}};}
  renderMouth(lastFrame);animateLife(now,dt);
  $('meterFill').style.width=`${Math.min(100,(lastFrame.amplitude||0)*650*(+controls.sensitivity.value))}%`;
  requestAnimationFrame(tick);
}

Object.values(controls).forEach(el=>el.addEventListener('input',()=>{syncOutputs();updateFaceGeometry();configureAnalyzer();}));
$('permissionBtn').addEventListener('click',askForMicPermission);$('permissionDiagBtn').addEventListener('click',askForMicPermission);
$('micBtn').addEventListener('click',toggleMic);$('demoBtn').addEventListener('click',toggleDemo);
$('standaloneBtn').addEventListener('click',openStandalone);$('standaloneDiagBtn').addEventListener('click',openStandalone);$('diagBtn').addEventListener('click',microphoneDiagnostics);
const presets={neutral:{headWidth:1,headLength:1,eyeSpacing:1,eyeSize:1,mouthWidth:1,browHeight:0},angular:{headWidth:.9,headLength:1.1,eyeSpacing:1.08,eyeSize:.9,mouthWidth:.92,browHeight:-8},soft:{headWidth:1.12,headLength:.94,eyeSpacing:.94,eyeSize:1.13,mouthWidth:1.12,browHeight:6}};
document.querySelectorAll('[data-preset]').forEach(btn=>btn.addEventListener('click',()=>{const p=presets[btn.dataset.preset];for(const[k,v]of Object.entries(p))controls[k].value=v;syncOutputs();updateFaceGeometry();}));
$('randomBtn').addEventListener('click',()=>{const rnd=(a,b)=>a+Math.random()*(b-a);const vals={headWidth:rnd(.78,1.22),headLength:rnd(.85,1.17),eyeSpacing:rnd(.78,1.28),eyeSize:rnd(.8,1.3),mouthWidth:rnd(.76,1.34),browHeight:rnd(-18,18)};for(const[k,v]of Object.entries(vals))controls[k].value=v;syncOutputs();updateFaceGeometry();});
$('resetBtn').addEventListener('click',()=>{for(const[k,v]of Object.entries(defaults))controls[k].value=v;syncOutputs();updateFaceGeometry();configureAnalyzer();});
const aside=$('controls'),scrim=$('scrim');function drawer(open){aside.classList.toggle('open',open);scrim.classList.toggle('show',open);}$('drawerBtn').addEventListener('click',()=>drawer(!aside.classList.contains('open')));scrim.addEventListener('click',()=>drawer(false));

updateFaceGeometry();
libraryReady.finally(()=>{microphoneDiagnostics();if(libraryError)setStatus('The external lipsync-engine module failed to load. Refresh the page and try again.',true);});
microphoneDiagnostics();
requestAnimationFrame(tick);