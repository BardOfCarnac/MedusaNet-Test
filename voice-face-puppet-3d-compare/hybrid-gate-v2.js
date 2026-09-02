export const CONSONANTS=['PP','FF','TH','DD','SS','kk','nn','RR','CH'];

export const GATE_CONFIG={
  PP:{threshold:.62,margin:.18,persist:3,maxStrength:.96,holdMs:82},
  FF:{threshold:.68,margin:.20,persist:3,maxStrength:.58,holdMs:62},
  TH:{threshold:.60,margin:.16,persist:2,maxStrength:.68,holdMs:72},
  DD:{threshold:.68,margin:.22,persist:3,maxStrength:.44,holdMs:66},
  SS:{threshold:.69,margin:.21,persist:3,maxStrength:.50,holdMs:66},
  kk:{threshold:.70,margin:.22,persist:3,maxStrength:.36,holdMs:64},
  nn:{threshold:.82,margin:.28,persist:4,maxStrength:.30,holdMs:62},
  RR:{threshold:.72,margin:.22,persist:3,maxStrength:.52,holdMs:76},
  CH:{threshold:.65,margin:.18,persist:2,maxStrength:.68,holdMs:82}
};

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

export class ConsonantGate{
  constructor(options={}){
    this.speechGateDb=options.speechGateDb??-52;
    this.attack=options.attack??.58;
    this.release=options.release??.22;
    this.reset();
  }
  reset(){
    this.candidate=null;this.candidateFrames=0;this.active=null;this.holdUntil=0;this.envelope=0;
    this.last={candidate:null,active:null,strength:0,top:0,second:0,margin:0,qualified:false,reason:'idle'};
    return this.last;
  }
  update(weights={},vadDb=-100,rawActive='sil',now=performance.now()){
    const ranked=CONSONANTS.map(name=>({name,value:clamp(+weights[`viseme_${name}`]||0)})).sort((a,b)=>b.value-a.value);
    const top=ranked[0]||{name:null,value:0},second=ranked[1]||{name:null,value:0};
    const cfg=GATE_CONFIG[top.name]||null,margin=top.value-second.value;
    let qualified=false,reason='';
    if(!cfg) reason='no consonant';
    else if(vadDb<this.speechGateDb) reason='below speech gate';
    else if(rawActive!==top.name) reason='raw winner disagrees';
    else if(top.value<cfg.threshold) reason='below class threshold';
    else if(margin<cfg.margin) reason='weak class margin';
    else {qualified=true;reason='qualified'}

    if(qualified){
      if(this.candidate===top.name)this.candidateFrames++;else{this.candidate=top.name;this.candidateFrames=1}
      if(this.candidateFrames>=cfg.persist){this.active=top.name;this.holdUntil=now+cfg.holdMs}
    }else{
      this.candidate=null;this.candidateFrames=0;
    }

    const stillHeld=this.active&&now<this.holdUntil;
    if(this.active&&!stillHeld&&(!qualified||top.name!==this.active))this.active=null;

    let target=0;
    if(this.active){
      const acfg=GATE_CONFIG[this.active];
      const aw=clamp(+weights[`viseme_${this.active}`]||0);
      const others=ranked.filter(x=>x.name!==this.active);
      const amargin=aw-(others[0]?.value||0);
      const thresholdSpan=Math.max(.08,1-acfg.threshold);
      const weightScore=clamp((aw-acfg.threshold)/thresholdSpan);
      const marginScore=clamp((amargin-acfg.margin)/Math.max(.08,.42-acfg.margin));
      const evidence=Math.max(.34,Math.sqrt(Math.max(0,weightScore*marginScore)));
      target=acfg.maxStrength*evidence;
      if(!qualified&&stillHeld)target*=.72;
    }
    this.envelope += (target-this.envelope)*(target>this.envelope?this.attack:this.release);
    if(this.envelope<.015&&!this.active)this.envelope=0;

    this.last={candidate:top.name,active:this.active,strength:clamp(this.envelope),top:top.value,second:second.value,margin,qualified,reason,
      candidateFrames:this.candidateFrames,rawActive,vadDb};
    return this.last;
  }
}
