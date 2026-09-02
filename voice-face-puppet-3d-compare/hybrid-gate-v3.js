export const CONSONANTS=['PP','FF','TH','SS','CH'];

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
