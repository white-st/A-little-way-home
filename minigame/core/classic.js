(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine'), require('./session'));
  else root.LightClassic = factory(root.LightEngine, root.LightSession);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine, SessionModule) {
  const MODES = { limited: '限步挑战', relaxed: '休闲模式' };
  // Minimize clockwise clicks over all connected solutions, not just the seed's
  // reference. Arc consistency rejects unmatched roads before branching.
  function minimumSolution(level) {
    const size=level.size, pieces=level.pieces, links=[];
    const domains=pieces.map((piece,i)=>{
      const candidates=[],seen=new Set();
      for(let turns=0;turns<4;turns++) {
        const mask=Engine.rotateMask(Engine.ports(piece),turns);
        if(seen.has(mask))continue;seen.add(mask);
        if(Engine.DIRECTIONS.some(([dx,dy],d)=>(mask&(1<<d)) &&
          (piece.x+dx<0||piece.x+dx>=size||piece.y+dy<0||piece.y+dy>=size)))continue;
        candidates.push({mask,turns});
      }
      Engine.DIRECTIONS.forEach(([dx,dy],d)=>{
        const x=piece.x+dx,y=piece.y+dy;
        if(x>=0&&x<size&&y>=0&&y<size)links.push([i,y*size+x,d]);
      });
      return candidates;
    });
    const reference=Engine.solve(level,pieces);
    let best=reference.moves,orientations=reference.pieces.map(p=>p.orientation);
    function search(sets) {
      let changed=true;
      while(changed) {
        changed=false;
        for(const [a,b,d] of links) {
          const allowed=sets[a].filter(p=>sets[b].some(q=>!!(p.mask&(1<<d))===!!(q.mask&(1<<((d+2)%4)))));
          if(!allowed.length)return;
          if(allowed.length!==sets[a].length){sets[a]=allowed;changed=true;}
        }
      }
      const bound=sets.reduce((sum,set)=>sum+Math.min(...set.map(p=>p.turns)),0);
      if(bound>=best)return;
      let branch=-1;
      sets.forEach((set,i)=>{if(set.length>1 && (branch<0||set.length<sets[branch].length))branch=i;});
      if(branch<0) {
        const trial=pieces.map((p,i)=>({...p,orientation:p.orientation+sets[i][0].turns}));
        if(Engine.trace(level,trial).solved){best=bound;orientations=trial.map(p=>p.orientation%4);}
        return;
      }
      for(const candidate of sets[branch]) {const next=sets.slice();next[branch]=[candidate];search(next);}
    }
    search(domains);return {moves:best,orientations};
  }
  const minimumMoves=level=>minimumSolution(level).moves;
  function generate(size, seed) {
    if (!Number.isInteger(size) || size < 3 || size > 9) throw new RangeError('不支持的棋盘尺寸');
    let state = seed >>> 0;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    // Start with a connected snake, then exchange an edge on each new cycle.
    // Every exchange preserves a spanning tree; capped endpoints forbid crosses.
    const count = size * size, graph = Array.from({length:count},()=>new Set()), route = [];
    const link = (a,b) => { graph[a].add(b); graph[b].add(a); };
    for (let y=0;y<size;y++) for(let x=0;x<size;x++) route.push(y*size+(y%2 ? size-1-x : x));
    for (let i=1;i<count;i++) link(route[i-1],route[i]);
    for (let attempt=0;attempt<count*8;attempt++) {
      const a=Math.floor(random()*count), direction=Math.floor(random()*4), [dx,dy]=Engine.DIRECTIONS[direction];
      const x=a%size+dx, y=Math.floor(a/size)+dy, b=y*size+x;
      if(x<0||y<0||x>=size||y>=size||graph[a].has(b)||graph[a].size>=3||graph[b].size>=3) continue;
      const parents=Array(count).fill(-1), queue=[a]; parents[a]=a;
      for(let cursor=0;cursor<queue.length && parents[b]<0;cursor++) for(const next of graph[queue[cursor]]) {
        if(parents[next]>=0) continue;
        parents[next]=queue[cursor]; queue.push(next);
      }
      const edges=[];
      for(let to=b;to!==a;to=parents[to]) edges.push([to,parents[to]]);
      const [u,v]=edges[Math.floor(random()*edges.length)];
      graph[u].delete(v); graph[v].delete(u); link(a,b);
    }
    const masks=graph.map((neighbors,i)=>{
      let mask=0;
      Engine.DIRECTIONS.forEach(([dx,dy],d)=>{if(neighbors.has(i+dy*size+dx)) mask|=1<<d;});
      return mask;
    });
    const solution = [], pieces = masks.map((mask, i) => {
      const ports = [1,3,5,7].find(base => [0,1,2,3].some(n => Engine.rotateMask(base,n) === mask));
      const orientation = [0,1,2,3].find(n => Engine.rotateMask(ports,n) === mask);
      solution.push(orientation);
      return { x: i % size, y: Math.floor(i / size), type: 'wire', ports, orientation: Math.floor(random() * 4) };
    });
    const center = Math.floor(size / 2);
    const level = { id: `classic-${seed}`, size, seed, section: 0, sectionName: '经典', chapter: '经典模式', name: '林间归途', description: '随机归家道路', tip: '', source: { x:center, y:center }, pieces, solution };
    if (Engine.trace(level,pieces).solved) pieces[0].orientation = (pieces[0].orientation + 1) % 4;
    const answer = Engine.solve(level,pieces);
    if (!answer) throw new Error('随机棋盘参考解无效');
    const optimal=minimumSolution(level);
    level.par = optimal.moves; level.solution=optimal.orientations;
    return level;
  }
  class ClassicSession extends SessionModule.Session {
    constructor(size, seed, runId, mode = 'relaxed') {
      if(!Number.isInteger(size)||size<5||size>9)throw new RangeError('经典棋盘从 5 × 5 开始');
      if(!MODES[mode])throw new RangeError('不支持的经典模式');
      super(undefined,size); this.runId = runId; this.mode=mode; this.level = generate(size,seed);
      this.failed=false; this.bestStars=0;
      this.game = Engine.createGame(this.level);
    }
    rating() {
      if(this.failed)return 0;
      return this.game.moves<=this.level.par ? 3 : this.game.moves<=this.level.par*2 ? 2 : 1;
    }
    act(action,x,y) {
      if (action === 'next' || action === 'restart') return false;
      if (action === 'reset') { this.game = Engine.createGame(this.level); this.failed=false; this.message = ''; return true; }
      if(this.failed)return false;
      const changed=super.act(action,x,y);
      if(changed && this.game.result.solved)this.bestStars=Math.max(this.bestStars,this.rating());
      else if(changed && this.mode==='limited' && this.game.moves>=this.level.par*3)this.failed=true;
      return changed;
    }
    view() {
      const stars=this.game.result.solved?this.rating():0;
      return { ...super.view(), classic:true, classicMode:this.mode, modeName:MODES[this.mode], failed:this.failed,
        stars, hearts:stars, starText:'★'.repeat(stars)+'☆'.repeat(3-stars),bestHearts:this.bestStars,
        projectedStars:this.rating(),twoStarLimit:this.level.par*2,moveLimit:this.mode==='limited'?this.level.par*3:null,
        canUndo:!this.failed&&!this.game.result.solved&&this.game.history.length>0,
        last:false, name:'林间归途', number:'随机', totalText:'∞' };
    }
  }
  return { generate, ClassicSession, MODES, minimumMoves };
}));
