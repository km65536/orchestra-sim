const A=require('./sim.js');
const rows={};
for(let g=0;g<60;g++) for(const sid of ['hungarian5','finlandia','vltava','beet7','brahms1','mahler1','dvorak9','faune']){
  A.newGame(); const c=A.activeConcert(); A.selectHall(c,'small'); A.confirmSong(c,sid); A.startPractice(c);
  for(let i=0;i<10;i++){const plan=i%2?{menu:'section',sections:Object.fromEntries(A.SECTIONS.map(s=>[s.id,A.autoSectionFocus(c,s.id)]))}:{menu:'tutti',focus:A.autoTuttiFocus(c)};A.runPractice(c,plan);}
  const i=A.successInfo(c), r=i.readiness; const o=rows[sid]=rows[sid]||{n:0,comp:0,req:0,pb:0,p:0,mult:0,str:0,sec:0,ov:0,mas:0};
  o.n++;o.comp+=r.composite;o.req=r.required;o.pb+=r.pBase;o.p+=i.prob;o.mult+=r.mult;o.str+=r.strength;o.sec+=r.sec;o.ov+=r.ovS;o.mas+=r.mas;
}
for(const [k,o] of Object.entries(rows)) console.log(k.padEnd(11),'diff',A.findSong(k).difficulty,'comp',(o.comp/o.n).toFixed(1),'req',o.req,'sec/ov/mas',(o.sec/o.n).toFixed(0),(o.ov/o.n).toFixed(0),(o.mas/o.n).toFixed(0),'str',(o.str/o.n).toFixed(1),'pBase',(o.pb/o.n).toFixed(2),'mult',(o.mult/o.n).toFixed(2),'prob',(o.p/o.n).toFixed(2));
