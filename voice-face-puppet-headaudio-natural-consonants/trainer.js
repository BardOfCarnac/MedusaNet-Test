const COMMIT='d3af5f9ff86ab6b2b1913d411a4e1922ec101953';
const BASE=`https://cdn.jsdelivr.net/gh/met4citizen/HeadAudio@${COMMIT}`;
const MODULE_URL=`${BASE}/dist/headaudio.min.mjs`,WORKLET_URL=`${BASE}/dist/headworklet.min.mjs`,MODEL_URL=`${BASE}/dist/model-en-mixed.bin`;
const STORAGE='voice-face-headaudio-personal-v1';
const $=id=>document.getElementById(id),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const names=['aa','E','I','O','U','PP','SS','TH','DD','FF','kk','nn','RR','CH','sil'];
const VIS={PP:5,SS:6,TH:7,DD:8,FF:9,kk:10,nn:11,RR:12,CH:13};
const GROUPS={
  p:{group:200,viseme:VIS.PP,code:'p4',word:'PEA'}, b:{group:201,viseme:VIS.PP,code:'b4',word:'BEE'}, m:{group:202,viseme:VIS.PP,code:'m4',word:'ME'},
  t:{group:203,viseme:VIS.DD,code:'t4',word:'TEA'}, d:{group:204,viseme:VIS.DD,code:'d4',word:'DEE'},
  k:{group:205,viseme:VIS.kk,code:'k4',word:'KEY'}, g:{group:206,viseme:VIS.kk,code:'g4',word:'GO'},
  f:{group:207,viseme:VIS.FF,code:'f4',word:'FAN'}, v:{group:208,viseme:VIS.FF,code:'v4',word:'VAN'},
  s:{group:209,viseme:VIS.SS,code:'s4',word:'SEE'}, z:{group:210,viseme:VIS.SS,code:'z4',word:'ZOO'},
  th:{group:211,viseme:VIS.TH,code:'h4',word:'THIN'}, dh:{group:212,viseme:VIS.TH,code:'q4',word:'THEN'},
  sh:{group:213,viseme:VIS.CH,code:'x4',word:'SHE'}, ch:{group:214,viseme:VIS.CH,code:'c4',word:'CHEW'}, j:{group:215,viseme:VIS.CH,code:'j4',word:'JUNE'},
  n:{group:216,viseme:VIS.nn,code:'n4',word:'NO'}, r:{group:217,viseme:VIS.RR,code:'r4',word:'RAY'}
};
const sessions=[
  {id:'pp',label:'P / B / M',desc:'pea · bee · me',seq:['p','b','m','p','b','m','p','b','m']},
  {id:'td',label:'T / D',desc:'tea · dee',seq:['t','d','t','d','t','d','t','d']},
  {id:'kg',label:'K / G',desc:'key · go',seq:['k','g','k','g','k','g','k','g']},
  {id:'fv',label:'F / V',desc:'fan · van',seq:['f','v','f','v','f','v','f','v']},
  {id:'sz',label:'S / Z',desc:'see · zoo',seq:['s','z','s','z','s','z','s','z']},
  {id:'th',label:'TH',desc:'thin · then',seq:['th','dh','th','dh','th','dh','th','dh']},
  {id:'ch',label:'SH / CH / J',desc:'she · chew · June',seq:['sh','ch','j','sh','ch','j','sh','ch','j']},
  {id:'n',label:'N',desc:'no',seq:['n','n','n','n','n','n']},
  {id:'r',label:'R',desc:'ray',seq:['r','r','r','r','r','r']}
];
let HeadAudio=null,node=null,ctx=null,stream=null,source=null,mic=false,lastDb=-100,active=14,session=null;
let personal=loadPersonal();
const libReady=import(MODULE_URL).then(m=>HeadAudio=m.HeadAudio);
function loadPersonal(){try{return JSON.parse(localStorage.getItem(STORAGE)||'{"prototypes":{},"speakerMean":150}')}catch{return{prototypes:{},speakerMean:150}}}
function save(){localStorage.setItem(STORAGE,JSON.stringify(personal));updateUI()}
function setCue(word,sub='',go=false){$('cueWord').textContent=word;$('cueSub').textContent=sub;$('cue').classList.toggle('go',go)}
function contextKeys(){return Object.keys(personal.prototypes||{}).filter(k=>k.startsWith('ctx:'))}
function updateUI(){const saved=contextKeys();$('saved').textContent=saved.length;$('result').textContent=saved.length?`Saved contextual prototypes: ${saved.map(k=>k.slice(4).toUpperCase()).join(', ')}\nThey share the same personal profile used by the 3D comparison page.`:'No contextual consonant prototypes yet.';for(const s of sessions){const b=document.querySelector(`[data-session="${s.id}"]`);if(!b)continue;const ready=s.seq.every(k=>personal.prototypes?.[`ctx:${k}`]);b.classList.toggle('ready',ready)}}
for(const s of sessions){const b=document.createElement('button');b.className='session';b.dataset.session=s.id;b.innerHTML=`<b>${s.label}</b><span>${s.desc}<br>guided natural-word onset capture</span>`;b.onclick=()=>runSession(s,b);$('sessions').append(b)}updateUI();
function applyPrototype(p){if(!node||!p)return;node.port.postMessage({event:'model',model:[{phoneme:p.code,group:p.group,viseme:p.viseme,mu:new Float32Array(p.mu),sigmaInvLower:new Float32Array(p.sigmaInvLower)}]})}
function applySaved(){if(!node)return;for(const p of Object.values(personal.prototypes||{}))applyPrototype(p)}
async function askMic(){try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop());setCue('READY','Microphone permission granted.',false)}catch(e){setCue('MIC?','Microphone permission denied.',false)}}
async function toggleMic(){if(mic){stopMic();return}$('micBtn').disabled=true;try{await libReady;stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});ctx=new AudioContext();await ctx.resume();await ctx.audioWorklet.addModule(WORKLET_URL);node=new HeadAudio(ctx,{processorOptions:{vadEventsEnabled:true,featureEventsEnabled:true,visemeEventsEnabled:true},parameterData:{vadMode:1,vadGateActiveDb:-40,vadGateInactiveDb:-50,silMode:1,silCalibrationWindowSec:3,silSensitivity:1.2,speakerMeanHz:personal.speakerMean||150}});await node.loadModel(MODEL_URL);node.onvad=o=>{if(Number.isFinite(o.db))lastDb=o.db};node.onviseme=o=>{if(Number.isInteger(o.viseme))active=o.viseme};node.onfeature=o=>{if(session&&o?.vector?.length===12)session.records.push({t:performance.now()-session.t0,db:Number.isFinite(o.le)?10*o.le:lastDb,v:Array.from(o.vector)})};source=ctx.createMediaStreamSource(stream);source.connect(node);applySaved();mic=true;$('micBtn').textContent='Mic off';$('micBtn').classList.add('active');setCue('READY','Calibrate silence once, then choose a consonant family.',false)}catch(e){console.error(e);setCue('ERROR',e?.message||'Could not start microphone.',false);stopMic()}finally{$('micBtn').disabled=false}}
function stopMic(){mic=false;session=null;try{source?.disconnect()}catch{};try{node?.disconnect()}catch{};stream?.getTracks().forEach(t=>t.stop());source=node=stream=null;ctx?.close().catch(()=>{});ctx=null;$('micBtn').textContent='Mic on';$('micBtn').classList.remove('active')}
function calibrate(){if(!node){setCue('MIC ON','Turn the microphone on first.',false);return}$('silenceBtn').disabled=true;setCue('QUIET','Three seconds of room silence…',false);node.oncalibrated=o=>{$('silenceBtn').disabled=false;setCue(o?.error?'RETRY':'READY',o?.error||'Silence calibrated. Choose a consonant family.',false)};node.calibrate()}
function localOnset(records,cue){const lo=cue+25,hi=cue+610,win=records.filter(r=>r.t>=lo&&r.t<=hi);if(win.length<4)return null;const pre=records.filter(r=>r.t>=Math.max(0,cue-180)&&r.t<cue+70).map(r=>r.db);const floor=pre.length?pre.sort((a,b)=>a-b)[Math.floor(pre.length*.45)]:-60;const max=Math.max(...win.map(r=>r.db)),threshold=Math.max(floor+5.5,Math.min(-34,max-9));let idx=win.findIndex(r=>r.db>=threshold);if(idx<0)idx=win.reduce((best,r,i)=>r.db>win[best].db?i:best,0);return win[idx]}
function collectAround(records,onsetT){const sorted=records.filter(r=>r.t>=onsetT-18&&r.t<=onsetT+105);return sorted.slice(0,7)}
async function runSession(s,button){if(!node){setCue('MIC ON','Turn the microphone on first.',false);return}if(session)return;for(const b of document.querySelectorAll('.session'))b.disabled=true;button.classList.add('recording');$('statusMini').textContent='recording';setCue('GET READY',`Say each word once when it flashes. Leave the little gap between words.`,false);await sleep(850);session={spec:s,records:[],cues:[],t0:performance.now()};const oldVad=node.parameters.get('vadMode')?.value??1;const p=node.parameters.get('vadMode');if(p)p.value=0;await sleep(250);
for(let i=0;i<s.seq.length;i++){const key=s.seq[i],g=GROUPS[key],cueT=performance.now()-session.t0;session.cues.push({key,t:cueT});setCue(g.word,`${i+1} / ${s.seq.length} · say it naturally once`,true);await sleep(690)}
setCue('DONE','Analysing the first ~100 ms after each word onset…',false);await sleep(400);const c=session;session=null;if(p)p.value=oldVad;const buckets={};const misses=[];for(const cue of c.cues){const onset=localOnset(c.records,cue.t);if(!onset){misses.push(GROUPS[cue.key].word);continue}const frames=collectAround(c.records,onset.t);if(!buckets[cue.key])buckets[cue.key]=[];buckets[cue.key].push(...frames.map(r=>r.v))}
const made=[];for(const [key,vectors] of Object.entries(buckets)){const g=GROUPS[key];if(vectors.length<14)continue;try{const q=node.training.computePrototype(g.code,g.group,g.viseme,vectors.map(v=>new Float32Array(v)));const proto={name:`ctx:${key}`,code:g.code,group:g.group,viseme:g.viseme,mu:Array.from(q.mu),sigmaInvLower:Array.from(q.sigmaInvLower),samples:vectors.length,speakerMean:personal.speakerMean||150,created:Date.now(),method:'natural-word-onset-v1',word:g.word};personal.prototypes[`ctx:${key}`]=proto;applyPrototype(proto);made.push(`${g.word}:${vectors.length}`)}catch(e){console.error('prototype',key,e)}}save();button.classList.remove('recording');for(const b of document.querySelectorAll('.session'))b.disabled=false;$('statusMini').textContent='ready';setCue(made.length?'SAVED':'RETRY',made.length?`${s.label}: ${made.join(' · ')}${misses.length?` · missed ${misses.join(', ')}`:''}`:'Not enough clean onsets. Try the session again with clearer gaps.',false)}
function tick(t){if(node)node.update(16);$('signal').textContent=`${Number.isFinite(lastDb)?lastDb.toFixed(1):'—'} dB`;$('prediction').textContent=names[active]||'sil';requestAnimationFrame(tick)}
$('permissionBtn').onclick=askMic;$('micBtn').onclick=toggleMic;$('silenceBtn').onclick=calibrate;$('applyBtn').onclick=()=>{applySaved();setCue('APPLIED','Saved personal prototypes are live in this mic session.',false)};requestAnimationFrame(tick);
