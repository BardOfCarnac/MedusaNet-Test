const $=id=>document.getElementById(id);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const MODEL_STORAGE='voice-face-direct-speaker-model-v1';
const WL_URL='../voice-face-puppet-wlipsync/wlipsync-calibrated.js';
const WL_PROFILE='https://cdn.jsdelivr.net/gh/mrxz/wLipSync@177f3ac4095dbad81be0a800a8c6f975abe4ae04/example/profile.json';
const WL_STORAGE='voiceFacePuppet.wlipsyncProfile.v1';
const VOWELS=['A','E','I','O','U'];
const shape={A:{o:.92,w:.60,r:0},I:{o:.25,w:.78,r:0},U:{o:.18,w:.30,r:.98},E:{o:.48,w:.72,r:0},O:{o:.62,w:.39,r:.86}};
const svg={mouth:$('mouth'),teeth:$('teeth'),upperLip:$('upperLip'),lowerLip:$('lowerLip'),chin:$('chin')};
const c={gain:$('gain'),mouthEx:$('mouthEx'),gate:$('gate'),ema:$('ema')};
const outs={gain:$('gainOut'),mouthEx:$('mouthExOut'),gate:$('gateOut'),ema:$('emaOut')};
function updateOutputs(){outs.gain.textContent=(+c.gain.value).toFixed(2);outs.mouthEx.textContent=(+c.mouthEx.value).toFixed(2);outs.gate.textContent=`${c.gate.value} dB`;outs.ema.textContent=(+c.ema.value).toFixed(2)}
Object.values(c).forEach(e=>e.addEventListener('input',updateOutputs));updateOutputs();

let personalModel=null;
function readSavedModel(){try{return JSON.parse(localStorage.getItem(MODEL_STORAGE)||'null')}catch{return null}}
function validateModel(m){
  if(!m||m.format!=='single-speaker-direct-vowel-v1')throw new Error('That is not a compatible direct-speaker model.');
  const a=m.audio,f=m.feature,k=m.classifier;
  if(!a||!f||!k||a.targetSampleRate!==16000||a.fftSize!==512||a.nMels!==24)throw new Error('Model audio configuration is incompatible.');
  if(!Array.isArray(m.melFilterbank)||m.melFilterbank.length!==24)throw new Error('Model mel filterbank is missing.');
  if(!Array.isArray(k.classes)||k.classes.length!==5||!Array.isArray(k.mean)||!Array.isArray(k.scale))throw new Error('Model classifier is incomplete.');
  return m;
}
function setModel(m,persist=true){
  personalModel=validateModel(m);
  if(persist)localStorage.setItem(MODEL_STORAGE,JSON.stringify(personalModel));
  $('directBtn').disabled=false;
  $('modelPill').textContent='MODEL: MY VOICE';
  const v=personalModel.validation||{};
  $('modelReadout').textContent=[
    `format: ${personalModel.format}`,
    `classes: ${personalModel.classifier.classes.join(' · ')}`,
    `context: ${personalModel.feature.contextFrames} × 10 ms`,
    `controlled vowel rep score: ${v.controlledVowelRepMajorityAccuracy!=null?(v.controlledVowelRepMajorityAccuracy*100).toFixed(1)+'%':'—'}`,
    `controlled consonant rep score: ${v.controlledConsonantRepAccuracy!=null?(v.controlledConsonantRepAccuracy*100).toFixed(1)+'%':'—'}`,
    `held-out natural benchmark: ${v.heldOutNaturalAgreementToWlip!=null?(v.heldOutNaturalAgreementToWlip*100).toFixed(1)+'%':'—'}`
  ].join('\n');
}
const saved=readSavedModel();if(saved){try{setModel(saved,false)}catch(e){console.warn(e)}}
$('modelFile').addEventListener('change',async e=>{
  const f=e.target.files?.[0];if(!f)return;
  try{setModel(JSON.parse(await f.text()),true);status('Personal direct model loaded and saved locally.');selectMode('direct')}catch(err){status(err.message,true)}finally{e.target.value=''}
});
$('clearModelBtn').onclick=()=>{localStorage.removeItem(MODEL_STORAGE);personalModel=null;$('directBtn').disabled=true;$('modelPill').textContent='MODEL: NONE';$('modelReadout').textContent='No personal model loaded yet.';selectMode('wl');status('Local direct model removed.')};

