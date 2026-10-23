const test=require('node:test');
const assert=require('node:assert/strict');
const {Profile,ENERGY_INTERVAL,day}=require('../miniprogram/core/profile');
const {generate,ClassicSession}=require('../miniprogram/core/classic');
const Engine=require('../miniprogram/core/engine');
const {arrival}=require('../minigame/src/view');
const now=Date.UTC(2026,9,21,5), progress=()=>Array(140).fill(0);

test('free refill caps energy, resets recovery clock and preserves all other balances through reload',()=>{
  const p=new Profile(null,progress(),now);p.data.energy=0;p.data.diamonds=7;
  assert.equal(p.fillEnergy(now+ENERGY_INTERVAL*.9),true);assert.equal(p.data.energy,5);assert.equal(p.data.diamonds,7);
  assert.equal(p.fillEnergy(now+ENERGY_INTERVAL*.9),false);
  p.spendEnergy(now+ENERGY_INTERVAL*.9);p.refresh(now+ENERGY_INTERVAL);
  assert.equal(p.data.energy,4,'cannot collect old partial recovery after filling');
  const r=new Profile(JSON.parse(JSON.stringify(p.data)),progress(),now+ENERGY_INTERVAL);
  assert.equal(r.data.energy,4);assert.equal(r.data.diamonds,7);
  r.refresh(now+ENERGY_INTERVAL*1.9);assert.equal(r.data.energy,5);
});

test('classic optimum agrees with independent exhaustive orientation enumeration including alternate networks',()=>{
  // Small boards make exhaustive verification practical; the gameplay starts at 5x5.
  const {minimumMoves}=require('../miniprogram/core/classic');
  for(let seed=1;seed<=15;seed++) {
    const level=generate(3,seed),pieces=level.pieces.map(p=>({...p}));let best=Infinity;
    function enumerate(i,cost) {
      if(cost>=best)return;
      if(i===pieces.length){if(Engine.trace(level,pieces).solved)best=cost;return;}
      const p=pieces[i],original=level.pieces[i].orientation;
      for(let n=0;n<4;n++) {
        p.orientation=(original+n)%4;const mask=Engine.ports(p);
        if((p.x===0&&(mask&4))||(p.x===2&&(mask&1))||(p.y===0&&(mask&8))||(p.y===2&&(mask&2)))continue;
        if(p.x>0&&!!(Engine.ports(pieces[i-1])&1)!==!!(mask&4))continue;
        if(p.y>0&&!!(Engine.ports(pieces[i-3])&2)!==!!(mask&8))continue;
        enumerate(i+1,cost+n);
      }
    }
    enumerate(0,0);assert.equal(level.par,best);assert.equal(minimumMoves(level),best);
  }
  const alternate=generate(5,92);assert.equal(alternate.par,31);
  assert.equal(Engine.solve(alternate,alternate.pieces).moves,31,'hints follow the shortest solution, not the 43-click seed solution');
});

function solveClassic(session) {
  const answer=Engine.solve(session.level,session.game.pieces);
  for(const c of answer.changes)for(let i=0;i<c.turns;i++)session.act('rotate',c.x,c.y);
}
test('classic ratings depend on steps only, limited last-step success and exhaustion have distinct outcomes',()=>{
  for(const mode of ['limited','relaxed'])for(const [multiple,offset,stars] of [[1,0,3],[1,1,2],[2,0,2],[2,1,1],[3,0,1]]) {
    const s=new ClassicSession(5,92,1,mode),n=s.level.par;
    // Place the counter at the boundary; solve the actual remaining network.
    s.game.moves=(multiple-1)*n+offset;s.act('hint');solveClassic(s);
    assert.equal(s.game.moves,multiple*n+offset);assert.equal(s.game.result.solved,true);
    assert.equal(s.failed,false);assert.equal(s.view().stars,stars);
  }
  const fail=new ClassicSession(5,92,1,'limited'),initial=JSON.stringify(fail.game.pieces);
  const count=fail.level.par*3;
  for(let i=0;i<count;i++)assert.equal(fail.act('rotate',0,0),true);
  assert.equal(fail.failed,true);assert.equal(fail.view().stars,0);
  assert.equal(fail.act('rotate',1,0),false);assert.equal(fail.act('undo'),false);assert.equal(fail.act('hint'),false);
  fail.act('reset');assert.equal(fail.failed,false);assert.equal(fail.game.moves,0);
  assert.equal(JSON.stringify(fail.game.pieces),initial);solveClassic(fail);assert.equal(fail.view().stars,3);
  const free=new ClassicSession(5,92,2,'relaxed');
  for(let i=0;i<free.level.par*4;i++)free.act('rotate',0,0);
  assert.equal(free.failed,false);solveClassic(free);assert.equal(free.view().stars,1);
  free.act('reset');free.act('rotate',0,0);free.act('undo');assert.equal(free.game.moves,0);
  assert.throws(()=>new ClassicSession(4,1,1),RangeError);
});

