// Local compatibility patch for HeadAudio d3af5f9f.
// Upstream _onmessage() guards viseme activation with `if (viseme)`,
// which skips viseme index 0 (aa). Patch the prototype before any
// HeadAudio instances are constructed so aa can drive onvalue normally.
const COMMIT='d3af5f9ff86ab6b2b1913d411a4e1922ec101953';
const {HeadAudio}=await import(`https://cdn.jsdelivr.net/gh/met4citizen/HeadAudio@${COMMIT}/dist/headaudio.min.mjs`);
if(!HeadAudio.prototype.__vfpAaZeroFix){
  const original=HeadAudio.prototype._onmessage;
  HeadAudio.prototype._onmessage=function(message){
    if(message?.data?.event==='viseme' && message.data.viseme===0){
      this.visemeActive=0;
    }
    return original.call(this,message);
  };
  HeadAudio.prototype.__vfpAaZeroFix=true;
}