function fftRadix2(re,im){
  const n=re.length;
  for(let i=1,j=0;i<n;i++){
    let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
    if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}
  }
  for(let len=2;len<=n;len<<=1){
    const ang=-2*Math.PI/len,wr0=Math.cos(ang),wi0=Math.sin(ang);
    for(let i=0;i<n;i+=len){
      let wr=1,wi=0;
      for(let j=0;j<(len>>1);j++){
        const uR=re[i+j],uI=im[i+j],k=i+j+(len>>1);
        const vR=re[k]*wr-im[k]*wi,vI=re[k]*wi+im[k]*wr;
        re[i+j]=uR+vR;im[i+j]=uI+vI;re[k]=uR-vR;im[k]=uI-vI;
        const nr=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=nr;
      }
    }
  }
}
class DirectFeatureStream{
  constructor(model,inputRate,onOutput){
    this.m=model;this.inputRate=inputRate;this.targetRate=model.audio.targetSampleRate;this.ratio=inputRate/this.targetRate;
    this.resample=[];this.pos=0;this.samples=[];this.history=[];this.prevProb=null;this.onOutput=onOutput;
    this.hann=Float64Array.from({length:model.audio.frameLength},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(model.audio.frameLength-1)));
  }
  push(input){
    for(let i=0;i<input.length;i++)this.resample.push(input[i]);
    while(this.pos+1<this.resample.length){
      const i=Math.floor(this.pos),f=this.pos-i;
      this.samples.push(this.resample[i]*(1-f)+this.resample[i+1]*f);
      this.pos+=this.ratio;
    }
    const drop=Math.floor(this.pos);
    if(drop>0){this.resample.splice(0,drop);this.pos-=drop}
    const frame=this.m.audio.frameLength,hop=this.m.audio.hopLength;
    while(this.samples.length>=frame){
      this.processFrame(this.samples.slice(0,frame));
      this.samples.splice(0,hop);
    }
  }
  processFrame(frame){
    const N=this.m.audio.fftSize,re=new Float64Array(N),im=new Float64Array(N);
    let ss=0;
    for(let i=0;i<frame.length;i++){const v=frame[i];ss+=v*v;re[i]=v*this.hann[i]}
    fftRadix2(re,im);
    const bins=N/2+1,pow=new Float64Array(bins);
    for(let k=0;k<bins;k++)pow[k]=re[k]*re[k]+im[k]*im[k];
    const lm=new Float64Array(this.m.audio.nMels);
    for(let j=0;j<lm.length;j++){
      const filt=this.m.melFilterbank[j];let s=0;
      for(let k=0;k<bins;k++)s+=filt[k]*pow[k];
      lm[j]=10*Math.log10(Math.max(s,1e-12));
    }
    const rms=Math.sqrt(ss/frame.length+1e-12),db=20*Math.log10(rms+1e-12);
    this.history.push(Array.from(lm));if(this.history.length>this.m.feature.contextFrames)this.history.shift();
    if(this.history.length<this.m.feature.contextFrames){this.onOutput({weights:{A:0,E:0,I:0,O:0,U:0},db,confidence:0,shape:'REST'});return}
    const h=this.history,feat=[];
    for(const [a,b] of this.m.feature.bins){
      for(let j=0;j<lm.length;j++){let s=0;for(let i=a;i<b;i++)s+=h[i][j];feat.push(s/(b-a))}
    }
    for(let j=0;j<lm.length;j++)feat.push(h[h.length-1][j]);
    for(let j=0;j<lm.length;j++)feat.push(h[h.length-1][j]-h[0][j]);
    const k=this.m.classifier,z=new Float64Array(feat.length);
    for(let i=0;i<feat.length;i++)z[i]=(feat[i]-k.mean[i])/(k.scale[i]||1);
    const scores=new Float64Array(k.classes.length);let max=-Infinity;
    for(let ci=0;ci<k.classes.length;ci++){
      let s=k.intercept[ci];const row=k.coef[ci];for(let i=0;i<z.length;i++)s+=row[i]*z[i];scores[ci]=s;if(s>max)max=s;
    }
    let sum=0;const p=new Float64Array(scores.length);for(let i=0;i<scores.length;i++){p[i]=Math.exp(scores[i]-max);sum+=p[i]}for(let i=0;i<p.length;i++)p[i]/=sum;
    const alpha=+c.ema.value;
    if(!this.prevProb)this.prevProb=Float64Array.from(p);else for(let i=0;i<p.length;i++)this.prevProb[i]=(1-alpha)*this.prevProb[i]+alpha*p[i];
    const gate=+c.gate.value,active=db>=gate;
    const w={A:0,E:0,I:0,O:0,U:0};let bi=0;
    for(let i=1;i<this.prevProb.length;i++)if(this.prevProb[i]>this.prevProb[bi])bi=i;
    if(active){
      for(let i=0;i<k.classes.length;i++){
        const cls=k.classes[i],v=this.prevProb[i];
        if(cls==='aa')w.A=v;else if(cls in w)w[cls]=v;
      }
    }
    this.onOutput({weights:w,db,confidence:active?this.prevProb[bi]:0,shape:active?(k.classes[bi]==='aa'?'A':k.classes[bi]):'REST'});
  }
}

