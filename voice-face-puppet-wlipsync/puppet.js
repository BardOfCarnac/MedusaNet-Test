const WL_URL='./wlipsync-calibrated.js';
const PROFILE_URL='https://cdn.jsdelivr.net/gh/mrxz/wLipSync@177f3ac4095dbad81be0a800a8c6f975abe4ae04/example/profile.json';
const STORAGE_KEY='voiceFacePuppet.wlipsyncProfile.v1';
const VOWELS=['A','I','U','E','O'];
const $=id=>document.getElementById(id), clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), lerp=(a,b,t)=>a+(b-a)*t;
const c={sensitivity:$('sensitivity'),mouthEx:$('mouthEx'),smoothing:$('smoothing'),roundness:$('roundness'),consonantSnap:$('consonantSnap'),blinkRate:$('blinkRate'),headMotion:$('headMotion'),eyeMotion:$('eyeMotion')};
const out=Object.fromEntries(Object.keys(c).map(k=>[k,$(k+'Out')]));
function outputs(){for(const[k,e]of Object.entries(c))out[k].textContent=(+e.value).toFixed(2).replace(/\.00$/,'')};outputs();
const svg={headGroup:$('headGroup'),mouth:$('mouth'),teeth:$('teeth'),upperLip:$('upperLip'),lowerLip:$('lowerLip'),chin:$('chin'),lidL:$('lidL'),lidR:$('lidR'),irisL:$('irisL'),irisR:$('irisR')};
let wl,stockProfile,activeProfile,libError,profileError,audioCtx,stream,source,node,mic=false,demo=false;
let state={open:0,width:.5,round:0,volume:0},blink=0,blinkPhase=0,nextBlink=performance.now()+1800,eyeX=0,eyeY=0,eyeTX=0,eyeTY=0,nextEye=0,last=performance.now();
const calSamples=Object.fromEntries(VOWELS.map(k=>[k,[]]));
let calHolding=null,calLastTimestamp=-1;