test('all three personal record categories survive reload, preserving legacy casual results and reward deduplication',()=>{
  const p=new Profile(null,progress(),now);
  for(const kind of ['campaign','classic','limited'])for(let size=3;size<=9;size++) {
    const game={level:{size,name:'旧纪录'},moves:50-size};
    p.complete(kind,kind==='campaign'?size:p.newRun(),game,2,now);
  }
  const r=new Profile(JSON.parse(JSON.stringify(p.data)),progress(),now);
  assert.equal(r.data.records.length,21);assert.deepEqual(r.data.records,p.data.records);
  const game={level:{size:5,name:'限步挑战'},moves:31},id=r.newRun();
  assert.equal(r.complete('limited',id,game,3,now),5);assert.equal(r.complete('limited',id,game,3,now),0);
  assert.equal(r.data.records.find(v=>v.kind==='limited'&&v.size===5).stars,3);
  assert.equal(r.data.records.find(v=>v.kind==='classic'&&v.size===5).stars,2);
});

test('energy persists fractional recovery, caps at five and cannot bank time while full',()=>{
  const p=new Profile(null,progress(),now);
  assert.equal(p.spendEnergy(now),true);assert.equal(p.data.energy,4);
  p.refresh(now+ENERGY_INTERVAL-1);assert.equal(p.data.energy,4);
  p.refresh(now+ENERGY_INTERVAL);assert.equal(p.data.energy,5);
  p.refresh(now+ENERGY_INTERVAL*10);p.spendEnergy(now+ENERGY_INTERVAL*10);
  assert.equal(p.data.energy,4);p.refresh(now+ENERGY_INTERVAL*10+1);assert.equal(p.data.energy,4);
  for(let i=0;i<4;i++)assert.equal(p.spendEnergy(now+ENERGY_INTERVAL*10+1),true);
  assert.equal(p.spendEnergy(now+ENERGY_INTERVAL*10+1),false);
  const r=new Profile(JSON.parse(JSON.stringify(p.data)),progress(),now+ENERGY_INTERVAL*10.5);
  assert.equal(r.data.energy,0);r.refresh(now+ENERGY_INTERVAL*11);assert.equal(r.data.energy,1);
  r.refresh(now);assert.equal(r.data.energy,1,'clock rollback gives no energy');
});

test('check-in uses UTC+8 midnight, pays once a day and restarts after gaps or seven days',()=>{
  const start=Date.UTC(2026,9,20,16),p=new Profile(null,progress(),start);
  assert.equal(day(start-1)+1,day(start));
  for(let i=0;i<7;i++) {
    assert.equal(p.checkin(start+i*86400000),i===6?50:20);
    assert.equal(p.checkin(start+i*86400000+1),0);
  }
  assert.equal(p.data.diamonds,170);assert.equal(p.checkin(start+7*86400000),20);assert.equal(p.data.streak,1);
  assert.equal(p.checkin(start+9*86400000),20);assert.equal(p.data.streak,1);
  assert.equal(p.checkin(start),0);
  const r=new Profile(p.data,progress(),start+9*86400000);assert.equal(r.checkin(start+9*86400000),0);
});

test('legacy stars grant diamonds once, upgrades pay only the difference and reset cannot farm rewards',()=>{
  const old=progress();old[0]=2;
  const p=new Profile(null,old,now),game={level:{size:3,name:'测试关'},moves:4};
  assert.equal(p.data.diamonds,10);
  assert.equal(p.complete('campaign',0,game,2,now),0);
  assert.equal(p.complete('campaign',0,game,3,now),5);
  assert.equal(p.complete('campaign',0,game,1,now),0);
  const r=new Profile(JSON.parse(JSON.stringify(p.data)),progress(),now);
  assert.equal(r.data.diamonds,15);assert.equal(r.complete('campaign',0,game,3,now),0);
  assert.equal(r.data.records.length,1);assert.equal(r.data.records[0].stars,3);
});

test('classic rewards are once per run and do not create campaign stars',()=>{
  const p=new Profile(null,progress(),now),game={level:{size:4,name:'自由光路'},moves:12};
  const id=p.newRun();assert.equal(p.complete('classic',id,game,2,now),5);
  assert.equal(p.complete('classic',id,{...game,moves:10},3,now),0);
  assert.equal(p.data.classicCleared,1);assert.equal(p.data.records[0].moves,10);
  assert.equal(p.data.rewardedStars.reduce((a,b)=>a+b),0);
  const r=new Profile(p.data,progress(),now);assert.equal(r.complete('classic',id,game,3,now),0);
  assert.equal(r.complete('classic',r.newRun(),game,1,now),5);assert.equal(r.data.classicCleared,2);
});