let wlLib=null,stockWl=null,wlProfile=null;
const wlReady=Promise.all([import(WL_URL),fetch(WL_PROFILE).then(r=>{if(!r.ok)throw new Error('wLip profile '+r.status);return r.json()})]).then(([m,p])=>{wlLib=m;stockWl=p;try{wlProfile=JSON.parse(localStorage.getItem(WL_STORAGE)||'null')||p}catch{wlProfile=p}}).catch(e=>{console.error(e)});
let audioCtx=null,stream=null,source=null,script=null,zeroGain=null,directStream=null,wlNode=null,mic=false,mode=personalModel?'direct':'wl';
let directState={weights:{A:0,E:0,I:0,O:0,U:0},db:-100,confidence:0,shape:'REST'};
function selectMode(m){if(m==='direct'&&!personalModel)return;mode=m;$('directBtn').classList.toggle('primary',m==='direct');$('wlBtn').classList.toggle('primary',m==='wl');$('modePill').textContent=m==='direct'?'DIRECT':'WLIPSYNC'}
$('directBtn').onclick=()=>selectMode('direct');$('wlBtn').onclick=()=>selectMode('wl');selectMode(mode);
function notice(t,ok=false){const n=$('notice');n.textContent=t;n.hidden=false;n.classList.toggle('ok',ok);setTimeout(()=>{if(n.textContent===t)n.hidden=true},2600)}
function status(t,w=false){$('status').textContent=t;$('status').classList.toggle('warn',w);if(w)notice(t)}
async function ask(){try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop());status('Microphone permission granted.');notice('Microphone ready.',true)}catch(e){status(e.message||'Microphone permission failed.',true)}diagnostics()}
async function startMic(){
  if(mic){stopMic();return}
  $('micBtn').disabled=true;$('micBtn').textContent='Starting…';
  try{
    await wlReady;
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    audioCtx=new AudioContext();await audioCtx.resume();source=audioCtx.createMediaStreamSource(stream);
    if(personalModel){
      directStream=new DirectFeatureStream(personalModel,audioCtx.sampleRate,o=>{directState=o});
      script=audioCtx.createScriptProcessor(2048,1,1);script.onaudioprocess=e=>directStream?.push(e.inputBuffer.getChannelData(0));
      zeroGain=audioCtx.createGain();zeroGain.gain.value=0;source.connect(script);script.connect(zeroGain);zeroGain.connect(audioCtx.destination);
    }
    if(wlLib&&wlProfile){wlNode=await wlLib.createWLipSyncNode(audioCtx,wlProfile);wlNode.smoothness=.055;source.connect(wlNode)}
    mic=true;$('micBtn').textContent='Mic off';$('micBtn').classList.add('active');status(personalModel?'Both models are listening. Switch between Direct and wLipSync.':'wLipSync is live. Load your direct model to enable it.');notice('Microphone live.',true)
  }catch(e){console.error(e);status(e.message||'Could not start microphone.',true);stopMic(false)}finally{$('micBtn').disabled=false;diagnostics()}
}
function stopMic(update=true){mic=false;try{source?.disconnect()}catch{};try{script?.disconnect()}catch{};try{zeroGain?.disconnect()}catch{};try{wlNode?.disconnect()}catch{};stream?.getTracks().forEach(t=>t.stop());source=script=zeroGain=wlNode=directStream=stream=null;audioCtx?.close().catch(()=>{});audioCtx=null;$('micBtn').textContent='Mic on';$('micBtn').classList.remove('active');directState={weights:{A:0,E:0,I:0,O:0,U:0},db:-100,confidence:0,shape:'REST'};if(update)status('Microphone stopped.');diagnostics()}
$('permissionBtn').onclick=ask;$('micBtn').onclick=startMic;

