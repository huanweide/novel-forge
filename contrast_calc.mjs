function lin(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function L(r,g,b){return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);}
function CR(a,b){const la=L(...a),lb=L(...b);const hi=Math.max(la,lb),lo=Math.min(la,lb);return (hi+0.05)/(lo+0.05);}
function composite(fg,alpha,bg){return [0,1,2].map(i=>Math.round(fg[i]*alpha+bg[i]*(1-alpha)));}
function hex(a){return '#'+a.map(x=>x.toString(16).padStart(2,'0')).join('');}
const parse=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];

const darkBg=[14,20,36], darkSurf=composite([255,255,255],0.09,darkBg);
const lightBg=[243,239,232], lightSurf=composite([15,18,30],0.08,lightBg);
const azureBg=[4,9,12], azureSurf=composite([190,230,235],0.08,azureBg);

console.log('dark surface-3 composite', hex(darkSurf), 'L', L(...darkSurf).toFixed(5));
console.log('light surface-3 composite', hex(lightSurf), 'L', L(...lightSurf).toFixed(5));
console.log('azure surface-3 composite', hex(azureSurf), 'L', L(...azureSurf).toFixed(5));
console.log('\n-- current muted-on-surface-3 --');
console.log('dark  #96948B CR', CR(parse('#96948B'),darkSurf).toFixed(3));
console.log('light #696C75 CR', CR(parse('#696C75'),lightSurf).toFixed(3));
console.log('azure #6A807C CR', CR(parse('#6A807C'),azureSurf).toFixed(3));
console.log('\n-- tertiary on surface-3 (hierarchy ceiling) --');
const tDark=CR(parse('#98968C'),darkSurf),tLight=CR(parse('#6B6E78'),lightSurf),tAzure=CR(parse('#7C918D'),azureSurf);
console.log('dark  #98968C CR', tDark.toFixed(3));
console.log('light #6B6E78 CR', tLight.toFixed(3));
console.log('azure #7C918D CR', tAzure.toFixed(3));

console.log('\n-- light search (darker gray, target >=4.5 and < tertiary) --');
for(let v=0x60;v>=0x45;v--){
  const c=[v,v+3,v+8];const cr=CR(c,lightSurf);
  if(cr>=4.5 && cr < tLight){console.log(hex(c),'CR',cr.toFixed(3));break;}
}
console.log('-- azure search (brighter cyan-gray, target >=4.5 and < tertiary) --');
for(let v=0x6e;v<=0x9a;v++){
  const c=[v,v+0x14,v+0x10];const cr=CR(c,azureSurf);
  if(cr>=4.5 && cr < tAzure){console.log(hex(c),'CR',cr.toFixed(3));break;}
}
