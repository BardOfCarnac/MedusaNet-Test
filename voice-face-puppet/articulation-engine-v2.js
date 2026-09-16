const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const alpha=(dtMs,tauMs)=>1-Math.exp(-Math.max(0.1,dtMs)/Math.max(1,tauMs));

export const SPEECH_MORPH_KEYS=[
  'jawOpen','jawForward','mouthFunnel','mouthPucker','mouthRollLower','mouthRollUpper',
  'mouthUpperUp_L','mouthUpperUp_R','mouthShrugUpper','mouthLowerDown_L','mouthLowerDown_R',
  'mouthDimple_L','mouthDimple_R','mouthPress_L','mouthPress_R','mouthStretch_L','mouthStretch_R'
];
export const JAW_KEYS=new Set(['jawOpen','jawForward']);
export const LIP_KEYS=SPEECH_MORPH_KEYS.filter(k=>!JAW_KEYS.has(k));

export const GOLD_VISEMES={
  sil:{},
  aa:{jawOpen:.60},
  E:{mouthPress_L:.80,mouthPress_R:.80,mouthDimple_L:1,mouthDimple_R:1,jawOpen:.30},
  I:{mouthPress_L:.60,mouthPress_R:.60,mouthDimple_L:.60,mouthDimple_R:.60,jawOpen:.20},
  O:{mouthPucker:1,jawForward:.60,jawOpen:.20},
  U:{mouthFunnel:1},
  PP:{mouthRollLower:.80,mouthRollUpper:.80,mouthUpperUp_L:.30,mouthUpperUp_R:.30},
  FF:{mouthPucker:1,mouthShrugUpper:1,mouthLowerDown_L:.20,mouthLowerDown_R:.20,mouthDimple_L:1,mouthDimple_R:1,mouthRollLower:1},
  DD:{mouthPress_L:.80,mouthPress_R:.80,mouthFunnel:.50,jawOpen:.20},
  SS:{mouthPress_L:.80,mouthPress_R:.80,mouthLowerDown_L:.50,mouthLowerDown_R:.50,jawOpen:.10},
  TH:{mouthRollUpper:.60,jawOpen:.20},
  CH:{mouthPucker:.50,jawOpen:.20},
  RR:{mouthPucker:.50,jawOpen:.20},
  kk:{mouthLowerDown_L:.40,mouthLowerDown_R:.40,mouthDimple_L:.30,mouthDimple_R:.30,mouthFunnel:.30,mouthPucker:.30,jawOpen:.15},
  nn:{mouthLowerDown_L:.40,mouthLowerDown_R:.40,mouthDimple_L:.30,mouthDimple_R:.30,mouthFunnel:.30,mouthPucker:.30,jawOpen:.15}
};

export const ARTICULATION_TRIM={sil:1,PP:1.08,FF:.78,TH:.95,DD:.96,kk:.98,CH:.90,SS:.95,nn:.98,RR:.90,aa:.94,E:.82,I:.90,O:.82,U:.88};
export const VOWEL_MAP={A:'aa',E:'E',I:'I',O:'O',U:'U'};
export const CONSONANT_ORDER=['PP','FF','CH','SS','TH','RR','DD','kk','nn'];

const PROFILE={
  PP:{lead:.070,onset:.18,attack:20,release:82,max:.96,lip:1.00,jaw:.92,lipDamp:.78,jawClose:.86},
  FF:{lead:.050,onset:.24,attack:26,release:96,max:.72,lip:.78,jaw:.60,lipDamp:.18,jawClose:.18},
  CH:{lead:.045,onset:.26,attack:27,release:105,max:.58,lip:.58,jaw:.50,lipDamp:.12,jawClose:.16},
  SS:{lead:.040,onset:.30,attack:30,release:92,max:.48,lip:.46,jaw:.45,lipDamp:.12,jawClose:.24},
  TH:{lead:.040,onset:.26,attack:31,release:98,max:.52,lip:.48,jaw:.48,lipDamp:.08,jawClose:.12},
  RR:{lead:.035,onset:.28,attack:36,release:118,max:.34,lip:.34,jaw:.34,lipDamp:.02,jawClose:.04},
  DD:{lead:.026,onset:.34,attack:38,release:95,max:.27,lip:.22,jaw:.40,lipDamp:.03,jawClose:.08},
  kk:{lead:.026,onset:.35,attack:40,release:102,max:.25,lip:.20,jaw:.38,lipDamp:.02,jawClose:.04},
  nn:{lead:.024,onset:.33,attack:40,release:108,max:.24,lip:.18,jaw:.36,lipDamp:.02,jawClose:.04}
};

const VOWEL_LEAD={A:.035,E:.035,I:.035,O:.060,U:.060};
const makeMorphs=()=>Object.fromEntries(SPEECH_MORPH_KEYS.map(k=>[k,0]));

function predicted(raw,prev,dtSec,leadSec){
  if(dtSec<=0)return clamp(raw);
  const velocity=Math.max(0,(raw-prev)/dtSec);
  return clamp(raw+velocity*leadSec);
}
function dominant(weights){let key='rest',best=0;for(const [k,v] of Object.entries(weights)){if(v>best){best=v;key=k}}return key;}
function recipe(name,key){return GOLD_VISEMES[name]?.[key]||0;}