function directSample(){const w={...directState.weights};const v=clamp(((directState.db-(+c.gate.value))/26)*(+c.gain.value));return{w,v,shape:directState.shape,confidence:directState.confidence}}
function wlSample(){if(!wlNode)return{w:{A:0,E:0,I:0,O:0,U:0},v:0,shape:'REST',confidence:0};const w={A:0,E:0,I:0,O:0,U:0};let best='REST',bv=0;for(const k of VOWELS){w[k]=clamp(+wlNode.weights[k]||0);if(w[k]>bv){bv=w[k];best=k}}const v=clamp((wlNode.volume||0)*(+c.gain.value));return{w,v,shape:v>.04?best:'REST',confidence:bv}}
let mouthState={open:0,width:.5,round:0,volume:0};
function renderMouth(s){
  const w=s.w,v=s.v;let sum=0,o=0,wd=0,r=0;for(const k of VOWELS)sum+=w[k]||0;
  if(sum>.0001){for(const k of VOWELS){const n=(w[k]||0)/sum;o+=shape[k].o*n;wd+=shape[k].w*n;r+=shape[k].r*n}}else wd=.5;
  o*=v*(+c.mouthEx.value);wd=lerp(.5,wd,v);r*=v;
  mouthState.open=lerp(mouthState.open,o,.30);mouthState.width=lerp(mouthState.width,wd,.30);mouthState.round=lerp(mouthState.round,r,.30);mouthState.volume=lerp(mouthState.volume,v,.25);
  const width=clamp(35+mouthState.width*42-mouthState.round*10,24,94),height=clamp(2.5+mouthState.open*(48+mouthState.round*8),1.8,62),cx=300,cy=392,l=cx-width,rr=cx+width,top=cy-height*(.48+.1*mouthState.round),bot=cy+height*(.58+.08*mouthState.open);
  svg.mouth.setAttribute('d',`M ${l} ${cy} Q ${cx} ${top} ${rr} ${cy} Q ${cx} ${bot} ${l} ${cy}Z`);svg.upperLip.setAttribute('d',`M ${l} ${cy} Q ${cx} ${top-1.5} ${rr} ${cy}`);svg.lowerLip.setAttribute('d',`M ${l} ${cy} Q ${cx} ${bot+1.5} ${rr} ${cy}`);svg.teeth.setAttribute('d',`M ${l+7} ${cy} Q ${cx} ${cy-height*.22} ${rr-7} ${cy} Q ${cx} ${cy+Math.max(.5,height*.03)} ${l+7} ${cy}Z`);svg.teeth.style.opacity=mouthState.open>.22&&mouthState.round<.7?clamp((mouthState.width-.45)*1.4+mouthState.open*.18,0,.62):0;svg.chin.style.transform=`translateY(${Math.min(15,mouthState.open*13)}px)`;
  $('shapePill').textContent=s.shape;$('confidencePill').textContent=`${Math.round((s.confidence||0)*100)}%`;$('meterFill').style.width=`${v*100}%`;
  for(const k of VOWELS){const val=w[k]||0;$('bar'+k).style.width=`${val*100}%`;$('val'+k).textContent=val.toFixed(2)}
  window.DirectLipSyncOutput={model:mode,shape:s.shape,weights:{...w},volume:v,confidence:s.confidence};
}
function tick(){const s=mode==='direct'?directSample():wlSample();renderMouth(s);requestAnimationFrame(tick)}requestAnimationFrame(tick);
async function diagnostics(){let perm='unknown';try{perm=(await navigator.permissions.query({name:'microphone'})).state}catch{}$('diag').textContent=[`secure context: ${isSecureContext?'yes':'NO'}`,`mic permission: ${perm}`,`AudioContext: ${window.AudioContext?'available':'missing'}`,`direct model: ${personalModel?'loaded locally':'not loaded'}`,`wLipSync: ${wlLib?'loaded':'loading…'}`,`runtime input rate: ${audioCtx?.sampleRate||'—'} Hz`,`direct target rate: 16000 Hz`,`direct context: 160 ms causal history`].join('\n')}
diagnostics();wlReady.finally(diagnostics);
const aside=$('controls'),scrim=$('scrim');function drawer(on){aside.classList.toggle('open',on);scrim.classList.toggle('show',on)}$('drawerBtn').onclick=()=>drawer(!aside.classList.contains('open'));scrim.onclick=()=>drawer(false);
