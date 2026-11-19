const A=require('./sim.js');
A.newGame(); A.STATE.funds=2000000;
const c=A.activeConcert(); A.selectHall(c,'general'); A.confirmSong(c,'beet7');
const before=A.mean(A.STATE.members.map(A.memberAvg));
for(const t of ['masterclass','concert','maintenance']) for(const s of A.SECTIONS){const tr=A.CONFIG.trainings.find(x=>x.id===t);const cost=A.trainingCost(tr,s.id);const r=A.runTraining(c,t,s.id);const pts=r.gains.reduce((a,g)=>a+g.to-g.from,0);console.log(t,s.id,'cost',cost,'pts',pts,'yen/pt',Math.round(cost/pts));}
const m=A.STATE.members[5]; const r=A.runTraining(c,'lesson',m.id,'tech'); console.log('lesson',r.cost,r.gains.map(g=>g.abil+':'+g.from+'→'+g.to).join(' '));
const r2=A.runTraining(c,'instrument',m.id); console.log('instr',r2.cost,r2.extra,r2.gains.map(g=>g.abil+':'+g.from+'→'+g.to).join(' '));
console.log('avg',before.toFixed(2),'→',A.mean(A.STATE.members.map(A.memberAvg)).toFixed(2),'spent',2000000-A.STATE.funds+90000);
console.log('blocked again:',A.trainingBlockReason(c,'masterclass','hs'));