export class SpeechArticulationEngine{
  constructor({consonants=true,articulation=.70}={}){
    this.useConsonants=consonants;
    this.articulation=articulation;
    this.prevVowels={A:0,E:0,I:0,O:0,U:0};
    this.prevConsonants=Object.fromEntries(CONSONANT_ORDER.map(k=>[k,0]));
    this.consonantEnv=Object.fromEntries(CONSONANT_ORDER.map(k=>[k,0]));
    this.speechEnv=0;
    this.lastMorphs=makeMorphs();
  }
  reset(){
    for(const k of Object.keys(this.prevVowels))this.prevVowels[k]=0;
    for(const k of CONSONANT_ORDER){this.prevConsonants[k]=0;this.consonantEnv[k]=0;}
    this.speechEnv=0;this.lastMorphs=makeMorphs();
  }
  resetConsonants(){for(const k of CONSONANT_ORDER){this.prevConsonants[k]=0;this.consonantEnv[k]=0;}}
  update({vowelWeights={},volume=0,haWeights={},rawActive='sil',gate=null,vadDb=-100,rawOnset=0,dtMs=16}={}){
    const dtSec=Math.max(.001,dtMs/1000),level=clamp((+volume||0)*1.18),onset=clamp(+rawOnset||0);
    const speechTarget=(level>.018||vadDb>-55||onset>.08)?1:0;
    const silenceConfirmed=level<.012&&vadDb<-58&&onset<.035;
    const speechAttack=onset>.08?9:22;
    const speechRelease=silenceConfirmed?82:112;
    this.speechEnv+=(speechTarget-this.speechEnv)*alpha(dtMs,speechTarget>this.speechEnv?speechAttack:speechRelease);
    if(this.speechEnv<.002)this.speechEnv=0;

    const vw={};let vowelSum=0;
    for(const k of ['A','E','I','O','U']){
      const raw=clamp(+vowelWeights[k]||0),p=predicted(raw,this.prevVowels[k],dtSec,VOWEL_LEAD[k]);
      this.prevVowels[k]=raw;vw[k]=Math.pow(p,1.12);vowelSum+=vw[k];
    }
    const normalized={A:0,E:0,I:0,O:0,U:0};
    if(vowelSum>.0001)for(const k of Object.keys(normalized))normalized[k]=vw[k]/vowelSum;

    const morphs=makeMorphs();
    const lipGain=this.articulation*this.speechEnv*clamp(.48+.52*Math.sqrt(level),.22,1);
    const jawGain=this.articulation*this.speechEnv*clamp(.14+.86*Math.pow(level,.68),.10,1);
    for(const [wName,weight] of Object.entries(normalized)){
      if(weight<=0)continue;const vName=VOWEL_MAP[wName],trim=ARTICULATION_TRIM[vName]||1;
      for(const key of LIP_KEYS)morphs[key]+=recipe(vName,key)*trim*weight*lipGain;
      for(const key of JAW_KEYS)morphs[key]+=recipe(vName,key)*trim*weight*jawGain;
    }

    let strongest=null,strongestStrength=0;
    if(this.useConsonants){
      for(const name of CONSONANT_ORDER){
        const p=PROFILE[name],raw=clamp(+haWeights[`viseme_${name}`]||0),lead=predicted(raw,this.prevConsonants[name],dtSec,p.lead);this.prevConsonants[name]=raw;
        const soft=clamp((lead-p.onset)/Math.max(.08,1-p.onset)),gated=gate?.active===name?clamp(gate.strength||0):0,activeBoost=rawActive===name?Math.min(.16,p.max*.22):0;
        const wanted=clamp(Math.max(gated,soft*p.max)+activeBoost,0,p.max)*this.speechEnv;
        const env=this.consonantEnv[name],releaseTau=silenceConfirmed?Math.max(34,p.release*.52):p.release,a=alpha(dtMs,wanted>env?p.attack:releaseTau);this.consonantEnv[name]=env+(wanted-env)*a;
        if(this.consonantEnv[name]>strongestStrength){strongestStrength=this.consonantEnv[name];strongest=name;}
      }
      for(const name of CONSONANT_ORDER){
        const s=this.consonantEnv[name];if(s<.003)continue;const p=PROFILE[name],trim=ARTICULATION_TRIM[name]||1,art=this.articulation*trim;
        if(p.lipDamp){const damp=clamp(s*p.lipDamp);for(const key of ['mouthFunnel','mouthPucker','mouthStretch_L','mouthStretch_R','mouthDimple_L','mouthDimple_R'])morphs[key]*=(1-damp);}
        if(p.jawClose)morphs.jawOpen*=1-clamp(s*p.jawClose);
        for(const key of LIP_KEYS){const rv=recipe(name,key)*art;if(rv>0)morphs[key]=lerp(morphs[key],rv,clamp(s*p.lip));}
        for(const key of JAW_KEYS){const rv=recipe(name,key)*art;morphs[key]=lerp(morphs[key],rv,clamp(s*p.jaw));}
      }
    }else{
      for(const k of CONSONANT_ORDER)this.consonantEnv[k]+=(0-this.consonantEnv[k])*alpha(dtMs,silenceConfirmed?48:85);
    }

    for(const k of SPEECH_MORPH_KEYS)morphs[k]=clamp(morphs[k],0,1.15);
    this.lastMorphs=morphs;
    const vowel=dominant(normalized),shape=level>.025?vowel:'rest',overlay=strongest&&strongestStrength>.015?{active:strongest,strength:strongestStrength,all:{...this.consonantEnv}}:null;
    const detail=overlay?`${shape.toUpperCase()} + ${overlay.active} ${Math.round(overlay.strength*100)}%`:shape.toUpperCase();
    return {morphs,shape,detail,level,rawOnset:onset,speechEnvelope:this.speechEnv,weights:normalized,overlay,articulation:{mode:'continuous-coarticulation-v2',jawSeparate:true,lipSeparate:true,predictiveLead:true,rawOnsetWake:true,fastTrueSilenceRelease:true,allConsonants:this.useConsonants}};
  }
}
