const test=require('node:test');
const assert=require('node:assert/strict');
const Engine=require('../miniprogram/core/engine');
const levels=require('../miniprogram/core/levels');
const {generate}=require('../miniprogram/core/classic');
const {Journey,DEPART_MS}=require('../miniprogram/core/homecoming');

function solved(level) {
  const game=Engine.createGame(level),answer=Engine.solve(level,game.pieces);
  for(const step of answer.changes)for(let i=0;i<step.turns;i++)Engine.rotate(game,step.x,step.y);
  assert.ok(game.result.solved);return game;
}
function checkRoutes(game) {
  const routes=Engine.homeRoutes(game.level,game.pieces),home=game.level.source;
  const terminals=game.pieces.filter(p=>[1,2,4,8].includes(p.ports)&&!(p.x===home.x&&p.y===home.y));
  assert.equal(routes.length,terminals.length);assert.ok(routes.length>0);
  assert.equal(new Set(routes.map(r=>r.index)).size,terminals.length);
  for(const route of routes) {
    assert.deepEqual(route.path[0],{x:game.pieces[route.index].x,y:game.pieces[route.index].y});
    assert.deepEqual(route.path.at(-1),{x:home.x,y:home.y});
    assert.equal(new Set(route.path.map(p=>`${p.x},${p.y}`)).size,route.path.length,'route never loops');
    for(let i=1;i<route.path.length;i++) {
      const a=route.path[i-1],b=route.path[i],dx=b.x-a.x,dy=b.y-a.y;
      assert.equal(Math.abs(dx)+Math.abs(dy),1,'walk only to an adjacent tile');
      const direction=Engine.DIRECTIONS.findIndex(([x,y])=>x===dx&&y===dy);
      const from=game.pieces.find(p=>p.x===a.x&&p.y===a.y),to=game.pieces.find(p=>p.x===b.x&&p.y===b.y);
      assert.ok(Engine.ports(from)&(1<<direction));
      assert.ok(Engine.ports(to)&(1<<((direction+2)%4)),'both road entrances match');
    }
  }
}
test('all 140 campaign boards and all seven classic sizes send every terminal animal along real roads to home',()=>{
  const boards=[...levels];for(let size=3;size<=9;size++)for(let seed=1;seed<=20;seed++)boards.push(generate(size,seed));
  for(const level of boards) {
    const before=Engine.createGame(level);assert.deepEqual(Engine.homeRoutes(level,before.pieces),[],'no early departures');
    const game=solved(level);checkRoutes(game);
    const original=JSON.stringify(game);const journey=new Journey(game,0);journey.advance(0,true);
    assert.ok(journey.duration>=2800&&journey.duration<=6200,'homecoming leaves roughly 3–6 seconds to see animals walk and enter the house');
    const starts=journey.view().animals;
    assert.ok(starts.every(a=>!a.walking&&!a.arrived));
    journey.advance(DEPART_MS+1,true);
    assert.ok(journey.view().animals.every(a=>a.walking),'all animals depart together');
    for(let time=DEPART_MS+100;time<journey.duration;time+=147) {
      journey.advance(time,true);
      for(const animal of journey.view().animals) {
        const route=journey.routes.find(r=>r.index===animal.index);
        const onRoad=route.path.slice(1).some((b,i)=>{
          const a=route.path[i];
          return Math.abs(Math.abs(animal.x-a.x)+Math.abs(animal.y-a.y)+Math.abs(animal.x-b.x)+Math.abs(animal.y-b.y)-1)<1e-9;
        });
        assert.ok(onRoad,'continuous positions remain on actual path segments');
      }
    }
    journey.advance(journey.duration,true);
    assert.equal(journey.done,true);assert.equal(journey.view().arrived,journey.routes.length);
    for(const a of journey.view().animals){assert.equal(a.x,level.source.x);assert.equal(a.y,level.source.y);assert.equal(a.alpha,0);}
    assert.equal(JSON.stringify(game),original,'rendering a journey cannot mutate scores, pieces or moves');
  }
});
test('homeward paths work on a player network with a loop and no stored solution',()=>{
  const pieces=[[0,0,1],[1,0,7],[2,0,6],[1,1,9],[2,1,12]].map(([x,y,ports])=>({x,y,ports,orientation:0}));
  const game=Engine.createGame({size:3,source:{x:2,y:1},pieces});assert.equal(game.result.solved,true);checkRoutes(game);
  const broken=Engine.createGame({...game.level,pieces:pieces.map((p,i)=>({...p,orientation:i===0?1:0}))});
  assert.deepEqual(Engine.homeRoutes(broken.level,broken.pieces),[]);
  assert.throws(()=>new Journey(broken,0),/尚未/);
});
test('journey clock pauses offscreen and never rewinds after a backwards clock change',()=>{
  const trip=new Journey(solved(levels[0]),1000);trip.advance(1000,true);trip.advance(1500,true);
  const before=trip.view();trip.advance(1500,false);trip.advance(60000,false);trip.advance(70000,true);
  assert.deepEqual(trip.view(),before);trip.advance(70100,true);assert.equal(trip.elapsed,600);
  trip.advance(500,true);assert.equal(trip.elapsed,600);trip.advance(70200,true);assert.equal(trip.elapsed,700);
});
