// Stabilized HeadAudio classifier for personal + stock Gaussian prototypes.
// HeadAudio upstream ranks prototypes by Mahalanobis distance only. That is
// sensitive to covariance width and to having many prototypes for one class.
// This layer scores full Gaussian log likelihoods, shrinks personal covariance
// estimates, and combines multiple prototypes as equal-weight mixtures per viseme.

export const VISEMES=['aa','E','I','O','U','PP','SS','TH','DD','FF','kk','nn','RR','CH','sil'];
const N=12;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function lowerToMatrix(lower){
  const A=Array.from({length:N},()=>new Float64Array(N));
  let k=0;
  for(let i=0;i<N;i++)for(let j=0;j<=i;j++){
    const v=Number(lower[k++])||0;A[i][j]=v;A[j][i]=v;
  }
  return A;
}
function cloneMatrix(A){return A.map(r=>Float64Array.from(r))}
function invertMatrix(A){
  const n=A.length,M=Array.from({length:n},(_,i)=>{
    const r=new Float64Array(n*2);for(let j=0;j<n;j++)r[j]=A[i][j];r[n+i]=1;return r;
  });
  for(let c=0;c<n;c++){
    let p=c,best=Math.abs(M[c][c]);
    for(let r=c+1;r<n;r++){const q=Math.abs(M[r][c]);if(q>best){best=q;p=r}}
    if(best<1e-12)throw new Error('Singular covariance/precision matrix');
    if(p!==c){const tmp=M[p];M[p]=M[c];M[c]=tmp}
    const d=M[c][c];for(let j=0;j<n*2;j++)M[c][j]/=d;
    for(let r=0;r<n;r++)if(r!==c){const f=M[r][c];if(Math.abs(f)>1e-18)for(let j=0;j<n*2;j++)M[r][j]-=f*M[c][j]}
  }
  return M.map(r=>Float64Array.from(r.slice(n)));
}
function logDetSPD(A){
  const n=A.length,L=Array.from({length:n},()=>new Float64Array(n));let sumLog=0;
  for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
    let s=A[i][j];for(let k=0;k<j;k++)s-=L[i][k]*L[j][k];
    if(i===j){if(!(s>1e-14))return null;L[i][j]=Math.sqrt(s);sumLog+=Math.log(L[i][j])}
    else L[i][j]=s/L[j][j];
  }
  return 2*sumLog;
}
function stabilizePrecision(lower,shrink=.28,jitter=.006){
  let P=lowerToMatrix(lower);
  let S;
  try{S=invertMatrix(P)}catch{return {P,logdet:logDetSPD(P)??0}}
  let trace=0;for(let i=0;i<N;i++)trace+=Math.max(1e-9,S[i][i]);
  const avg=trace/N;
  for(let i=0;i<N;i++)for(let j=0;j<N;j++){
    if(i!==j)S[i][j]*=(1-shrink);
  }
  for(let i=0;i<N;i++)S[i][i]+=avg*jitter;
  try{P=invertMatrix(S)}catch{}
  return {P,logdet:logDetSPD(P)??0};
}
function directPrecision(lower){const P=lowerToMatrix(lower);return {P,logdet:logDetSPD(P)??0}}
function quad(v,mu,P){
  const d=new Float64Array(N);for(let i=0;i<N;i++)d[i]=(Number(v[i])||0)-(Number(mu[i])||0);
  let s=0;for(let i=0;i<N;i++){let row=0;for(let j=0;j<N;j++)row+=P[i][j]*d[j];s+=d[i]*row}return s;
}
function logMeanExp(xs){
  if(!xs.length)return -Infinity;let m=-Infinity;for(const x of xs)if(x>m)m=x;
  if(!Number.isFinite(m))return m;let z=0;for(const x of xs)z+=Math.exp(clamp(x-m,-80,0));
  return m+Math.log(z/xs.length);
}
function softmax(scores,temp=6){
  let m=-Infinity;for(const s of scores)if(s>m)m=s;
  const a=scores.map(s=>Number.isFinite(s)?Math.exp(clamp((s-m)/temp,-50,0)):0);let z=a.reduce((x,y)=>x+y,0)||1;
  return a.map(x=>x/z);
}

