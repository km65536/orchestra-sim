const A=require('./sim.js');
// プレイヤー戦略
function chooseHall(c,strat){
  const S=A.STATE;
  const order=strat.hall==='fixed'?[strat.fixed,'community']:['top','large','general','small','community'];
  for(const id of order){const h=A.CONFIG.halls.find(x=>x.id===id); if(S.funds-h.fee>=strat.reserve||id==='community') if(!A.hallBlockReason(c,h)){A.selectHall(c,id);return id;}}
  A.selectHall(c,'community');return 'community';
}
function pickSong(c){ // 編成が揃っていて難易度が楽団に見合う曲を好む
  const S=A.STATE; let best=null,bk=-1e9;
  for(const s of A.SONG_LIBRARY){const pen=A.shortageOf(s).penalty; const k=-pen*100 - Math.abs(s.difficulty-(50+S.concertOrder.length*2))*0.5 + s.duration*0.15 + s.popularity + Math.random()*4; if(k>bk){bk=k;best=s;}}
  return best.id;
}
function play(strat,N=10){
  A.newGame(); const out=[];
  for(let k=0;k<N;k++){
    const c=A.activeConcert(); const f0=A.STATE.funds;
    const hall=chooseHall(c,strat);
    // 採用：安いものから1名まで（予算あれば）
    for(const cand of A.STATE.recruit.candidates.slice().sort((a,b)=>a.cost-b.cost)) if(!A.hireBlockReason(cand)&&A.STATE.funds-cand.cost>strat.reserve){A.hireCandidate(cand.id);break;}
    A.confirmSong(c,pickSong(c)); A.startPractice(c);
    // 育成：予算の範囲内で
    let spent=0;
    if(strat.train){
      const opts=[];
      for(const s of A.SECTIONS) for(const t of ['masterclass','concert','maintenance']) opts.push([t,s.id,null]);
      for(const m of A.STATE.members.slice().sort((a,b)=>(A.memberPotAvg(b)-A.memberAvg(b))-(A.memberPotAvg(a)-A.memberAvg(a))).slice(0,6)){const ab=A.ABILITIES.map(a=>a.id).sort((x,y)=>(m.potential[y]-m.abilities[y])-(m.potential[x]-m.abilities[x]))[0];opts.push(['lesson',m.id,ab]);}
      for(const [t,id,ab] of opts.sort(()=>Math.random()-.5)){
        const cost=A.trainingCost(A.CONFIG.trainings.find(x=>x.id===t),id);
        if(spent+cost>strat.train||A.STATE.funds-cost<strat.reserve) continue;
        if(!A.trainingBlockReason(c,t,id,ab)){A.runTraining(c,t,id,ab);spent+=cost;}
      }
    }
    for(let i=0;i<10;i++){const plan=i%2?{menu:'section',sections:Object.fromEntries(A.SECTIONS.map(s=>[s.id,A.autoSectionFocus(c,s.id)]))}:{menu:'tutti',focus:A.autoTuttiFocus(c)};const r=A.runPractice(c,plan);if(r.error)throw r.error;}
    if(strat.rehearse && !A.rehearsalBlockReason(c)) A.runHallPractice(c);
    const info=A.successInfo(c); const res=A.runConcert(c);
    out.push({hall,song:c.songId,prob:info.prob,rank:res.rank,net:res.settlement.net,funds:A.STATE.funds,delta:A.STATE.funds-f0,rep:A.STATE.reputation,avg:A.mean(A.STATE.members.map(A.memberAvg)),aud:res.settlement.audience});
    A.proceedToNextConcert();
  }
  return out;
}
const strategies={
  frugal:{hall:'fixed',fixed:'small',reserve:50000,train:0,rehearse:true},
  general:{hall:'fixed',fixed:'general',reserve:80000,train:100000,rehearse:true},
  invest:{hall:'fixed',fixed:'general',reserve:50000,train:250000,rehearse:true},
  large:{hall:'fixed',fixed:'large',reserve:0,train:50000,rehearse:true},
  topRisk:{hall:'fixed',fixed:'top',reserve:0,train:0,rehearse:false},
  adaptive:{hall:'adaptive',reserve:250000,train:150000,rehearse:true},
};
const G=10;
for(const [n,s] of Object.entries(strategies)){
  const agg=Array.from({length:10},()=>({funds:0,prob:0,rep:0,avg:0,net:0,broke:0,ranks:{}}));
  for(let g=0;g<G;g++){const o=play(s); o.forEach((x,i)=>{const a=agg[i];a.funds+=x.funds/G;a.prob+=x.prob/G;a.rep+=x.rep/G;a.avg+=x.avg/G;a.net+=x.net/G;if(x.funds<0)a.broke++;a.ranks[x.rank]=(a.ranks[x.rank]||0)+1;});}
  console.log('\n'+n);
  for(const i of [0,2,4,7,9]){const a=agg[i];console.log(` #${i+1} funds ${Math.round(a.funds/1000)}k net ${Math.round(a.net/1000)}k prob ${a.prob.toFixed(2)} rep ${a.rep.toFixed(1)} avg ${a.avg.toFixed(1)} neg ${a.broke} ranks ${JSON.stringify(a.ranks)}`);}
}
