function lin(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function L(r,g,b){return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);}
function CR(a,b){const la=L(...a),lb=L(...b);const hi=Math.max(la,lb),lo=Math.min(la,lb);return (hi+0.05)/(lo+0.05);}
function composite(fg,alpha,bg){return [0,1,2].map(i=>Math.round(fg[i]*alpha+bg[i]*(1-alpha)));}
function hex(a){return '#'+a.map(x=>x.toString(16).padStart(2,'0')).join('');}
const parse=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const lightSurf=composite([15,18,30],0.08,[243,239,232]);
const azureSurf=composite([190,230,235],0.08,[4,9,12]);
function table(name,surf,cands){
  console.log('\n== '+name+' surface-3 '+hex(surf)+' ==');
  for(const h of cands){
    const c=parse(h);
    console.log(h, 'CR', CR(c,surf).toFixed(3));
  }
}
table('LIGHT', lightSurf, ['#4A4D57','#565963','#5A5D67','#62656F','#696C75','#6B6E78']);
table('AZURE', azureSurf, ['#6A807C','#708885','#728682','#768A86','#7C918D','#869C98']);
