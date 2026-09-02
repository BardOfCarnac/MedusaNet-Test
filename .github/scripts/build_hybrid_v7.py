from pathlib import Path

root=Path('voice-face-puppet-3d-compare')

src=(root/'compare-v6.js').read_text()
src=src.replace("from './hybrid-gate.js';","from './hybrid-gate-v2.js';")
a=src.index('const wlShapes=')
b=src.index('function hybridState(now){')
new_base="""const wlShapes={A:{o:.92,stretch:.18,funnel:0,pucker:0,forward:0},I:{o:.25,stretch:1,funnel:0,pucker:0,forward:0},U:{o:.18,stretch:.05,funnel:.58,pucker:.20,forward:.10},E:{o:.48,stretch:.82,funnel:0,pucker:0,forward:0},O:{o:.62,stretch:.08,funnel:.68,pucker:.14,forward:.08}};
function softCeiling(v,knee,cap){v=clamp(v);if(v<=knee)return v;const x=clamp((v-knee)/(1-knee));return knee+(cap-knee)*(1-Math.pow(1-x,1.45))}
function wLipState(){const morphs=blankMorphs();if(!wlNode)return {morphs,shape:'rest',level:0,weights:{A:0,I:0,U:0,E:0,O:0}};const raw={A:0,I:0,U:0,E:0,O:0};let sum=0,best=0,shape='rest';for(const k of Object.keys(raw)){raw[k]=Math.pow(clamp(+wlNode.weights[k]||0),1.25);sum+=raw[k];if(raw[k]>best){best=raw[k];shape=k}}const v=clamp((wlNode.volume||0)*1.18);let o=0,stretch=0,funnel=0,pucker=0,forward=0;if(sum>.0001)for(const k of Object.keys(raw)){const n=raw[k]/sum,s=wlShapes[k];o+=s.o*n;stretch+=s.stretch*n;funnel+=s.funnel*n;pucker+=s.pucker*n;forward+=(s.forward||0)*n}const jawRaw=clamp(o*v*1.05);morphs.jawOpen=softCeiling(jawRaw,.56,.82);morphs.mouthFunnel=Math.min(.78,clamp(funnel*v));morphs.mouthPucker=Math.min(.30,clamp(pucker*v*.82));morphs.jawForward=clamp(forward*v);const spread=softCeiling(clamp(stretch*v),.60,.82);morphs.mouthStretch_L=morphs.mouthStretch_R=spread;return {morphs,shape:v>.04?shape:'rest',level:v,weights:raw}}
"""
src=src[:a]+new_base+src[b:]
src=src.replace("morphs.mouthPucker=Math.min(.40,morphs.mouthPucker||0);","morphs.mouthPucker=Math.min(.34,morphs.mouthPucker||0);\n  morphs.mouthFunnel=Math.min(.82,morphs.mouthFunnel||0);")
src=src.replace("let active='hybrid',morph=blankMorphs();","let active='hybrid',morph=blankMorphs();\nconst MORPH_EASE={jawOpen:.30,mouthFunnel:.18,mouthPucker:.16,jawForward:.18,mouthStretch_L:.18,mouthStretch_R:.18,mouthRollLower:.24,mouthRollUpper:.24,mouthPress_L:.24,mouthPress_R:.24,mouthDimple_L:.22,mouthDimple_R:.22,mouthUpperUp_L:.22,mouthUpperUp_R:.22,mouthLowerDown_L:.22,mouthLowerDown_R:.22,mouthShrugUpper:.22};")
old="for(const k of MORPH_KEYS)morph[k]=lerp(morph[k],target.morphs[k]||0,.30);"
new="for(const k of MORPH_KEYS)morph[k]=lerp(morph[k],target.morphs[k]||0,MORPH_EASE[k]??.24);"
if old not in src: raise RuntimeError('smoothing target not found')
src=src.replace(old,new)
(root/'compare-v7.js').write_text(src)

cap=(root/'capture-v4.js').read_text()
cap=cap.replace("from './hybrid-gate.js';","from './hybrid-gate-v2.js';")
cap=cap.replace('voice-face-lipsync-diagnostic-v4-hybrid','voice-face-lipsync-diagnostic-v5-hybrid')
cap=cap.replace('lip-sync-diagnostic-v4-hybrid-','lip-sync-diagnostic-v5-hybrid-')
for a,b in [('V4 HYBRID','V5 HYBRID'),('V4 hybrid','V5 hybrid'),('V4 —','V5 —'),('V4 captured','V5 captured'),('V4 recording','V5 recording')]: cap=cap.replace(a,b)
(root/'capture-v5.js').write_text(cap)

idx=(root/'index.html').read_text()
idx=idx.replace('compare-v6.js','compare-v7.js').replace('capture-v4.js','capture-v5.js')
idx=idx.replace('DIAGNOSTIC RECORDING V4 · HYBRID','DIAGNOSTIC RECORDING V5 · HYBRID')
idx=idx.replace('V4 records the wLipSync vowel base','V5 records the wLipSync vowel base')
idx=idx.replace('No V4 hybrid diagnostic recording yet.','No V5 hybrid diagnostic recording yet.')
idx=idx.replace('HYBRID V6','HYBRID V7')
(root/'index.html').write_text(idx)