function prep(p,source,key,personalShrink){
  if(!p||!p.mu||!p.sigmaInvLower||!Number.isInteger(Number(p.viseme)))return null;
  const q=source==='personal'?stabilizePrecision(p.sigmaInvLower,personalShrink):directPrecision(p.sigmaInvLower);
  return {source,key,viseme:Number(p.viseme),mu:Float64Array.from(p.mu),P:q.P,logdet:q.logdet,phoneme:p.phoneme||p.code||null};
}

export class StabilizedHeadClassifier{
  constructor(stockModel=[],personalMap={},options={}){
    this.options={personalWeight:.68,personalShrink:.28,temperature:6,emaAlpha:.58,...options};
    this.stock=[];this.personal=[];
    stockModel.forEach((p,i)=>{const q=prep(p,'stock',`stock:${i}`,this.options.personalShrink);if(q)this.stock.push(q)});
    Object.entries(personalMap||{}).forEach(([k,p])=>{const q=prep(p,'personal',k,this.options.personalShrink);if(q)this.personal.push(q)});
    this.bySource={stock:Array.from({length:15},()=>[]),personal:Array.from({length:15},()=>[])};
    for(const p of this.stock)this.bySource.stock[p.viseme]?.push(p);
    for(const p of this.personal)this.bySource.personal[p.viseme]?.push(p);
    this.probs=new Array(15).fill(0);this.probs[14]=1;
    this.active=14;this.last=null;
  }
  sourceScore(list,v){return logMeanExp(list.map(p=>.5*(p.logdet-quad(v,p.mu,p.P))))}
  predict(v,{vadDb=null}={}){
    const scores=new Array(15).fill(-Infinity),w=clamp(this.options.personalWeight,0,1);
    for(let c=0;c<15;c++){
      const s=this.sourceScore(this.bySource.stock[c],v),p=this.sourceScore(this.bySource.personal[c],v);
      if(Number.isFinite(s)&&Number.isFinite(p)){
        const a=s+Math.log(Math.max(1e-6,1-w)),b=p+Math.log(Math.max(1e-6,w)),m=Math.max(a,b);
        scores[c]=m+Math.log(Math.exp(a-m)+Math.exp(b-m));
      }else scores[c]=Number.isFinite(p)?p:s;
    }
    // VAD is a strong silence prior, rather than allowing stale labels to survive.
    if(Number.isFinite(vadDb)){
      if(vadDb<-52){scores[14]=(Math.max(...scores.filter(Number.isFinite))||0)+10}
      else if(vadDb>-42&&Number.isFinite(scores[14]))scores[14]-=5;
    }
    const instant=softmax(scores,this.options.temperature),a=this.options.emaAlpha;
    for(let i=0;i<15;i++)this.probs[i]=a*instant[i]+(1-a)*this.probs[i];
    let best=0,second=1;if(this.probs[second]>this.probs[best]){best=1;second=0}
    for(let i=2;i<15;i++){if(this.probs[i]>this.probs[best]){second=best;best=i}else if(this.probs[i]>this.probs[second])second=i}
    this.active=best;
    const margin=Math.log((this.probs[best]+1e-9)/(this.probs[second]+1e-9));
    this.last={viseme:best,name:VISEMES[best],prob:this.probs[best],second:VISEMES[second],secondProb:this.probs[second],margin,scores:[...scores],probs:[...this.probs]};
    return this.last;
  }
  silence(){this.probs.fill(0);this.probs[14]=1;this.active=14;this.last={viseme:14,name:'sil',prob:1,second:null,secondProb:0,margin:20,scores:[],probs:[...this.probs]};return this.last}
  weights(){return Object.fromEntries(VISEMES.map((n,i)=>[`viseme_${n}`,this.probs[i]]))}
  info(){return {stock:this.stock.length,personal:this.personal.length,personalWeight:this.options.personalWeight,shrink:this.options.personalShrink,temperature:this.options.temperature,emaAlpha:this.options.emaAlpha}}
}