test('diamond spending checks balance and capacity; night mode never costs diamonds',()=>{
  const p=new Profile(null,progress(),now);
  p.toggleNightMode();assert.equal(p.data.nightMode,true);assert.equal(p.data.diamonds,0);
  p.data.diamonds=100;
  assert.match(p.buyEnergy(now),/满/);assert.equal(p.data.diamonds,100);
  p.spendEnergy(now);assert.equal(p.buyEnergy(now),'');assert.equal(p.data.diamonds,80);
  p.toggleNightMode();p.toggleNightMode();assert.equal(p.data.diamonds,80);
  const r=new Profile(p.data,progress(),now);assert.equal(r.data.nightMode,true);assert.equal(r.data.energy,5);
});

test('legacy dark themes migrate to night mode once while preserving ownership, rewards and balances',()=>{
  for(const theme of ['forest','ocean','violet']) {
    const s=new Profile(null,progress(),now).data;delete s.nightMode;
    s.theme=theme;s.owned=['forest',theme];s.diamonds=42;s.energy=2;s.claimedDay=day(now);s.rewardedStars[0]=3;
    const p=new Profile(s,progress(),now);
    assert.equal(p.data.nightMode,theme!=='forest');assert.equal(p.data.diamonds,42);assert.equal(p.data.energy,2);
    assert.deepEqual(p.data.owned,s.owned);assert.equal(p.data.claimedDay,s.claimedDay);assert.equal(p.data.rewardedStars[0],3);
    p.toggleNightMode();const r=new Profile(JSON.parse(JSON.stringify(p.data)),progress(),now);
    assert.equal(r.data.nightMode,p.data.nightMode,'explicit switch overrides the legacy theme');
  }
});

test('random classic trees are unique, completely connected, cross-free and solvable for every size',()=>{
  for(let size=3;size<=9;size++) {
    const layouts=new Set();
    for(let seed=1;seed<=60;seed++) {
      const level=generate(size,seed), game=Engine.createGame(level);
      assert.equal(level.pieces.length,size*size);assert.ok(level.pieces.every(p=>p.ports!==15));
      assert.equal(game.result.solved,false);
      // Independently trace the stored reference orientations, then play every solution click.
      const reference=level.pieces.map((p,i)=>({...p,orientation:level.solution[i]}));
      assert.equal(Engine.trace(level,reference).solved,true);
      layouts.add(reference.map(Engine.ports).join(','));
      const answer=Engine.solve(level,game.pieces);assert.equal(answer.moves,level.par);
      for(const c of answer.changes)for(let i=0;i<c.turns;i++)Engine.rotate(game,c.x,c.y);
      assert.equal(game.result.solved,true);assert.equal(Engine.stars(game),3);
    }
    assert.ok(layouts.size>45,`${size}x${size} provides varied networks`);
  }
  assert.deepEqual(generate(9,123),generate(9,123),'seeds reproduce a puzzle for diagnosis');
  const s=new ClassicSession(8,987,1),original=JSON.stringify(s.game.pieces);
  s.act('rotate',0,0);s.act('hint');s.act('reset');assert.equal(JSON.stringify(s.game.pieces),original);
  assert.equal(s.act('next'),false);assert.equal(s.view().classic,true);
});

test('stars spring into left, right, then center sockets with a restrained overshoot and settled finish',()=>{
  assert.equal(arrival(0,0).visible,false);
  assert.deepEqual([0,1,2].filter(i=>arrival(500,i).visible),[0]);
  assert.deepEqual([0,1,2].filter(i=>arrival(1500,i).visible),[0,2]);
  assert.deepEqual([0,1,2].filter(i=>arrival(2500,i).visible),[0,1,2]);
  for(const [count,slots] of [[1,[0]],[2,[0,2]],[3,[0,1,2]]]) {
    assert.deepEqual([0,1,2].filter(i=>arrival(5000,i).rank<count),slots);
  }
  const first=Array.from({length:63},(_,i)=>arrival(160+i*16,0));
  assert.ok(first.some(s=>s.x>2),'passes slightly beyond the destination');
  assert.ok(first.some(s=>s.age>500&&s.x<0),'returns from the overshoot');
  assert.ok(Math.max(...first.map(s=>s.x))<9,'horizontal overshoot stays restrained');
  assert.ok(Math.max(...first.map(s=>s.scale))>1);
  assert.ok(Math.max(...first.map(s=>s.scale))<1.06);
  for(let i=1;i<first.length;i++) {
    assert.ok(first[i].alpha>=first[i-1].alpha&&first[i].alpha<=1);
    assert.ok(Math.abs(first[i].x-first[i-1].x)<7,'continuous flight without position jumps');
  }
  for(let i=0;i<3;i++) {
    const done=arrival(5000,i);
    assert.equal(done.alpha,1);assert.equal(done.scale,1);
    assert.equal(Math.abs(done.x),0);assert.equal(Math.abs(done.offset),0);
    assert.equal(Math.abs(done.rotation),0);assert.ok(done.glow<.001);
  }
});
