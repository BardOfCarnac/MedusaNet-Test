from pathlib import Path

root=Path('voice-face-puppet-3d-compare')
p=root/'compare-v7.js'
s=p.read_text()

needle="import { ConsonantGate, CONSONANTS } from './hybrid-gate-v2.js';"
if "diagnostic-replay-v7.js" not in s:
    s=s.replace(needle, needle+"\nimport { REPLAY_FRAMES, REPLAY_MORPH_KEYS, REPLAY_DURATION } from './diagnostic-replay-v7.js';")

anchor="let active='hybrid',morph=blankMorphs();"
replay_code="""let active='hybrid',morph=blankMorphs();
let diagnosticReplay={active:false,start:0,index:0,speed:.55};
function stopDiagnosticReplay(){diagnosticReplay.active=false;diagnosticReplay.index=0;const b=$('replayBtn');if(b){b.textContent='REPLAY DIAGNOSTIC · 0.55×';b.classList.remove('selected')}if(faceReady)setStatus(mic?'HYBRID LIP SYNC LIVE':'HYBRID HEAD READY / WAITING FOR MIC','ready')}
function startDiagnosticReplay(){stopMic(false);diagnosticReplay={active:true,start:performance.now(),index:0,speed:.55};const b=$('replayBtn');if(b){b.textContent='STOP REPLAY';b.classList.add('selected')}setStatus('REPLAYING RECORDED DIAGNOSTIC · 0.55×','ready')}
function diagnosticReplayTarget(now){
  const elapsed=(now-diagnosticReplay.start)*diagnosticReplay.speed;
  if(elapsed>=REPLAY_DURATION){stopDiagnosticReplay();return {morphs:blankMorphs(),shape:'rest',level:0,overlay:null}}
  while(diagnosticReplay.index<REPLAY_FRAMES.length-1&&REPLAY_FRAMES[diagnosticReplay.index+1].t<=elapsed)diagnosticReplay.index++;
  const f=REPLAY_FRAMES[diagnosticReplay.index],morphs=blankMorphs();
  for(let i=0;i<REPLAY_MORPH_KEYS.length;i++)morphs[REPLAY_MORPH_KEYS[i]]=f.m[i]||0;
  return {morphs,shape:f.shape||'rest',level:f.level||0,overlay:f.c?{active:f.c,strength:f.s||0}:null};
}
window.VFPReplay={start:startDiagnosticReplay,stop:stopDiagnosticReplay,isActive:()=>diagnosticReplay.active};"""
if "let diagnosticReplay=" not in s:
    if anchor not in s: raise SystemExit('replay anchor missing')
    s=s.replace(anchor,replay_code)

old="function selectModel(which){active=which;"
new="function selectModel(which){if(diagnosticReplay.active)stopDiagnosticReplay();active=which;"
if old in s:s=s.replace(old,new,1)

oldanim="applyMorphState(active==='wl'?wLipState():hybridState(now));"
newanim="applyMorphState(diagnosticReplay.active?diagnosticReplayTarget(now):(active==='wl'?wLipState():hybridState(now)));"
if oldanim not in s: raise SystemExit('animate call missing')
s=s.replace(oldanim,newanim,1)

hook="$('wlBtn').onclick=()=>selectModel('wl');$('haBtn').onclick=()=>selectModel('hybrid');"
if "$('replayBtn').onclick" not in s:
    s=s.replace(hook,hook+"if($('replayBtn'))$('replayBtn').onclick=()=>diagnosticReplay.active?stopDiagnosticReplay():startDiagnosticReplay();")

p.write_text(s)

idxp=root/'index.html';idx=idxp.read_text()
if 'id="replayBtn"' not in idx:
    marker='<div class="buttonRow"><button id="recordBtn">RECORD 12s</button><button id="downloadCaptureBtn" disabled>DOWNLOAD BUNDLE</button></div>'
    insert='<button id="replayBtn" class="wide">REPLAY DIAGNOSTIC · 0.55×</button>\n      <p class="small">Replays the uploaded diagnostic take through the corrected V7 FaceKit mapping at 55% speed, with the tightened consonant gate baked into the replay.</p>\n      '+marker
    if marker not in idx: raise SystemExit('index marker missing')
    idx=idx.replace(marker,insert,1)
idxp.write_text(idx)
print('Added V7 slow diagnostic replay.')
