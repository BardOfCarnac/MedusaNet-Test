from pathlib import Path
root=Path(__file__).parent

# Narrow consonant gate to visible, useful classes and make it faster but stricter.
gate='''export const CONSONANTS=['PP','FF','TH','SS','CH'];

export const GATE_CONFIG={
  PP:{threshold:.62,margin:.18,persist:2,maxStrength:.90,holdMs:68},
  FF:{threshold:.74,margin:.24,persist:3,maxStrength:.48,holdMs:54},
  TH:{threshold:.66,margin:.20,persist:2,maxStrength:.62,holdMs:64},
  SS:{threshold:.74,margin:.24,persist:3,maxStrength:.42,holdMs:58},
  CH:{threshold:.70,margin:.20,persist:2,maxStrength:.60,holdMs:68}
};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export class ConsonantGate{
  constructor(options={}){this.speechGateDb=options.speechGateDb??-51;this.attack=options.attack??.70;this.release=options.release??.30;this.reset()}
  reset(){this.candidate=null;this.candidateFrames=0;this.active=null;this.holdUntil=0;this.envelope=0;this.last={candidate:null,active:null,strength:0,top:0,second:0,margin:0,qualified:false,reason:'idle'};return this.last}
  update(weights={},vadDb=-100,rawActive='sil',now=performance.now()){
    const ranked=CONSONANTS.map(name=>({name,value:clamp(+weights[`viseme_${name}`]||0)})).sort((a,b)=>b.value-a.value);
    const top=ranked[0]||{name:null,value:0},second=ranked[1]||{name:null,value:0},cfg=GATE_CONFIG[top.name]||null,margin=top.value-second.value;
    let qualified=false,reason='';
    if(!cfg)reason='no consonant';else if(vadDb<this.speechGateDb)reason='below speech gate';else if(rawActive!==top.name)reason='raw winner disagrees';else if(top.value<cfg.threshold)reason='below class threshold';else if(margin<cfg.margin)reason='weak class margin';else{qualified=true;reason='qualified'}
    if(qualified){if(this.candidate===top.name)this.candidateFrames++;else{this.candidate=top.name;this.candidateFrames=1}if(this.candidateFrames>=cfg.persist){this.active=top.name;this.holdUntil=now+cfg.holdMs}}else{this.candidate=null;this.candidateFrames=0}
    const held=this.active&&now<this.holdUntil;if(this.active&&!held&&(!qualified||top.name!==this.active))this.active=null;
    let target=0;if(this.active){const acfg=GATE_CONFIG[this.active],aw=clamp(+weights[`viseme_${this.active}`]||0),other=ranked.find(x=>x.name!==this.active)?.value||0,am=aw-other,ws=clamp((aw-acfg.threshold)/Math.max(.08,1-acfg.threshold)),ms=clamp((am-acfg.margin)/Math.max(.08,.45-acfg.margin)),e=Math.max(.28,Math.sqrt(Math.max(0,ws*ms)));target=acfg.maxStrength*e;if(!qualified&&held)target*=.65}
    this.envelope+=(target-this.envelope)*(target>this.envelope?this.attack:this.release);if(this.envelope<.012&&!this.active)this.envelope=0;
    return this.last={candidate:top.name,active:this.active,strength:clamp(this.envelope),top:top.value,second:second.value,margin,qualified,reason,candidateFrames:this.candidateFrames,rawActive,vadDb}
  }
}
'''
(root/'hybrid-gate-v3.js').write_text(gate)

src=(root/'compare-v7.js').read_text()
src=src.replace("from './hybrid-gate-v2.js';","from './hybrid-gate-v3.js';")
src=src.replace("wlNode.smoothness=.055;","wlNode.smoothness=.020;")
src=src.replace("const personalConsonants=Object.fromEntries(Object.entries(personal.prototypes).filter(([,p])=>Number.isInteger(+p.viseme)&&+p.viseme>=5&&+p.viseme<=13));",
"const personalConsonants=Object.fromEntries(Object.entries(personal.prototypes).filter(([,p])=>CONSONANTS.includes(VISEMES[+p.viseme])));")
old="const MORPH_EASE={jawOpen:.30,mouthFunnel:.18,mouthPucker:.16,jawForward:.18,mouthStretch_L:.18,mouthStretch_R:.18,mouthRollLower:.24,mouthRollUpper:.24,mouthPress_L:.24,mouthPress_R:.24,mouthDimple_L:.22,mouthDimple_R:.22,mouthUpperUp_L:.22,mouthUpperUp_R:.22,mouthLowerDown_L:.22,mouthLowerDown_R:.22,mouthShrugUpper:.22};"
new="const MORPH_EASE={jawOpen:.46,mouthFunnel:.30,mouthPucker:.28,jawForward:.30,mouthStretch_L:.32,mouthStretch_R:.32,mouthRollLower:.38,mouthRollUpper:.38,mouthPress_L:.40,mouthPress_R:.40,mouthDimple_L:.36,mouthDimple_R:.36,mouthUpperUp_L:.36,mouthUpperUp_R:.36,mouthLowerDown_L:.36,mouthLowerDown_R:.36,mouthShrugUpper:.36};"
if old not in src: raise SystemExit('MORPH_EASE signature not found')
src=src.replace(old,new)
src=src.replace("'HYBRID V7'","'HYBRID V8'")
(root/'compare-v8.js').write_text(src)

cap=(root/'capture-v5.js').read_text().replace("from './hybrid-gate-v2.js';","from './hybrid-gate-v3.js';")
cap=cap.replace('voice-face-lipsync-diagnostic-v5-hybrid','voice-face-lipsync-diagnostic-v6-hybrid')
cap=cap.replace('lip-sync-diagnostic-v5-hybrid-','lip-sync-diagnostic-v6-hybrid-')
cap=cap.replace('V5 HYBRID','V6 HYBRID').replace('V5 hybrid','V6 hybrid').replace('V5 —','V6 —').replace('V5 captured','V6 captured').replace('V5 recording','V6 recording')
(root/'capture-v6.js').write_text(cap)

idx=(root/'index.html').read_text()
idx=idx.replace('HYBRID V7','HYBRID V8')
idx=idx.replace('DIAGNOSTIC RECORDING V5 · HYBRID','DIAGNOSTIC RECORDING V6 · HYBRID')
idx=idx.replace('V5 records the wLipSync vowel base','V6 records the wLipSync vowel base')
idx=idx.replace('No V5 hybrid diagnostic recording yet.','No V6 hybrid diagnostic recording yet.')
idx=idx.replace('compare-v7.js','compare-v8.js').replace('capture-v5.js','capture-v6.js')
idx=idx.replace('../voice-face-puppet-headaudio-trained/','../voice-face-puppet-headaudio-consonants/')
idx=idx.replace('HeadAudio consonant trainer','V8 consonant trainer')
(root/'index.html').write_text(idx)

# trigger build-hybrid-v8 workflow
