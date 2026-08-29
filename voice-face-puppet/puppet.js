(() => {
  const $ = id => document.getElementById(id);
  const controls = {
    sensitivity: $('sensitivity'), mouthEx: $('mouthEx'), smoothing: $('smoothing'), roundness: $('roundness'), consonantSnap: $('consonantSnap'),
    blinkRate: $('blinkRate'), headMotion: $('headMotion'), eyeMotion: $('eyeMotion'), headWidth: $('headWidth'),
    headLength: $('headLength'), eyeSpacing: $('eyeSpacing'), eyeSize: $('eyeSize'), mouthWidth: $('mouthWidth'), browHeight: $('browHeight')
  };
  const defaults = Object.fromEntries(Object.entries(controls).map(([k, el]) => [k, +el.value]));
  const outputs = Object.fromEntries(Object.keys(controls).map(k => [k, $(k+'Out')]));
  const fmt = (k,v) => k === 'browHeight' ? `${Math.round(v)}px` : Number(v).toFixed(2).replace(/\.00$/,'');
  function syncOutputs(){ for (const [k,el] of Object.entries(controls)) outputs[k].textContent = fmt(k,+el.value); }
  syncOutputs();

  const svg = {
    headGroup: $('headGroup'), head: $('head'), glow: $('headGlow'), earL:$('earL'), earR:$('earR'),
    irisL:$('irisL'), irisR:$('irisR'), eyeL:$('eyeLineL'), eyeR:$('eyeLineR'), lidL:$('lidL'), lidR:$('lidR'),
    browL:$('browL'), browR:$('browR'), nose:$('nose'), mouth:$('mouth'), mouthGroup:$('mouthGroup'), teeth:$('teeth'), hair:$('hair'), chin:$('chin'), cheekL:$('cheekL'), cheekR:$('cheekR'),
    upperLip:$('upperLip'), lowerLip:$('lowerLip')
  };

  let audioCtx=null, analyser=null, source=null, stream=null;
  let micActive=false, demoActive=false;
  let blink=0, blinkPhase=0, nextBlink=performance.now()+1800;
  let eyeTargetX=0, eyeTargetY=0, eyeX=0, eyeY=0, nextEyeShift=0;
  let last=performance.now();

  const FFT_SIZE = 4096;
  const floatTimeData = new Float32Array(FFT_SIZE);
  const frequencyData = new Uint8Array(FFT_SIZE / 2);
  const analysisState = { prevLevel:0,jaw:0,spread:0,round:0,press:0,voiced:0,hiss:0,plosive:0,smoothLevel:0,debugText:'voiced 0.00' };

  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function smoothValue(current, target, amount){ return current + (target-current) * amount; }
  function bandEnergy(freqs, sampleRate, fromHz, toHz){
    const nyquist=sampleRate/2,len=freqs.length,start=clamp(Math.floor(fromHz/nyquist*len),0,len-1),end=clamp(Math.ceil(toHz/nyquist*len),start+1,len);let sum=0;
    for(let i=start;i<end;i++) sum+=freqs[i]/255; return sum/Math.max(1,end-start);
  }
  function bandCentroid(freqs, sampleRate, fromHz, toHz){
    const nyquist=sampleRate/2,len=freqs.length,start=clamp(Math.floor(fromHz/nyquist*len),0,len-1),end=clamp(Math.ceil(toHz/nyquist*len),start+1,len);let weight=0,total=0;
    for(let i=start;i<end;i++){const mag=freqs[i]/255,hz=(i/len)*nyquist;weight+=mag*hz;total+=mag;} return total>.0001?weight/total:(fromHz+toHz)/2;
  }
  function zeroCrossingRate(data){let crossings=0,prev=data[0]>=0;for(let i=1;i<data.length;i++){const cur=data[i]>=0;if(cur!==prev){crossings++;prev=cur;}}return crossings/data.length;}
  function voicedConfidence(data,sampleRate){
    const minLag=Math.floor(sampleRate/350),maxLag=Math.floor(sampleRate/80);let best=0,bestLag=minLag,energy=0;for(let i=0;i<data.length;i++)energy+=data[i]*data[i];if(energy<1e-5)return{confidence:0,pitch:0};
    for(let lag=minLag;lag<=maxLag;lag+=2){let sum=0,a=0,b=0,limit=data.length-lag;for(let i=0;i<limit;i+=2){const x=data[i],y=data[i+lag];sum+=x*y;a+=x*x;b+=y*y;}const corr=sum/Math.sqrt(a*b+1e-9);if(corr>best){best=corr;bestLag=lag;}}
    return{confidence:clamp((best-.28)/.5,0,1),pitch:sampleRate/bestLag};
  }

  function showNotice(text,ok=false,timeout=0){const n=$('notice');n.textContent=text;n.hidden=false;n.classList.toggle('ok',ok);if(timeout)setTimeout(()=>{if(n.textContent===text)n.hidden=true;},timeout);}
  function setStatus(text,warn=false){$('status').innerHTML=text;$('status').classList.toggle('warn',warn);if(warn)showNotice($('status').textContent,false);}
  async function microphoneDiagnostics(){
    const framed=window.top!==window.self;let policy='unknown',permission='unavailable';
    try{if(document.permissionsPolicy?.allowsFeature)policy=document.permissionsPolicy.allowsFeature('microphone')?'allowed':'blocked';else if(document.featurePolicy?.allowsFeature)policy=document.featurePolicy.allowsFeature('microphone')?'allowed':'blocked';}catch(_){ }
    try{if(navigator.permissions?.query)permission=(await navigator.permissions.query({name:'microphone'})).state;}catch(_){ }
    $('diag').textContent=[`secure context: ${window.isSecureContext?'yes':'NO'}`,`embedded frame: ${framed?'YES':'no'}`,`frame mic policy: ${policy}`,`site mic permission: ${permission}`,`getUserMedia: ${navigator.mediaDevices?.getUserMedia?'available':'UNAVAILABLE'}`,`origin: ${location.origin||'(opaque)'}`].join('\n');
    $('standaloneBtn')?.classList.toggle('show',framed||policy==='blocked');
  }
  function openStandalone(){const w=window.open(location.href,'_blank','noopener,noreferrer');if(!w)showNotice('The browser blocked the new tab.',false);}
  function friendlyMicError(err){switch(err?.name){case'NotAllowedError':case'PermissionDeniedError':return'Microphone permission was denied for this site.';case'NotFoundError':return'No microphone input was found.';case'NotReadableError':return'The microphone exists but could not be read.';case'SecurityError':return'The browser blocked microphone access for security reasons.';default:return`Microphone could not start${err?.message?': '+err.message:'.'}`;}}
  async function askForMicPermission(){stopDemo();try{const s=await navigator.mediaDevices.getUserMedia({audio:true,video:false});s.getTracks().forEach(t=>t.stop());setStatus('Microphone permission granted. Tap <b>Mic on</b> to start the puppet.');showNotice('Chrome allowed microphone access. Now tap Mic on.',true,2200);}catch(err){setStatus(friendlyMicError(err),true);}microphoneDiagnostics();}
  async function toggleMic(){
    if(micActive){stopMic();return;}stopDemo();
    try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});audioCtx=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')await audioCtx.resume();analyser=audioCtx.createAnalyser();analyser.fftSize=FFT_SIZE;analyser.smoothingTimeConstant=.12;source=audioCtx.createMediaStreamSource(stream);source.connect(analyser);micActive=true;$('micBtn').textContent='Mic off';$('micBtn').classList.add('active');$('modePill').textContent='MIC';setStatus('Microphone active. Smarter vowel and consonant tracking is running.');}catch(err){setStatus(friendlyMicError(err),true);}
  }
  function stopMic(){micActive=false;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;source=null;analyser=null;if(audioCtx)audioCtx.close().catch(()=>{});audioCtx=null;$('micBtn').textContent='Mic on';$('micBtn').classList.remove('active');if(!demoActive)$('modePill').textContent='IDLE';}
  function toggleDemo(){if(demoActive)stopDemo();else{stopMic();demoActive=true;$('demoBtn').classList.add('active');$('demoBtn').textContent='Stop demo';$('modePill').textContent='DEMO';}}
  function stopDemo(){demoActive=false;$('demoBtn').classList.remove('active');$('demoBtn').textContent='Demo voice';if(!micActive)$('modePill').textContent='IDLE';}

  function analyseMic(){
    if(!analyser||!audioCtx)return null;analyser.getFloatTimeDomainData(floatTimeData);analyser.getByteFrequencyData(frequencyData);let sum=0;for(let i=0;i<floatTimeData.length;i++)sum+=floatTimeData[i]*floatTimeData[i];
    const rms=Math.sqrt(sum/floatTimeData.length),zcr=zeroCrossingRate(floatTimeData),sampleRate=audioCtx.sampleRate,voiced=voicedConfidence(floatTimeData,sampleRate),low=bandEnergy(frequencyData,sampleRate,80,400),mid=bandEnergy(frequencyData,sampleRate,900,2500),high=bandEnergy(frequencyData,sampleRate,2500,7000),f1=bandCentroid(frequencyData,sampleRate,250,900),f2=bandCentroid(frequencyData,sampleRate,700,2600),total=low+mid+high+1e-6,hiss=clamp((high/total)*2.6,0,1),brightness=clamp((mid+high*1.4)/(total*1.25),0,1),transient=clamp((rms-analysisState.prevLevel)*36,0,1);analysisState.prevLevel=rms;
    return{rms,zcr,low,mid,high,f1,f2,voiced:voiced.confidence,hiss,brightness,transient};
  }
  function analyseDemo(t){const syll=Math.max(0,Math.sin(t*.008))*.72+Math.max(0,Math.sin(t*.017+1.3))*.32,gate=(Math.sin(t*.0015)+Math.sin(t*.00047+2.2)>-.4)?1:.05,open=syll*gate,cycle=(Math.sin(t*.0024)+1)/2,alt=(Math.sin(t*.0043+1.7)+1)/2,hiss=clamp(Math.max(0,Math.sin(t*.023))*Math.max(0,Math.sin(t*.0012+1.2))*.9,0,1);return{rms:.01+open*.085,zcr:.08+hiss*.11,low:.18+(1-cycle)*.25,mid:.14+alt*.25,high:.05+hiss*.35,f1:360+open*430,f2:900+alt*1300,voiced:clamp(open*1.18,0,1),hiss,brightness:clamp(.25+alt*.35+hiss*.25,0,1),transient:clamp(Math.max(0,Math.sin(t*.041+2.3))*1.3,0,1)};}
  function deriveArticulation(a){
    const sens=+controls.sensitivity.value,ex=+controls.mouthEx.value,roundBias=+controls.roundness.value,snap=+controls.consonantSnap.value,responsiveness=1-(+controls.smoothing.value),level=clamp(a.rms*22*sens-.028,0,1.25),voiced=clamp(a.voiced,0,1),fricative=clamp(a.hiss*.95+a.zcr*2.2-voiced*.55,0,1),plosive=clamp(a.transient*1.15*snap*(1-voiced*.4),0,1),f1n=clamp((a.f1-250)/650,0,1),f2n=clamp((a.f2-700)/1900,0,1),vowelLike=clamp(level*(.45+voiced*.9)*(1-fricative*.55),0,1.2);
    const jawTarget=clamp((vowelLike*(.42+f1n*.85)+fricative*.14)*ex-plosive*.82,0,1.25),roundTarget=clamp((1-f2n)*voiced*(.45+level*.6)*roundBias+clamp((a.low-a.mid*.2)*.8,0,.35)-fricative*.4,0,1),spreadTarget=clamp(f2n*voiced*(.28+level*.8)+fricative*.2+a.brightness*.12-roundTarget*.35,0,1),pressTarget=clamp(plosive*.95+Math.max(0,.18-level)*1.6*voiced*.45,0,1),attack=clamp(.18+responsiveness*.55,.15,.82),release=clamp(.09+responsiveness*.22,.08,.38);
    analysisState.jaw=smoothValue(analysisState.jaw,jawTarget,jawTarget>analysisState.jaw?attack:release);analysisState.spread=smoothValue(analysisState.spread,spreadTarget,spreadTarget>analysisState.spread?attack:release);analysisState.round=smoothValue(analysisState.round,roundTarget,roundTarget>analysisState.round?attack:release);analysisState.press=smoothValue(analysisState.press,pressTarget,pressTarget>analysisState.press?attack*1.1:release*.8);analysisState.voiced=smoothValue(analysisState.voiced,voiced,.22);analysisState.hiss=smoothValue(analysisState.hiss,fricative,.22);analysisState.smoothLevel=smoothValue(analysisState.smoothLevel,a.rms,.18);
    let shape='REST';if(analysisState.press>.45&&analysisState.jaw<.18)shape='M / B / P';else if(analysisState.hiss>.52&&analysisState.jaw<.38)shape=analysisState.spread>.46?'S / SH':'F / TH';else if(analysisState.round>.42)shape=analysisState.jaw>.52?'OH':'OO';else if(analysisState.spread>.44)shape='E / I';else if(analysisState.jaw>.78)shape='AH';else if(analysisState.jaw>.22)shape='SPEECH';analysisState.debugText=`voiced ${analysisState.voiced.toFixed(2)} · hiss ${analysisState.hiss.toFixed(2)}`;return{open:analysisState.jaw,spread:analysisState.spread,round:analysisState.round,press:analysisState.press,shape};
  }
  function renderMouth(m){const baseWidth=52*+controls.mouthWidth.value,width=clamp(baseWidth+m.spread*20-m.round*17-m.press*12,22,92),height=clamp(4+m.open*(42+m.round*10-m.spread*5)-m.press*18,1.8,58),upperCurve=clamp(height*(.55-m.press*.35+m.round*.1),1.5,22),lowerCurve=clamp(height*(.65+m.open*.18),2,28),lipLift=m.press*2.5,cx=300,cy=392,l=cx-width,r=cx+width,top=cy-upperCurve+lipLift,bot=cy+lowerCurve-lipLift;svg.mouth.setAttribute('d',`M ${l} ${cy} Q ${cx} ${top} ${r} ${cy} Q ${cx} ${bot} ${l} ${cy}Z`);svg.upperLip.setAttribute('d',`M ${l} ${cy} Q ${cx} ${top-1.8} ${r} ${cy}`);svg.lowerLip.setAttribute('d',`M ${l} ${cy} Q ${cx} ${bot+1.8} ${r} ${cy}`);svg.teeth.setAttribute('d',`M ${l+8} ${cy} Q ${cx} ${cy-clamp(height*.28,.5,12)} ${r-8} ${cy} Q ${cx} ${cy+clamp(height*.06,.3,4.5)} ${l+8} ${cy}Z`);svg.teeth.style.opacity=m.open>.33&&m.press<.25?clamp(m.spread*.62+m.open*.18,0,.78):0;svg.chin.style.transform=`translateY(${Math.min(16,m.open*14-m.press*6)}px)`;$('shapePill').textContent=m.shape;$('debugPill').textContent=analysisState.debugText;}
  function updateFaceGeometry(){const hw=+controls.headWidth.value,hl=+controls.headLength.value;svg.head.setAttribute('transform',`translate(${300-300*hw} ${306-306*hl}) scale(${hw} ${hl})`);svg.glow.setAttribute('transform',`translate(${300-300*hw} ${306-306*hl}) scale(${hw} ${hl})`);svg.hair.setAttribute('transform',`translate(${300-300*hw} 0) scale(${hw} 1)`);const spacing=+controls.eyeSpacing.value,size=+controls.eyeSize.value,off=(spacing-1)*48;svg.eyeL.setAttribute('transform',`translate(${-off} 0) translate(${234-234*size} ${266-266*size}) scale(${size})`);svg.eyeR.setAttribute('transform',`translate(${off} 0) translate(${366-366*size} ${266-266*size}) scale(${size})`);svg.lidL.setAttribute('transform',`translate(${-off} 0) translate(${234-234*size} ${266-266*size}) scale(${size})`);svg.lidR.setAttribute('transform',`translate(${off} 0) translate(${366-366*size} ${266-266*size}) scale(${size})`);const bh=+controls.browHeight.value;svg.browL.setAttribute('transform',`translate(${-off} ${bh})`);svg.browR.setAttribute('transform',`translate(${off} ${bh})`);}
  function tick(now){const dt=Math.min(50,now-last);last=now;const analysis=micActive?analyseMic():demoActive?analyseDemo(now):{rms:0,zcr:0,low:0,mid:0,high:0,f1:450,f2:1200,voiced:0,hiss:0,brightness:0,transient:0};if(now>nextBlink&&blinkPhase===0)blinkPhase=1;if(blinkPhase===1){blink=Math.min(1,blink+dt/85);if(blink>=1)blinkPhase=2;}else if(blinkPhase===2){blink=Math.max(0,blink-dt/120);if(blink<=0){blinkPhase=0;nextBlink=now+(1200+Math.random()*3400)/(+controls.blinkRate.value);}}svg.lidL.style.opacity=blink;svg.lidR.style.opacity=blink;if(now>nextEyeShift){const e=+controls.eyeMotion.value;eyeTargetX=(Math.random()-.5)*10*e;eyeTargetY=(Math.random()-.5)*6*e;nextEyeShift=now+600+Math.random()*1900;}eyeX+=(eyeTargetX-eyeX)*.035;eyeY+=(eyeTargetY-eyeY)*.035;const spacing=+controls.eyeSpacing.value,size=+controls.eyeSize.value,off=(spacing-1)*48;svg.irisL.setAttribute('transform',`translate(${-off+eyeX} ${eyeY}) translate(${234-234*size} ${266-266*size}) scale(${size})`);svg.irisR.setAttribute('transform',`translate(${off+eyeX} ${eyeY}) translate(${366-366*size} ${266-266*size}) scale(${size})`);const mouth=deriveArticulation(analysis);renderMouth(mouth);const hm=+controls.headMotion.value,talkNudge=clamp(mouth.open,0,1)*hm,rot=Math.sin(now*.00072)*1.1*hm+Math.sin(now*.0033)*.14*talkNudge-mouth.press*.8,tx=Math.sin(now*.00055+1.4)*3.2*hm,ty=Math.sin(now*.00081)*2.2*hm-talkNudge*1.4;svg.headGroup.style.transform=`translate(${tx}px,${ty}px) rotate(${rot}deg)`;$('meterFill').style.width=`${Math.min(100,analysisState.smoothLevel*640*+controls.sensitivity.value)}%`;requestAnimationFrame(tick);}

  Object.values(controls).forEach(el=>el.addEventListener('input',()=>{syncOutputs();updateFaceGeometry();}));
  $('permissionBtn').addEventListener('click',askForMicPermission);$('permissionDiagBtn').addEventListener('click',askForMicPermission);$('micBtn').addEventListener('click',toggleMic);$('demoBtn').addEventListener('click',toggleDemo);$('standaloneBtn').addEventListener('click',openStandalone);$('standaloneDiagBtn').addEventListener('click',openStandalone);$('diagBtn').addEventListener('click',microphoneDiagnostics);
  const presets={neutral:{headWidth:1,headLength:1,eyeSpacing:1,eyeSize:1,mouthWidth:1,browHeight:0},angular:{headWidth:.9,headLength:1.1,eyeSpacing:1.08,eyeSize:.9,mouthWidth:.92,browHeight:-8},soft:{headWidth:1.12,headLength:.94,eyeSpacing:.94,eyeSize:1.13,mouthWidth:1.12,browHeight:6}};
  document.querySelectorAll('[data-preset]').forEach(btn=>btn.addEventListener('click',()=>{const p=presets[btn.dataset.preset];for(const[k,v]of Object.entries(p))controls[k].value=v;syncOutputs();updateFaceGeometry();}));
  $('randomBtn').addEventListener('click',()=>{const rnd=(a,b)=>a+Math.random()*(b-a),vals={headWidth:rnd(.78,1.22),headLength:rnd(.85,1.17),eyeSpacing:rnd(.78,1.28),eyeSize:rnd(.8,1.3),mouthWidth:rnd(.76,1.34),browHeight:rnd(-18,18)};for(const[k,v]of Object.entries(vals))controls[k].value=v;syncOutputs();updateFaceGeometry();});
  $('resetBtn').addEventListener('click',()=>{for(const[k,v]of Object.entries(defaults))controls[k].value=v;syncOutputs();updateFaceGeometry();});
  const aside=$('controls'),scrim=$('scrim');function drawer(open){aside.classList.toggle('open',open);scrim.classList.toggle('show',open);}$('drawerBtn').addEventListener('click',()=>drawer(!aside.classList.contains('open')));scrim.addEventListener('click',()=>drawer(false));
  updateFaceGeometry();microphoneDiagnostics();requestAnimationFrame(tick);
})();