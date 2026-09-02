from pathlib import Path
p=Path(__file__).parent/'compare-v8.js'
s=p.read_text()
old="const personalConsonants=Object.fromEntries(Object.entries(personal.prototypes).filter(([,p])=>CONSONANTS.includes(VISEMES[+p.viseme])));"
new="const personalConsonants=Object.fromEntries(Object.entries(personal.prototypes).filter(([k,p])=>k.startsWith('v8c:')&&CONSONANTS.includes(VISEMES[+p.viseme])));"
if old not in s: raise SystemExit('V8 personal filter signature not found')
p.write_text(s.replace(old,new))
