const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const alpha=(dtMs,tauMs)=>1-Math.exp(-Math.max(.1,dtMs)/Math.max(1,tauMs));

export class RawOnsetFollower{
  constructor(ctx,source,{fftSize=256,floorDb=-55}={}){
    this.analyser=ctx.createAnalyser();
    this.analyser.fftSize=fftSize;
    this.analyser.smoothingTimeConstant=0;
    this.buffer=new Float32Array(this.analyser.fftSize);
    this.floorDb=floorDb;
    this.level=0;
    this.db=-120;
    this.ageMs=0;
    this.ready=false;
    source.connect(this.analyser);
  }
  sample(dtMs=16,{speechHint=false}={}){
    if(!this.analyser)return {level:0,db:-120,floorDb:this.floorDb};
    this.ageMs+=dtMs;
    this.analyser.getFloatTimeDomainData(this.buffer);
    let energy=0;
    for(let i=0;i<this.buffer.length;i++){const x=this.buffer[i];energy+=x*x;}
    const rms=Math.sqrt(energy/Math.max(1,this.buffer.length));
    const db=20*Math.log10(Math.max(1e-7,rms));
    this.db=db;

    // Ignore the all-zero analyser startup frame, then learn the local noise floor
    // quickly for the first half-second and very slowly afterwards.
    if(db>-90){
      if(!this.ready){this.floorDb=db;this.ready=true;}
      const warm=this.ageMs<500&&!speechHint;
      const nearFloor=!speechHint&&db<this.floorDb+10;
      if(warm||nearFloor){
        const tau=warm?120:1800;
        this.floorDb+=(db-this.floorDb)*alpha(dtMs,tau);
      }
    }

    const rise=db-this.floorDb;
    const target=this.ready?clamp((rise-4.5)/17.5):0;
    this.level+=(target-this.level)*alpha(dtMs,target>this.level?8:52);
    if(this.level<.002)this.level=0;
    return {level:this.level,db:this.db,floorDb:this.floorDb};
  }
  reset(){this.level=0;this.db=-120;this.ageMs=0;this.ready=false;}
  disconnect(){try{this.analyser?.disconnect()}catch{}this.analyser=null;}
}