function deepCopy(x){return JSON.parse(JSON.stringify(x))}
function loadSavedProfile(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}}
const ready=import(WL_URL).then(async m=>{
  wl=m;
  const r=await fetch(PROFILE_URL);if(!r.ok)throw new Error('Profile HTTP '+r.status);
  stockProfile=await r.json();
  activeProfile=loadSavedProfile()||stockProfile;
  updateProfilePill();
  updateCalUI();
}).catch(e=>{if(!wl)libError=e;else profileError=e;console.error(e)});
function notice(t,ok=false){const n=$('notice');n.textContent=t;n.hidden=false;n.classList.toggle('ok',ok);setTimeout(()=>{if(n.textContent===t)n.hidden=true},3000)}
function status(t,w=false){$('status').innerHTML=t;$('status').classList.toggle('warn',w);if(w)notice($('status').textContent)}
function errText(e){if(e?.name==='NotAllowedError')return'Microphone permission was denied for this site.';if(e?.name==='NotFoundError')return'No microphone was found.';if(e?.name==='NotReadableError')return'The microphone could not be read.';return e?.message||'wLipSync could not start.'}
function isPersonal(){return !!(activeProfile&&stockProfile&&activeProfile!==stockProfile)}
function updateProfilePill(){$('profilePill').textContent=`PROFILE: ${isPersonal()?'MY VOICE':'STOCK'}`}
function requiredFrames(k){if(!stockProfile)return 0;const entries=stockProfile.mfccs.filter(x=>x.name===k).length;return entries*Math.max(1,stockProfile.mfccDataCount||12)}
function calibrationReady(){return VOWELS.every(k=>calSamples[k].length>=requiredFrames(k)&&requiredFrames(k)>0)}
function updateCalUI(){
  const lines=[];
  for(const k of VOWELS){const need=requiredFrames(k),have=calSamples[k].length,ready=need>0&&have>=need;const b=document.querySelector(`[data-vowel="${k}"]`);b?.classList.toggle('ready',ready);lines.push(`${k}: ${Math.min(have,999)}/${need||'?'}${ready?' ✓':''}`)}
  $('calReadout').textContent=lines.join('   ·   ');
  $('buildProfileBtn').disabled=!calibrationReady();
}
async function diagnostics(){let p='unavailable';try{if(navigator.permissions?.query)p=(await navigator.permissions.query({name:'microphone'})).state}catch{}$('diag').textContent=[`secure context: ${isSecureContext?'yes':'NO'}`,`site mic permission: ${p}`,`getUserMedia: ${navigator.mediaDevices?.getUserMedia?'available':'UNAVAILABLE'}`,`wLipSync calibrated module: ${libError?'FAILED':wl?'loaded':'loading…'}`,`MFCC capture: ${node?.mfcc?'available':wl?'ready when mic starts':'waiting…'}`,`active profile: ${isPersonal()?'saved personal':'stock'}`].join('\n')}
async function ask(){try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop());status('Microphone permission granted. Tap <b>Mic on</b>.');notice('Microphone permission granted.',true)}catch(e){status(errText(e),true)}diagnostics()}
async function makeNode(profile){const n=await wl.createWLipSyncNode(audioCtx,profile);n.smoothness=+c.smoothing.value;return n}
async function startMic(){if(mic){stopMic();return}stopDemo();$('micBtn').disabled=true;$('micBtn').textContent='Starting…';try{await ready;if(!wl||!activeProfile)throw libError||profileError||new Error('wLipSync did not load.');stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});audioCtx=new AudioContext();await audioCtx.resume();node=await makeNode(activeProfile);source=audioCtx.createMediaStreamSource(stream);source.connect(node);mic=true;$('micBtn').textContent='Mic off';$('micBtn').classList.add('active');$('modePill').textContent='WLIPSYNC';status('Mic live. Hold each calibration vowel while sustaining it naturally.');notice('Calibration MFCC capture is live.',true)}catch(e){$('micBtn').textContent='Mic on';status(errText(e),true)}finally{$('micBtn').disabled=false;diagnostics()}}
function stopMic(){mic=false;calHolding=null;document.querySelectorAll('.cal-vowel').forEach(b=>b.classList.remove('recording'));try{source?.disconnect()}catch{};stream?.getTracks().forEach(t=>t.stop());source=null;node=null;stream=null;audioCtx?.close().catch(()=>{});audioCtx=null;$('micBtn').textContent='Mic on';$('micBtn').classList.remove('active');if(!demo)$('modePill').textContent='IDLE';diagnostics()}
async function swapProfile(profile,personal){
  activeProfile=profile;updateProfilePill();
  if(personal)localStorage.setItem(STORAGE_KEY,JSON.stringify(profile));
  if(mic&&audioCtx&&source){try{source.disconnect()}catch{};node=await makeNode(activeProfile);source.connect(node)}
  diagnostics();
}
function chooseEven(samples,count){if(samples.length<count)throw new Error('Not enough calibration frames.');const chosen=[];for(let i=0;i<count;i++){const ix=Math.min(samples.length-1,Math.floor((i+.5)*samples.length/count));chosen.push(samples[ix])}return chosen}
async function buildPersonalProfile(){
  try{
    if(!calibrationReady())throw new Error('Record all five vowels until each shows a tick.');
    const p=deepCopy(stockProfile);
    delete p.means;delete p.stdDevs;
    const occurrence=Object.fromEntries(VOWELS.map(k=>[k,0]));
    const counts=Object.fromEntries(VOWELS.map(k=>[k,p.mfccs.filter(x=>x.name===k).length]));
    const prepared={};
    for(const k of VOWELS){const total=counts[k]*(p.mfccDataCount||12);prepared[k]=chooseEven(calSamples[k],total)}
    for(const entry of p.mfccs){if(!VOWELS.includes(entry.name))continue;const k=entry.name,m=p.mfccDataCount||12,start=occurrence[k]*m;entry.mfccCalibrationDataList=prepared[k].slice(start,start+m).map(array=>({array:[...array]}));delete entry.values;occurrence[k]++}
    await swapProfile(p,true);
    status('Your personalised MFCC profile is active and saved on this device.');notice('Personal voice profile active.',true);
  }catch(e){status(e.message,true)}
}
async function useStock(){await ready;if(!stockProfile)return;localStorage.removeItem(STORAGE_KEY);await swapProfile(stockProfile,false);status('Stock wLipSync profile active. Your calibration recordings are still here until you clear them.');}
function clearCalibration(){for(const k of VOWELS)calSamples[k].length=0;updateCalUI();status('Calibration recordings cleared.');}
function beginCal(e){const k=e.currentTarget.dataset.vowel;if(!mic||!node?.mfcc){status('Turn <b>Mic on</b> before calibrating.',true);return}calHolding=k;calLastTimestamp=-1;e.currentTarget.classList.add('recording');try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}status(`Recording <b>${k}</b> — sustain the vowel naturally while holding the button.`)}
function endCal(e){if(!calHolding)return;const k=calHolding;calHolding=null;e.currentTarget.classList.remove('recording');status(`${k} captured. Re-hold it for another pass, or move to the next vowel.`);updateCalUI()}
function collectCalibration(){if(!calHolding||!node?.mfcc||node.mfccTimestamp===calLastTimestamp)return;calLastTimestamp=node.mfccTimestamp;if((node.volume||0)<.08)return;const a=Array.from(node.mfcc).slice(0,12);if(a.length!==12||a.some(v=>!Number.isFinite(v)))return;const bucket=calSamples[calHolding];if(bucket.length<300)bucket.push(a);updateCalUI()}
function toggleDemo(){if(demo){stopDemo();return}stopMic();demo=true;$('demoBtn').textContent='Stop demo';$('demoBtn').classList.add('active');$('modePill').textContent='DEMO'}
function stopDemo(){demo=false;$('demoBtn').textContent='Demo voice';$('demoBtn').classList.remove('active');if(!mic)$('modePill').textContent='IDLE'}
const shape={A:{o:.92,w:.60,r:0},I:{o:.25,w:.78,r:0},U:{o:.18,w:.30,r:.98},E:{o:.48,w:.72,r:0},O:{o:.62,w:.39,r:.86}};
function demoWeights(t){const ks=VOWELS,x=(t/900)%5,i=Math.floor(x),f=x-i,s=f*f*(3-2*f),w={A:0,I:0,U:0,E:0,O:0};w[ks[i]]=1-s;w[ks[(i+1)%5]]=s;return{w,v:.45+.5*Math.max(0,Math.sin(t*.005))}}
function sample(t){if(mic&&node){node.smoothness=+c.smoothing.value;const w={A:0,I:0,U:0,E:0,O:0};for(const k in w)w[k]=clamp(+node.weights[k]||0,0,1);return{w,v:clamp(node.volume*(+c.sensitivity.value),0,1)}}if(demo)return demoWeights(t);return{w:{A:0,I:0,U:0,E:0,O:0},v:0}}
function mouth(w,v){const p=+c.consonantSnap.value,a={},rs=+c.roundness.value;let sum=0,best=0,dom='REST';for(const k of VOWELS){a[k]=Math.pow(w[k]||0,p);sum+=a[k];if(a[k]>best){best=a[k];dom=k}}let o=0,wd=.5,r=0;if(sum>.0001){wd=0;for(const k of VOWELS){const n=a[k]/sum;o+=shape[k].o*n;wd+=shape[k].w*n;r+=shape[k].r*n}}o*=v*(+c.mouthEx.value);wd=lerp(.5,wd,v);r*=v*rs;state.open=lerp(state.open,o,.32);state.width=lerp(state.width,wd,.32);state.round=lerp(state.round,r,.32);state.volume=lerp(state.volume,v,.25);render({...state,dom:v>.05?dom:'REST',w})}
function render(m){const width=clamp(35+m.width*42-m.round*10,24,94),height=clamp(2.5+m.open*(48+m.round*8),1.8,62),cx=300,cy=392,l=cx-width,r=cx+width,top=cy-height*(.48+.1*m.round),bot=cy+height*(.58+.08*m.open);svg.mouth.setAttribute('d',`M ${l} ${cy} Q ${cx} ${top} ${r} ${cy} Q ${cx} ${bot} ${l} ${cy}Z`);svg.upperLip.setAttribute('d',`M ${l} ${cy} Q ${cx} ${top-1.5} ${r} ${cy}`);svg.lowerLip.setAttribute('d',`M ${l} ${cy} Q ${cx} ${bot+1.5} ${r} ${cy}`);svg.teeth.setAttribute('d',`M ${l+7} ${cy} Q ${cx} ${cy-height*.22} ${r-7} ${cy} Q ${cx} ${cy+Math.max(.5,height*.03)} ${l+7} ${cy}Z`);svg.teeth.style.opacity=m.open>.22&&m.round<.7?clamp((m.width-.45)*1.4+m.open*.18,0,.62):0;svg.chin.style.transform=`translateY(${Math.min(15,m.open*13)}px)`;$('shapePill').textContent=m.dom;$('debugPill').textContent=`A ${m.w.A.toFixed(2)} · I ${m.w.I.toFixed(2)} · U ${m.w.U.toFixed(2)} · E ${m.w.E.toFixed(2)} · O ${m.w.O.toFixed(2)}`;$('meterFill').style.width=`${m.volume*100}%`}
function life(t,dt){if(t>nextBlink&&!blinkPhase)blinkPhase=1;if(blinkPhase===1){blink=Math.min(1,blink+dt/85);if(blink>=1)blinkPhase=2}else if(blinkPhase===2){blink=Math.max(0,blink-dt/120);if(blink<=0){blinkPhase=0;nextBlink=t+(1200+Math.random()*3400)/(+c.blinkRate.value)}}svg.lidL.style.opacity=blink;svg.lidR.style.opacity=blink;if(t>nextEye){const e=+c.eyeMotion.value;eyeTX=(Math.random()-.5)*10*e;eyeTY=(Math.random()-.5)*6*e;nextEye=t+600+Math.random()*1900}eyeX+=(eyeTX-eyeX)*.035;eyeY+=(eyeTY-eyeY)*.035;svg.irisL.setAttribute('transform',`translate(${eyeX} ${eyeY})`);svg.irisR.setAttribute('transform',`translate(${eyeX} ${eyeY})`);const h=+c.headMotion.value;svg.headGroup.style.transform=`translate(${Math.sin(t*.00055+1.4)*3*h}px,${Math.sin(t*.00081)*2*h}px) rotate(${Math.sin(t*.00072)*1.05*h}deg)`}
function tick(t){const dt=Math.min(50,t-last);last=t;collectCalibration();const s=sample(t);mouth(s.w,s.v);life(t,dt);requestAnimationFrame(tick)}
Object.values(c).forEach(e=>e.addEventListener('input',()=>{outputs();if(node&&e===c.smoothing)node.smoothness=+e.value}));
$('permissionBtn').onclick=ask;$('permissionDiagBtn').onclick=ask;$('micBtn').onclick=startMic;$('demoBtn').onclick=toggleDemo;$('diagBtn').onclick=diagnostics;$('buildProfileBtn').onclick=buildPersonalProfile;$('stockProfileBtn').onclick=useStock;$('clearCalBtn').onclick=clearCalibration;
document.querySelectorAll('.cal-vowel').forEach(b=>{b.addEventListener('pointerdown',beginCal);b.addEventListener('pointerup',endCal);b.addEventListener('pointercancel',endCal);b.addEventListener('lostpointercapture',e=>{if(calHolding===b.dataset.vowel)endCal(e)})});
const aside=$('controls'),scrim=$('scrim');function drawer(on){aside.classList.toggle('open',on);scrim.classList.toggle('show',on)}$('drawerBtn').onclick=()=>drawer(!aside.classList.contains('open'));scrim.onclick=()=>drawer(false);
diagnostics();ready.finally(()=>{diagnostics();updateCalUI()});requestAnimationFrame(tick);