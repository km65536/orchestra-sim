const fs=require('fs'),vm=require('vm');
const ctx={console,Math,JSON,Date,Object,Array,Set,localStorage:{_s:{},getItem(k){return this._s[k]??null},setItem(k,v){this._s[k]=v},removeItem(k){delete this._s[k]}}};
vm.createContext(ctx);
const names='newGame,activeConcert,startPractice,startSetup,setupStatus,selectConcertConductor,selectHall,hallBlockReason,confirmSong,runPractice,autoSectionFocus,autoTuttiFocus,runHallPractice,rehearsalBlockReason,successInfo,runConcert,proceedToNextConcert,SECTIONS,FOCUS,hireCandidate,hireBlockReason,effectiveOverall,mean,memberAvg,load,emptyFocus,CONFIG,SONG_LIBRARY,shortageOf,runTraining,trainingBlockReason,trainingCost,ABILITIES,attendanceRate,ticketRevenue,findSong,songsOfGenre,memberPotAvg,stageOverflow,operatingCost';
const code=require('./game_source.js').logicSource()+`\n;this.api={get STATE(){return STATE},${names}};`;
vm.runInContext(code,ctx);
module.exports=ctx.api;
