(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LumenView = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const baseColors = { bg: '#0c171d', card: '#142630', line: '#29434c', ink: '#ecf4e9', muted: '#92aaa9', mint: '#80dfc1', gold: '#edd19c',
    primaryInk: '#16352c', disabled: '#526c74', selected: '#203b34', panel: '#182e32', panelLine: '#456e65', veil: 'rgba(4,13,18,.88)', diamond: '#92d9f4', light: false };
  let colors = baseColors;
  const LEVELS_PER_PAGE = 6;
  const starColor = '#d9b261';
  const confettiColors=[['#ff5548','#d83243'],['#ffce31','#e99b25'],['#22c9ed','#1895ce'],['#4778ff','#4255cc'],
    ['#a456ee','#7436c1'],['#fa54b6','#ce358d'],['#51d885','#2aa563'],['#ff903d','#dd622c']];
  // One brief burst per celebration; reuse its fixed paper population.
  const confettiPieces=(()=>{
    let seed=51023;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    return Array.from({length:384},(_,i)=>{
      const depth=.75+random()*.75;
      return {side:i%2? -1:1,sideLaunch:i%4<2,launch:.64+random()*.22,rise:random(),reach:.25+random()*.67,
        duration:2600+random()*1200,delay:random()*1200,spin:3+random()*8,wave:random()*Math.PI*2,
        sway:7+random()*18,width:(i%7===0?2.8:4.5+random()*4.5)*depth,
        height:(i%7===0?16:6+random()*6)*depth,color:(i*7+Math.floor(i/8))%8};
    });
  })();
  function createGrain(canvas, ctx) {
    // A fixed paper tile is built once per app; animation frames only repeat it.
    canvas.width=256;canvas.height=256;
    const paper=canvas.getContext('2d');let seed=71839;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<12000;i++) {
      const x=random()*256,y=random()*256,r=.35+random()*.8;
      paper.fillStyle=i%3===0?'rgba(64,82,45,.12)':'rgba(255,253,237,.22)';
      paper.fillRect(x,y,r,r*(.7+random()*.6));
    }
    return ctx.createPattern(canvas,'repeat');
  }
  const starPoints = Array.from({length:10},(_,i)=> {
    const angle = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .46 : 1;
    return [Math.cos(angle)*r, Math.sin(angle)*r];
  });
  function starPath(ctx) {
    ctx.beginPath(); starPoints.forEach(([x,y],i)=>i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath();
  }
  function star(ctx, x, y, radius, filled = true) {
    ctx.save(); ctx.translate(x, y); ctx.scale(radius, radius);
    if (!filled) {
      starPath(ctx); ctx.fillStyle=colors.light?'#dce8c7':'#0b1b22'; ctx.fill(); ctx.lineWidth=.06;
      ctx.strokeStyle='#fffdf7'; ctx.stroke();
      ctx.translate(0,-.055); ctx.scale(.86,.86); starPath(ctx);
      ctx.strokeStyle=colors.light?'#c5d6ad':'#071117'; ctx.stroke(); ctx.restore(); return;
    }
    // A white rim, warm bevel and softly faceted gold face stay legible at icon sizes.
    starPath(ctx);ctx.lineJoin='round';ctx.strokeStyle='#fffdf7';
    ctx.shadowColor='rgba(117,74,23,.3)';ctx.shadowBlur=Math.max(.8,radius*.13);
    ctx.shadowOffsetX=radius*.025;ctx.shadowOffsetY=radius*.085;ctx.fillStyle='#b8812c';ctx.fill();
    ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
    ctx.lineWidth=2*Math.max(.45,Math.min(1.7,radius*.06))/radius;ctx.stroke();
    ctx.fillStyle='#b8812c';ctx.fill();
    if(radius>=8) {
      ctx.save();ctx.scale(.87,.87);starPath(ctx);
      const gold=ctx.createLinearGradient(-.45,-1,.45,1);
      gold.addColorStop(0,'#fff2ba');gold.addColorStop(.33,'#f8d571');
      gold.addColorStop(.68,'#eeb74d');gold.addColorStop(1,'#ce8e30');
      ctx.fillStyle=gold;ctx.fill();
      const facets=['#fff9dc','#ffe9a4','#e9ae3e','#b77b28','#e5aa3a','#f1c35c','#a76c20','#d89732','#ffe6a0','#fff8da'];
      ctx.save();ctx.globalAlpha*=.25;
      starPoints.forEach(([px,py],i)=>{
        const next=starPoints[(i+1)%10];ctx.beginPath();ctx.moveTo(-.055,-.08);ctx.lineTo(px,py);
        ctx.lineTo(next[0],next[1]);ctx.closePath();ctx.fillStyle=facets[i];ctx.fill();
      });ctx.restore();
      starPath(ctx);ctx.strokeStyle='#ffe8a7';ctx.lineWidth=.04;ctx.stroke();
      if(radius>=14) {
        ctx.save();starPath(ctx);ctx.clip();
        const sheen=ctx.createLinearGradient(-.5,-.7,.2,.45);
        sheen.addColorStop(0,'rgba(255,255,245,.68)');sheen.addColorStop(.5,'rgba(255,255,245,.03)');sheen.addColorStop(1,'rgba(255,255,245,0)');
        ctx.fillStyle=sheen;ctx.beginPath();ctx.moveTo(-1,-1);ctx.lineTo(1,-1);ctx.lineTo(1,-.28);
        ctx.bezierCurveTo(.3,-.36,-.14,.24,-1,.12);ctx.closePath();ctx.fill();
        // Sparse, fixed flecks add texture without shimmering from frame to frame.
        ctx.fillStyle='rgba(255,250,215,.25)';
        for(let i=0;i<24;i++)ctx.fillRect(((i*37)%97)/54-.9,((i*23)%83)/48-.9,.018,.012);
        ctx.restore();
      }
      ctx.restore();
    } else {
      starPath(ctx);ctx.fillStyle=starColor;ctx.fill();
    }
    ctx.restore();
  }
  function stars(ctx, count, x, y, radius = 8, gap = 22) {
    for (let i = 0; i < 3; i++) star(ctx, x + i * gap, y, radius, i < count);
  }
  function soften(value) {
    const t=Math.max(0,Math.min(1,value));
    return t*t*t*(t*(t*6-15)+10);
  }
  function arrival(elapsed, index) {
    const rank=[0,2,1][index],age=Math.max(0,elapsed-160-rank*1000),t=age/1000;
    // Underdamped spring, with a smooth final taper to exactly rest at the socket.
    const damping=6.6,frequency=Math.sqrt(12*12-damping*damping);
    const residual=Math.exp(-damping*t)*(Math.cos(frequency*t)+damping/frequency*Math.sin(frequency*t))
      *(1-soften((age-760)/240));
    return { visible:age>0, age, rank, x:(index===0?-62:index===2?62:0)*residual,
      offset:(index===1?-24:12)*residual, rotation:(index===0?-.24:index===2?.24:-.12)*residual,
      scale:1-.38*residual, alpha:soften(age/150),
      glow:.6*Math.sin(Math.PI*soften((age-240)/700)) };
  }
  function flyingStar(ctx, x, y, radius, state) {
    ctx.save();ctx.translate(x+state.x,y+state.offset);ctx.rotate(state.rotation);
    ctx.globalAlpha=state.alpha;star(ctx,0,0,radius*state.scale);
    if(state.glow>0.001) {
      ctx.globalAlpha=state.glow;ctx.scale(radius*state.scale,radius*state.scale);
      starPath(ctx);ctx.strokeStyle='#fffdf7';ctx.lineWidth=.07;ctx.stroke();
    }
    ctx.restore();
  }
  function rect(ctx, x, y, w, h, fill, radius = 12, stroke) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function text(ctx, value, x, y, size = 14, color = colors.ink, align = 'left', weight = 'normal') {
    ctx.font = `${weight} ${size}px sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(String(value), x, y);
  }
  function wrap(ctx, value, x, y, width, size = 12, color = colors.muted, maxLines = 2) {
    ctx.font = `${size}px sans-serif`;
    const lines = [];
    let current = '';
    for (const char of value) {
      if (current && ctx.measureText(current + char).width > width) { lines.push(current); current = ''; }
      current += char;
    }
    if (current) lines.push(current);
    lines.slice(0, maxLines).forEach((line, i) => {
      text(ctx, i === maxLines - 1 && lines.length > maxLines ? line.slice(0, -1) + '…' : line, x, y + i * (size + 7), size, color);
    });
  }
  function pressDepth(layout, target) {
    const press=layout.press;
    if(!press || press.id!==target.id || press.x!==target.x || press.y!==target.y)return 0;
    if(press.releasedAt===null)return 1-Math.pow(1-Math.min(1,Math.max(0,layout.now-press.startedAt)/80),3);
    const age=Math.max(0,layout.now-press.releasedAt),t=age/1000;
    return Math.exp(-14*t)*Math.cos(20*t)*(1-soften((age-300)/120));
  }
  function control(ctx,layout,target,fill,radius,paint) {
    const {x,y,w,h,disabled}=target,press=pressDepth(layout,target);
    const primary=!disabled&&fill===colors.mint,selected=!disabled&&fill===colors.selected;
    const tones=disabled ? (colors.light?['#e5ecda','#cbd6bd','#a4b294']:['#45564b','#304037','#24342c'])
      : primary?['#9cf466','#4dcc35','#298d2c']
      : colors.light?(selected?['#e5ffc5','#aad77f','#75a65c']:['#f3ffe2','#d0edac','#94b674'])
      : selected?['#92b76c','#537e45','#335d35']:['#73985c','#426640','#294b32'];
    const rim=disabled?(colors.light?'#e8eddf':'#82917f'):'#ffffff';
    const border=Math.min(3.5,h*.075),inset=border+Math.min(4,h*.07),r=Math.min(Math.max(radius,14),h/2);
    layout.targets.push(target);
    ctx.save();
    // The whole rounded button compresses; all depth stays inside its cream rim.
    ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
    ctx.translate(x+w/2,y+h/2+1.5*press);
    ctx.scale(1-.025*press,1-.045*press);ctx.translate(-x-w/2,-y-h/2);
    rect(ctx,x,y,w,h,rim,r,colors.light?'#b6ce96':'#738b65');
    const bevel=ctx.createLinearGradient(0,y,0,y+h);
    bevel.addColorStop(0,primary?'#91cf43':tones[0]);bevel.addColorStop(.5,tones[2]);bevel.addColorStop(1,tones[2]);
    rect(ctx,x+border,y+border,w-border*2,h-border*2,bevel,r-border);
    const face=ctx.createLinearGradient(0,y+inset,0,y+h-inset);
    face.addColorStop(0,tones[0]);face.addColorStop(.42,primary?'#7ee94b':tones[0]);face.addColorStop(1,tones[1]);
    rect(ctx,x+inset,y+inset,w-inset*2,h-inset*2-1,face,r-inset);
    ctx.save();ctx.clip();
    const shine=ctx.createLinearGradient(0,y+inset,0,y+h*.58);
    shine.addColorStop(0,disabled?'rgba(255,255,235,.12)':'rgba(255,255,235,.28)');shine.addColorStop(1,'rgba(255,255,235,0)');
    ctx.fillStyle=shine;ctx.fillRect(x,y,w,h*.58);
    ctx.translate(0,-.5);paint();ctx.restore();
    ctx.beginPath();ctx.moveTo(x+inset,y+r);
    ctx.quadraticCurveTo(x+inset,y+inset,x+r,y+inset);ctx.lineTo(x+w-r,y+inset);
    ctx.quadraticCurveTo(x+w-inset,y+inset,x+w-inset,y+r);
    ctx.strokeStyle=disabled?'rgba(255,255,235,.2)':'rgba(246,255,203,.85)';ctx.lineWidth=1.5;ctx.stroke();
    ctx.restore();
  }
  function button(ctx, layout, id, label, x, y, w, h = 42, primary = false, disabled = false, symbol = null) {
    control(ctx,layout,{id,label,x,y,w,h,disabled},primary&&!disabled?colors.mint:colors.card,Math.min(25,h*.4),()=>{
      const ink=disabled?colors.disabled:primary?'#fffef4':colors.ink;
      const fontSize=h>=54?(primary?20:17):(primary?15:13),weight=primary||h>=54?'bold':'normal';
      if(symbol) {
        icon(ctx,symbol,x+w/2,y+h/2-(symbol==='solve'?5:0),Math.min(14,h*.28),ink);
        if(symbol==='solve')text(ctx,'测试',x+w/2,y+h-10,8,ink,'center');
      } else {
        if(primary&&!disabled) {
          ctx.font=`bold ${fontSize}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.strokeStyle='#379a3b';ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.strokeText(label,x+w/2,y+h/2);
        }
        text(ctx,label,x+w/2,y+h/2,fontSize,ink,'center',weight);
      }
    });
  }
  function heading(ctx, app, layout, title) {
    text(ctx, title, app.width / 2, app.top + 22, 24, colors.ink, 'center', 'bold');
    const backLabel = app.screen === 'settings' && app.settingsReturn === 'game' ? '返回游戏'
      : app.screen === 'checkin' && ['energy','diamond'].includes(app.checkinReturn) ? '返回补给'
      : app.screen === 'classic-size' ? '返回模式选择' : '返回首页';
    button(ctx, layout, 'back', backLabel, 22, app.top, 44, 44,false,false,'back');
    if(app.storageWarning)text(ctx,app.storageWarning,app.width/2,app.top+62,11,colors.gold,'center');
  }
  function gridIcon(ctx, x, y, side, count, color) {
    const gap = side / (count - 1), middle = Math.floor(count / 2);
    ctx.save();
    ctx.strokeStyle = colors.line; ctx.lineWidth = .7;
    for (let i = 0; i < count; i++) {
      ctx.beginPath(); ctx.moveTo(x, y + i * gap); ctx.lineTo(x + side, y + i * gap); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + i * gap, y); ctx.lineTo(x + i * gap, y + side); ctx.stroke();
    }
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y + gap * middle); ctx.lineTo(x + gap * middle, y + gap * middle);
    ctx.lineTo(x + gap * middle, y); ctx.stroke();
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) {
      ctx.fillStyle = row === middle && col === middle ? colors.gold : col === middle || row === middle ? color : '#3b575f';
      const r = row === middle && col === middle ? 2.4 : 1.1;
      ctx.fillRect(x + col * gap - r, y + row * gap - r, r * 2, r * 2);
    }
    ctx.restore();
  }
  function resumeLabel(view, moves) {
    if (view.solved) return view.last ? '重玩本关' : `继续第 ${Number(view.nextNumber)} 关`;
    return moves > 0 ? '继续这局' : `开始第 ${Number(view.number)} 关`;
  }
  function classicChoices(ctx,app,layout) {
    const w=app.width,top=app.top;
    heading(ctx,app,layout,'经典模式');
    [['limited','限步挑战','在步数用完前接通全部道路。'],
     ['relaxed','休闲模式','不限步数，步数越少星级越高。']].forEach(([id,title,body],i)=>{
      const y=top+92+i*156;
      control(ctx,layout,{id:`classic-mode:${id}`,label:title,x:22,y,w:w-44,h:136},colors.card,22,()=>{
      icon(ctx,id==='limited'?'energy':'home',49,y+32,14,colors.gold);
      text(ctx,title,75,y+33,24,colors.ink,'left','bold');
      wrap(ctx,body,40,y+84,w-80,12,colors.muted,2);
      text(ctx,'›',w-44,y+34,24,colors.mint,'right');
      });
    });
    if(app.session!==app.campaign)
      button(ctx,layout,'resume',app.session.failed?'重试当前挑战':`继续${app.session.view().modeName} · ${app.session.modeSize} × ${app.session.modeSize}`,22,top+493,w-44,44,true);
    if(!app.testSupplyEnabled)text(ctx,'新开一局消耗 1 点体力 · 重玩免费',w/2,top+578,11,colors.muted,'center');
  }
  function modes(ctx, app, layout, view) {
    const w = app.width, top = app.top, bw = (w - 56) / 2;
    heading(ctx,app,layout,app.classicMode==='limited'?'限步挑战':'休闲模式');
    view.modes.filter(mode=>mode.size>=5).forEach((mode, i) => {
      const x = 22 + (i % 2) * (bw + 12), y = top + 92 + Math.floor(i / 2) * 84;
      const selected = mode.size === view.modeSize, color = mode.size >= 8 ? colors.gold : colors.mint;
      control(ctx,layout,{id:`classic:${mode.size}`,label:mode.title,x,y,w:bw,h:74},selected?colors.selected:colors.card,13,()=>{
      text(ctx, mode.title, x + 14, y + 22, 22, color, 'left', 'bold');
      text(ctx, mode.name, x + 14, y + 49, 11, colors.muted);
      gridIcon(ctx, x + bw - 46, y + 15, 29, mode.size, color);
      });
    });
    const x=22+bw+12,y=top+260;
    text(ctx,app.profile.data.classicCleared,x+14,y+24,27,colors.gold,'left','bold');
    text(ctx,'已完成局数',x+14,y+49,11,colors.muted);
    if(app.session!==app.campaign && (!app.session.game.result.solved || app.traveling()))
      button(ctx,layout,'resume',`继续 ${app.session.modeSize} × ${app.session.modeSize} 当前局`,22,top+501,w-44,46,true);
  }
  function icon(ctx, kind, x, y, r=12, color=colors.mint, pass=0) {
    if(kind==='star') { star(ctx,x,y,r); return; }
    if(pass===0) { icon(ctx,kind,x,y,r,color,1);icon(ctx,kind,x,y,r,color,2);return; }
    ctx.save();ctx.translate(x,y);ctx.lineJoin='round';ctx.lineCap='round';
    // Thin symbols need a uniform ink stroke; highlights belong on solid shapes.
    let paint=color;
    if(pass===2 && ['energy','diamond','records'].includes(kind)) {
      paint=ctx.createLinearGradient(-r,-r,r,r);
      paint.addColorStop(0,'#f5f4d6');paint.addColorStop(.38,color);paint.addColorStop(1,color);
    }
    ctx.strokeStyle=pass===1?'#fffdf7':paint;ctx.fillStyle=pass===1?'#fffdf7':paint;ctx.lineWidth=pass===1?4.4:2.3;
    if(pass===1) {ctx.shadowColor='rgba(35,54,32,.25)';ctx.shadowBlur=2;ctx.shadowOffsetY=1.4;}
    ctx.beginPath();
    if(kind==='energy') { ctx.moveTo(2,-r); ctx.lineTo(-r*.65,2); ctx.lineTo(-1,2); ctx.lineTo(-2,r); ctx.lineTo(r*.65,-2); ctx.lineTo(1,-2); ctx.closePath(); ctx.fill();if(pass===1)ctx.stroke(); }
    else if(kind==='diamond') { ctx.moveTo(-r*.55,-r*.65); ctx.lineTo(r*.55,-r*.65); ctx.lineTo(r,0); ctx.lineTo(0,r); ctx.lineTo(-r,0); ctx.closePath(); ctx.fill();ctx.stroke();if(pass===2){ctx.strokeStyle='#e7f6ef';ctx.lineWidth=1;}ctx.moveTo(-r,0);ctx.lineTo(r,0);ctx.moveTo(-r*.55,-r*.65);ctx.lineTo(0,r);ctx.lineTo(r*.55,-r*.65);ctx.stroke(); }
    else if(kind==='settings') {
      // A continuous eight-tooth rim stays legible at the toolbar's small size.
      for(let i=0;i<8;i++)for(let j=0;j<6;j++) {
        const offset=j===0?-.5:j===1?-.28:j===2?-.22:j===3?.22:j===4?.28:.5;
        const a=(i+offset)*Math.PI/4,radius=r*(j===2||j===3?1:.72);
        const px=Math.cos(a)*radius,py=Math.sin(a)*radius;
        if(i===0&&j===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
      }
      ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,r*.3,0,Math.PI*2);ctx.stroke();
    }
    else if(kind==='close') {ctx.moveTo(-r*.55,-r*.55);ctx.lineTo(r*.55,r*.55);ctx.moveTo(r*.55,-r*.55);ctx.lineTo(-r*.55,r*.55);ctx.stroke();}
    else if(kind==='ad') {ctx.rect(-r,-r*.75,r*2,r*1.5);ctx.stroke();ctx.beginPath();ctx.moveTo(-r*.25,-r*.4);ctx.lineTo(r*.45,0);ctx.lineTo(-r*.25,r*.4);ctx.closePath();ctx.fill();}
    else if(kind==='recharge') {ctx.arc(0,0,r*.9,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(-r*.4,0);ctx.lineTo(r*.4,0);ctx.moveTo(0,-r*.4);ctx.lineTo(0,r*.4);ctx.stroke();}
    else if(kind==='home') {ctx.moveTo(-r,r*.1);ctx.lineTo(0,-r*.75);ctx.lineTo(r,r*.1);ctx.moveTo(-r*.65,-r*.15);ctx.lineTo(-r*.65,r*.8);ctx.lineTo(r*.65,r*.8);ctx.lineTo(r*.65,-r*.15);ctx.stroke();}
    else if(kind==='checkin') {ctx.rect(-r*.8,-r*.65,r*1.6,r*1.4);ctx.moveTo(-r*.8,-r*.2);ctx.lineTo(r*.8,-r*.2);ctx.moveTo(-r*.4,-r);ctx.lineTo(-r*.4,-r*.4);ctx.moveTo(r*.4,-r);ctx.lineTo(r*.4,-r*.4);ctx.stroke();ctx.beginPath();ctx.moveTo(-r*.4,r*.2);ctx.lineTo(-r*.05,r*.5);ctx.lineTo(r*.45,0);ctx.stroke();}
    else if(kind==='records') {ctx.moveTo(-r*.6,-r*.8);ctx.lineTo(r*.6,-r*.8);ctx.lineTo(r*.45,r*.05);ctx.quadraticCurveTo(0,r*.7,-r*.45,r*.05);ctx.closePath();ctx.fill();ctx.moveTo(0,r*.3);ctx.lineTo(0,r*.85);ctx.moveTo(-r*.45,r*.85);ctx.lineTo(r*.45,r*.85);ctx.stroke();}
    else if(kind==='levels') {for(const dx of [-1,1])for(const dy of [-1,1])ctx.rect(dx*r*.52-r*.27,dy*r*.52-r*.27,r*.54,r*.54);ctx.stroke();}
    else if(kind==='back'||kind==='forward') {const s=kind==='back'?1:-1;ctx.moveTo(s*r*.25,-r*.65);ctx.lineTo(-s*r*.45,0);ctx.lineTo(s*r*.25,r*.65);ctx.stroke();}
    else if(kind==='undo') {ctx.moveTo(-r*.7,-r*.3);ctx.quadraticCurveTo(r*.8,-r*.6,r*.75,r*.45);ctx.moveTo(-r*.7,-r*.3);ctx.lineTo(-r*.2,-r*.85);ctx.moveTo(-r*.7,-r*.3);ctx.lineTo(-r*.2,r*.2);ctx.stroke();}
    else if(kind==='reset') {ctx.arc(0,0,r*.72,-Math.PI*.2,Math.PI*1.45);ctx.stroke();ctx.beginPath();ctx.moveTo(-r*.08,-r*.72);ctx.lineTo(-r*.52,-r*.98);ctx.moveTo(-r*.08,-r*.72);ctx.lineTo(-r*.44,-r*.36);ctx.stroke();}
    else if(kind==='hint') {ctx.arc(0,-r*.2,r*.57,Math.PI*.25,Math.PI*.75,true);ctx.lineTo(-r*.27,r*.6);ctx.lineTo(r*.27,r*.6);ctx.closePath();ctx.stroke();ctx.beginPath();ctx.moveTo(-r*.22,r*.9);ctx.lineTo(r*.22,r*.9);ctx.stroke();}
    else if(kind==='solve') {ctx.moveTo(-r*.7,r*.7);ctx.lineTo(r*.35,-r*.35);ctx.stroke();for(const [sx,sy,s] of [[r*.65,-r*.65,r*.3],[-r*.5,-r*.5,r*.22],[r*.65,r*.4,r*.18]]){ctx.moveTo(sx-s,sy);ctx.lineTo(sx+s,sy);ctx.moveTo(sx,sy-s);ctx.lineTo(sx,sy+s);}ctx.stroke();}
    else {ctx.arc(0,0,r*.85,0,Math.PI*2);ctx.stroke();text(ctx,'?',0,1,pass===1?19:17,pass===1?'#fffdf7':color,'center','bold');}
    ctx.restore();
  }
  function nav(ctx,app,layout) {
    const y=app.height-app.bottom-70,w=app.width,nw=Math.min(300,w-64),left=(w-nw)/2;
    rect(ctx,left,y,nw,66,colors.card,26,colors.light?'#ffffff':colors.line);
    [['home','主页'],['checkin','签到']].forEach(([id,label],i)=>{
      const cx=left+nw*(i+.5)/2,bw=Math.min(110,nw/2-22),active=app.screen===id;
      control(ctx,layout,{id,label,x:cx-bw/2,y:y+9,w:bw,h:48},active?colors.selected:colors.card,20,()=>{
      icon(ctx,id,cx-23,y+33,11,active ? colors.mint : colors.muted);
      text(ctx,label,cx+14,y+33,12,active ? colors.ink : colors.muted,'center');
      });
    });
  }
  function home(ctx,app,layout,view,renderer) {
    const w=app.width,top=app.top,p=app.profile.view(),bw=(w-88)/3;
    const navY=app.height-app.bottom-70,classicY=navY-84,campaignY=classicY-76;
    button(ctx,layout,'settings','设置',16,top,42,42,false,false,'settings');
    [['energy',app.testSupplyEnabled?'∞':`${p.energy}/5`,'energy'],['diamond',app.testSupplyEnabled?'∞':p.diamonds,'diamond'],['star',view.totalHearts,'campaign']].forEach(([kind,value,id],i)=>{
      const x=66+i*(bw+4);
      control(ctx,layout,{id,label:kind,x,y:top,w:bw,h:42},colors.card,14,()=>{
      icon(ctx,kind,x+17,top+21,kind==='star'?11:9,kind==='diamond'?colors.diamond:colors.gold);
      text(ctx,value,x+33,top+22,15,colors.ink,'left','bold');
      });
    });
    if(app.storageWarning)text(ctx,app.storageWarning,w/2,top+68,11,colors.gold,'center');
    text(ctx,'探索新道路',w/2,top+98,31,colors.ink,'center','bold');
    text(ctx,'A   L I T T L E   W A Y   H O M E',w/2,top+129,9,colors.gold,'center');
    const cx=w/2,cy=(top+156+campaignY-40)/2;
    ctx.save();ctx.translate(cx,cy);ctx.scale(.9,.9);ctx.translate(-cx,-cy);
    ctx.save();ctx.strokeStyle=colors.line;ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(cx,cy,89,0,Math.PI*2);ctx.fillStyle=colors.light?'#d2e3ba':colors.card;ctx.fill();
    ctx.beginPath();ctx.moveTo(cx-79,cy+42);ctx.bezierCurveTo(cx-33,cy-4,cx+21,cy+69,cx+79,cy+25);
    ctx.arc(cx,cy,83,.31,2.61);ctx.closePath();ctx.fillStyle=colors.light?'#bbd2a5':'#2a4439';ctx.fill();
    const lines=[[-48,-36,-12,-36,-12,0,0,0],[0,0,34,0,34,-45],[0,0,0,38,42,38],[-45,40,-28,40,-28,0,0,0]];
    ctx.strokeStyle=colors.light?'#967047':'#80603e';ctx.lineWidth=6;ctx.lineJoin='round';ctx.lineCap='round';
    for(const points of lines){ctx.beginPath();for(let i=0;i<points.length;i+=2)i ?ctx.lineTo(cx+points[i],cy+points[i+1]):ctx.moveTo(cx+points[i],cy+points[i+1]);ctx.stroke();}
    ctx.restore();renderer.drawHome(ctx,cx,cy,27,true);
    [[-48,-36],[34,-45],[42,38],[-45,40]].forEach(([dx,dy],i)=>renderer.drawAnimal(ctx,cx+dx,cy+dy,18,i));
    [[-64,-74],[67,-59],[73,61],[-57,81]].forEach(([dx,dy],i)=>star(ctx,cx+dx,cy+dy,i%2?3:4));
    ctx.restore();
    [['records','纪录',36,cy-44],['help','玩法',36,cy+40],['checkin','签到',w-36,cy-44],['energy','补给',w-36,cy+40]].forEach(([id,label,x,y])=>{
      button(ctx,layout,id,label,x-24,y-22,48,48,false,false,id);
      text(ctx,label,x,y+40,10,colors.muted,'center');
    });
    text(ctx,`已完成 ${view.overallCompleted} 关 · 收集 ${view.totalHearts} 颗星`,w/2,campaignY-20,11,colors.muted,'center');
    const mainW=Math.min(260,w-108),secondaryW=mainW-12;
    button(ctx,layout,'campaign','闯关模式',(w-mainW)/2,campaignY,mainW,62,true);
    button(ctx,layout,'classic-modes','经典模式',(w-secondaryW)/2,classicY,secondaryW,54);
    nav(ctx,app,layout);
  }
  function game(ctx, app, layout, renderer, now, view) {
    const w = app.width, top = app.top;
    const journey=app.homecoming && app.homecoming.game===app.session.game ? app.homecoming.view() : null;
    const traveling=journey && !journey.done;
    button(ctx,layout,'home','返回首页',22,top,44,44,false,false,'back');
    button(ctx,layout,view.classic?'classic-sizes':'levels',view.classic?'尺寸':'选关',w-112,top,44,44,false,false,'levels');
    button(ctx,layout,'settings','设置',w-60,top,44,44,false,false,'settings');
    text(ctx,view.classic?`${view.moveLimit?'限步':'休闲'} · ${view.size}×${view.size}`:`第 ${view.number} 关`,w/2,top+22,16,colors.ink,'center','bold');
    const available=app.height-top-app.bottom;
    const size = Math.max(170, Math.min(w-16,available-218));
    const board = { x: (w - size) / 2, y: top+64+Math.min(24,Math.max(0,(available-218-size)*.25)), w: size };
    layout.board = board;
    rect(ctx, board.x, board.y, size, size, colors.card, 16, colors.line);
    ctx.save(); ctx.translate(board.x, board.y);
    renderer.render(ctx, size, app.session.game, now, {journey,light:colors.light,background:colors.bg});
    ctx.restore();
    const bottom = board.y + size;
    text(ctx, view.moveLimit ? `剩余 ${Math.max(0,view.moveLimit-view.moves)} / ${view.moveLimit} 步` : `${view.moves} 次旋转`, w - 22, bottom + 17, 12, colors.gold, 'right');
    if (traveling) {
      text(ctx, '小伙伴正在回家…',22,bottom+17,13,colors.ink);
      rect(ctx,22,bottom+77,w-116,6,colors.line,3);
      if(journey.progress>0)rect(ctx,22,bottom+77,(w-116)*journey.progress,6,'#b6c39a',3);
      button(ctx,layout,'reset','重玩本关',w-74,bottom+54,52,52,false,false,'reset');
    } else if (view.solved) {
      text(ctx, !view.classic && view.last && view.allComplete ? '您已通关' : '恭喜你过关了', 22, bottom + 17, 15, colors.ink, 'left', 'bold');
      stars(ctx, view.stars, 30, bottom + 40, 8, 20);
      text(ctx, `本次 ${view.stars} 颗星 · 最佳 ${view.bestHearts} 颗`, 92, bottom + 40, 12, colors.gold);
      button(ctx, layout, view.classic ? 'classic-next' : view.last ? 'home' : 'next', view.classic ? '生成下一局' : view.last ? '回到首页' : '前往下一关', 22, bottom + 60, (w-54)*.62, 44, true);
      button(ctx,layout,'reset','重玩本关',32+(w-54)*.62,bottom+60,(w-54)*.38,44,false,false,'reset');
    } else {
      if(view.classic) {
        stars(ctx,view.projectedStars,31,bottom+17,8,20);
        text(ctx,'当前可获',91,bottom+17,10,colors.muted);
      }
      const hint = app.session.game.hintCell;
      if (hint) text(ctx, `第 ${hint.y + 1} 行 · 第 ${hint.x + 1} 列，再转 ${hint.turns} 次`, 22, bottom + 37, 12, colors.gold);
      const testing=app.canSolveForTesting(),count=testing?4:3,bw=(w-44-(count-1)*10)/count;
      button(ctx, layout, 'undo', '撤销', 22, bottom + 54, bw, 52, false, !view.canUndo,'undo');
      button(ctx, layout, 'reset', '重玩本关', 32 + bw, bottom + 54, bw, 52,false,false,'reset');
      button(ctx, layout, 'hint', '提示', 42 + bw * 2, bottom + 54, bw, 52, true,false,'hint');
      if(testing)button(ctx,layout,'test-solve','一键解谜',52+bw*3,bottom+54,bw,52,false,false,'solve');
    }
    const rule=view.classic ? `3 星 ≤${view.par} 步 · 2 星 ≤${view.twoStarLimit} 步 · ${view.moveLimit?`上限 ${view.moveLimit} 步`:'其余完成得 1 星'}` : `不用提示 · ${view.par} 步以内可获 3 颗星`;
    text(ctx, app.storageWarning || app.notice || rule, w / 2, bottom + 125, 10, app.storageWarning || app.notice ? colors.gold : colors.muted, 'center');
  }
  function levelArt(ctx, renderer, choice, x, y, w) {
    const palette=(colors.light ? [['#e4efd0','#c0d8aa'],['#e1edc9','#b8d3a2'],['#e9efcd','#c6d8a7']]
      : [['#203a37','#365747'],['#21393e','#365450'],['#29394a','#3c4f5d']])[(choice.size-3)%3];
    rect(ctx,x,y,w,130,palette[0],20);
    ctx.save();ctx.clip();
    ctx.save();ctx.translate(x+w*.65,y+101);ctx.scale(w*.7,66);
    ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fillStyle=palette[1];ctx.fill();ctx.restore();
    ctx.beginPath();ctx.moveTo(x+32,y+64);ctx.lineTo(x+w*.46,y+64);ctx.lineTo(x+w*.46,y+43);ctx.lineTo(x+w-35,y+43);
    ctx.lineWidth=6;ctx.lineJoin='round';ctx.strokeStyle='#bf986c';ctx.stroke();
    renderer.drawHome(ctx,x+w-35,y+43,22,choice.stars>0);
    renderer.drawAnimal(ctx,x+32,y+62,19,(Number(choice.number)-1)%4);
    for(let i=0;i<5;i++) {
      const px=x+15+((i*37+Number(choice.number)*13)%(w-30)),py=y+81+(i%2)*5;
      ctx.strokeStyle='#77927b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px-2,py-3);ctx.lineTo(px,py);ctx.lineTo(px+3,py-4);ctx.stroke();
    }
    ctx.restore();
  }
  function padlock(ctx,x,y) {
    ctx.save();ctx.translate(x,y);ctx.lineWidth=7;ctx.lineCap='round';ctx.strokeStyle='#e7e6d6';
    ctx.shadowColor='rgba(35,45,29,.3)';ctx.shadowBlur=4;ctx.shadowOffsetY=3;
    ctx.beginPath();ctx.moveTo(-12,-1);ctx.lineTo(-12,-15);ctx.arc(0,-15,12,Math.PI,0);ctx.lineTo(12,-1);ctx.stroke();
    const metal=ctx.createLinearGradient(-20,-8,20,29);metal.addColorStop(0,'#efb298');metal.addColorStop(.4,'#cc8b72');metal.addColorStop(1,'#a76953');
    rect(ctx,-25,-8,50,37,metal,11,'#fffdf7');ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.beginPath();ctx.arc(0,6,4,0,Math.PI*2);ctx.fillStyle='#f5e8cd';ctx.fill();
    rect(ctx,-2,7,4,10,'#f5e8cd',2);ctx.restore();
  }
  function levels(ctx, app, layout, view, renderer) {
    const w = app.width, top = app.top;
    heading(ctx, app, layout, '回家之旅');
    const pages = Math.ceil(view.total / LEVELS_PER_PAGE), page = app.levelPage;
    view.choices.slice(page * LEVELS_PER_PAGE, (page + 1) * LEVELS_PER_PAGE).forEach((choice, i) => {
      const bw=(w-56)/2,x=22+(i%2)*(bw+12),y=top+90+Math.floor(i/2)*140;
      control(ctx,layout,{id:`select:${choice.index}`,label:`第 ${choice.number} 关`,x,y,w:bw,h:130,disabled:choice.locked},choice.active?colors.selected:colors.card,20,()=>{
      levelArt(ctx,renderer,choice,x,y,bw);
      if(choice.locked) {rect(ctx,x,y,bw,130,colors.light?'rgba(31,55,35,.44)':'rgba(3,12,17,.65)',20);padlock(ctx,x+bw/2,y+48);}
      ctx.save();rect(ctx,x,y,bw,130,'rgba(0,0,0,0)',20);ctx.clip();
      rect(ctx,x,y+92,bw,38,colors.card,0);ctx.restore();
      rect(ctx,x+8,y+8,46,21,choice.active?colors.mint:colors.light?'rgba(246,250,237,.94)':'rgba(6,18,22,.72)',7);
      text(ctx,`第 ${choice.number} 关`,x+31,y+19,10,choice.active?colors.primaryInk:colors.ink,'center','bold');
      if(choice.stars) {
        stars(ctx,choice.stars,x+18,y+111,8,20);text(ctx,'重玩',x+bw-12,y+112,11,colors.mint,'right');
      } else text(ctx,choice.locked?choice.statusText:'开始',x+bw/2,y+111,choice.locked?10:12,choice.locked?colors.muted:colors.mint,'center');
      });
    });
    button(ctx, layout, 'page-prev', '上一页', 22, top + 527, 68, 36, false, page === 0,'back');
    button(ctx, layout, 'page-next', '下一页', w - 90, top + 527, 68, 36, false, page === pages - 1,'forward');
    button(ctx, layout, 'resume', app.traveling() ? '继续动物回家' : resumeLabel(view, view.moves), 22, top + 576, w - 44, 40, true);
  }
  function settings(ctx, app, layout) {
    const w = app.width, top = app.top;
    heading(ctx,app,layout,'设置');
    ['music', 'sound'].forEach((kind, i) => {
      const player = app[kind], value=player.enabled?player.volume:0, y = top + 82 + i * 146;
      rect(ctx, 22, y, w - 44, 126, colors.card, 18, colors.line);
      text(ctx, kind === 'music' ? '背景音乐' : '游戏音效', 38, y + 30, 17, colors.ink, 'left', 'bold');
      const x = 42, trackW = w - 137, trackY = y + 84;
      rect(ctx, x, trackY - 3, trackW, 6, colors.line, 3);
      if (value > 0) rect(ctx, x, trackY - 3, trackW * value, 6, kind === 'music' ? colors.gold : colors.mint, 3);
      ctx.beginPath(); ctx.arc(x + trackW * value, trackY, 9, 0, Math.PI * 2);
      ctx.fillStyle = kind === 'music' ? colors.gold : colors.mint; ctx.fill();
      text(ctx, `${Math.round(value * 100)}%`, w - 39, trackY, 14, colors.ink, 'right');
      layout.targets.push({ kind: 'slider', id: kind, x: x - 12, y: trackY - 22, w: trackW + 24, h: 44, trackX: x, trackW });
    });
    const night=app.profile.view().nightMode,y=top+374;
    rect(ctx,22,y,w-44,76,colors.card,18,colors.line);
    text(ctx,'黑夜模式',38,y+38,17,colors.ink,'left','bold');
    button(ctx,layout,'night-mode',night?'已开启':'已关闭',w-122,y+20,84,36,night);
    if(app.notice&&!app.storageWarning)wrap(ctx,app.notice,26,top+476,w-52,12,colors.muted,3);
  }
  function checkin(ctx,app,layout) {
    const w=app.width,top=app.top,p=app.profile.view(),progress=p.canClaim?p.nextStreak-1:p.streak;
    heading(ctx,app,layout,'每日签到');
    const bw=(w-62)/4;
    for(let i=0;i<7;i++) {
      const x=22+(i%4)*(bw+6),y=top+100+Math.floor(i/4)*91,claimed=i<progress;
      rect(ctx,x,y,bw,79,claimed?colors.line:colors.card,12,i+1===p.nextStreak&&p.canClaim?colors.mint:colors.line);
      text(ctx,`第 ${i+1} 天`,x+bw/2,y+17,11,colors.muted,'center');
      icon(ctx,'diamond',x+bw/2,y+40,9,claimed?colors.muted:colors.diamond);
      text(ctx,claimed?'已领取':`+${i===6?50:20}`,x+bw/2,y+63,12,claimed?colors.muted:colors.ink,'center');
    }
    text(ctx,'每日零点更新（北京时间）· 断签从第 1 天开始',w/2,top+304,11,colors.muted,'center');
    button(ctx,layout,'claim',p.canClaim?`领取 ${p.checkinReward} 钻石`:'今天已签到',30,top+354,w-60,46,true,!p.canClaim);
    if(app.notice)text(ctx,app.notice,w/2,top+435,11,colors.gold,'center');
    nav(ctx,app,layout);
  }
  function resources(ctx,app,layout) {
    const energy=app.screen==='energy',p=app.profile.view(),testing=app.testSupplyEnabled;
    const pw=Math.min(322,app.width-44),ph=energy?432:380,x=(app.width-pw)/2;
    const y=app.top+(app.height-app.top-app.bottom-ph)/2,cx=app.width/2;
    const choice=app.energyChoice(),ready=testing||!choice.needsEnergy||p.energy>0;
    ctx.fillStyle=colors.veil;ctx.fillRect(0,0,app.width,app.height);
    rect(ctx,x,y,pw,ph,colors.panel,26,colors.panelLine);
    // Only the dialog owns input; the original page remains visible underneath.
    layout.targets.length=0;layout.board=null;
    text(ctx,energy?'获得体力':'获得钻石',cx,y+32,23,colors.ink,'center','bold');
    button(ctx,layout,'back','关闭弹窗',x+pw-49,y+12,36,36,false,false,'close');
    rect(ctx,x+22,y+66,pw-44,140,colors.selected,20);
    icon(ctx,energy?'energy':'diamond',cx,y+120,37,energy?colors.gold:colors.diamond);
    text(ctx,testing?'∞':energy?`${p.energy} / 5`:p.diamonds,cx,y+178,30,colors.ink,'center','bold');
    const seconds=Math.ceil(p.remaining/1000);
    if(energy&&!testing)text(ctx,p.energy===5?'体力已满':`下次恢复 ${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`,cx,y+225,12,colors.muted,'center');
    const actions=energy?
      [['ad','广告','ad',true,'暂未开放'],['refill','钻石补给','diamond',testing||p.energy===5||p.diamonds<20,testing?'':'20 钻换 1 点'],['checkin','签到','checkin',false,'']]:
      [['ad','广告','ad',true,'暂未开放'],['checkin','签到','checkin',false,''],['recharge','充值','recharge',true,'暂未开放']];
    const gap=10,bw=(pw-44-gap*2)/3;
    actions.forEach(([id,label,symbol,disabled,note],i)=>{
      const ax=x+22+i*(bw+gap);
      control(ctx,layout,{id,label,x:ax,y:y+246,w:bw,h:66,disabled},colors.card,20,()=>{
        icon(ctx,symbol,ax+bw/2,y+267,12,disabled?colors.disabled:colors.ink);
        text(ctx,label,ax+bw/2,y+297,12,disabled?colors.disabled:colors.ink,'center');
      });
      if(note)text(ctx,note,ax+bw/2,y+327,10,colors.muted,'center');
    });
    const message=app.storageWarning||app.notice||(energy&&!testing?`拥有 ${p.diamonds} 钻石 · 每 30 分钟恢复 1 点体力`:'');
    if(message)wrap(ctx,message,x+22,y+351,pw-44,11,colors.gold,2);
    if(energy)button(ctx,layout,'energy-continue',choice.label,x+22,y+380,pw-44,36,ready,!ready);
  }
  function records(ctx,app,layout) {
    const w=app.width,top=app.top,p=app.profile.view();
    heading(ctx,app,layout,'个人纪录');
    const bw=(w-60)/3;
    [['limited','限步挑战'],['classic','休闲模式'],['campaign','闯关纪录']].forEach(([id,label],i)=>
      button(ctx,layout,`record-kind:${id}`,label,22+i*(bw+8),top+98,bw,36,app.recordKind===id));
    const first=app.recordKind==='campaign'?3:5;
    for(let size=first;size<=9;size++) {
      const record=p.records.find(r=>r.kind===app.recordKind&&r.size===size),y=top+151+(size-first)*58;
      rect(ctx,22,y,w-44,50,colors.card,11,colors.line);
      text(ctx,`${size} × ${size}`,38,y+25,17,colors.mint,'left','bold');
      if(record){stars(ctx,record.stars,127,y+25,9,22);text(ctx,`${record.moves} 次旋转`,w-37,y+25,12,colors.gold,'right');}
      else text(ctx,'还没有完成纪录',116,y+25,12,colors.muted);
    }
    text(ctx,'本机纪录',w/2,top+583,11,colors.muted,'center');
  }
  function help(ctx,app,layout) {
    const w=app.width,top=app.top;
    heading(ctx,app,layout,'回家指南');
    [['01','转动小路','点击格子旋转道路，接通房子的路会变深。'],['02','接动物回家','接通全部道路，不留断口，动物就能回家。'],['03','经典双模式','限步用完即失败；休闲不限步数。最少步数三星，二倍以内二星，其余完成一星。']].forEach(([n,title,body],i)=>{
      const y=top+82+i*116;rect(ctx,22,y,w-44,100,colors.card,16,colors.line);text(ctx,n,38,y+26,20,colors.gold,'left','bold');text(ctx,title,82,y+27,16,colors.ink,'left','bold');wrap(ctx,body,38,y+58,w-76,12,colors.muted,2);
    });
    [['undo','撤销'],['reset','重玩'],['hint','提示']].forEach(([kind,label],i)=>{
      const x=58+i*(w-100)/3;icon(ctx,kind,x,top+482,11);text(ctx,label,x+19,top+482,11,colors.muted);
    });
    button(ctx,layout,'campaign','开始闯关',30,top+514,w-60,46,true);
  }
  function celebrationConfetti(ctx,app,x,y,w,h,elapsed) {
    if(elapsed<0||elapsed>=5000)return;
    const cx=x+w/2,areaH=app.height-app.top-app.bottom,bottom=app.height-app.bottom;
    // Fade near important content, rather than drawing over it or cutting pieces abruptly.
    const clearAreas=[
      [cx-90,y+16,180,20], [cx-114,y+44,228,36], [cx-100,y+82,200,18],
      [cx-100,y+187,200,24], [cx-115,y+217,230,18], [cx-115,y+240,230,17],
      [cx-74,y+286,148,19], [cx-60,y+338,120,19], [x+28,y+384,w-56,18]
    ];
    ctx.save();ctx.beginPath();ctx.rect(0,app.top,app.width,app.height-app.top-app.bottom);ctx.clip();
    for(let i=0;i<confettiPieces.length;i++) {
      const piece=confettiPieces[i];
      // Inward launches lose horizontal speed, then flutter down through the foreground.
      const age=elapsed-piece.delay,t=age/piece.duration;
      if(age<=0||age>=piece.duration)continue;
      const startX=piece.side===1?4:app.width-4,startY=piece.sideLaunch?app.top+areaH*piece.launch:bottom+8;
      const rise=areaH*(piece.sideLaunch?.48+piece.rise*.4:.72+piece.rise*.35);
      const px=startX+piece.side*app.width*piece.reach*(1-Math.exp(-5*t))
        +Math.sin(piece.wave+t*11)*piece.sway*t;
      const py=startY-4*rise*t*(1-t)+areaH*.16*t*t;
      if(px<-16||px>app.width+16||py<app.top-16||py>bottom+16)continue;
      let opacity=soften(elapsed/220)*soften(age/120)*(1-soften((t-.86)/.14))*.96;
      for(const [rx,ry,rw,rh] of clearAreas) {
        const dx=Math.max(rx-px,0,px-rx-rw),dy=Math.max(ry-py,0,py-ry-rh);
        opacity*=.12+.88*soften((Math.hypot(dx,dy)-2)/10);
      }
      if(opacity<.01)continue;
      const flip=Math.cos(piece.wave+t*piece.spin*2);
      ctx.save();ctx.globalAlpha=opacity;ctx.translate(px,py);ctx.rotate(i*2.399+t*piece.spin*piece.side);
      ctx.scale(Math.max(.12,Math.abs(flip)),.85+.15*Math.sin(piece.wave+t*8));
      ctx.fillStyle=confettiColors[piece.color][flip<0?1:0];
      ctx.fillRect(-piece.width/2,-piece.height/2,piece.width,piece.height);
      ctx.strokeStyle='rgba(255,253,247,.65)';ctx.lineWidth=.4;
      ctx.strokeRect(-piece.width/2,-piece.height/2,piece.width,piece.height);ctx.restore();
    }
    ctx.restore();
  }
  function celebration(ctx, app, layout, view, now) {
    const w = app.width, panelW = w - 44, panelH = 422;
    const x = 22, y = app.top + (app.height - app.top - app.bottom - panelH) / 2;
    const elapsed = Math.max(0, now - app.celebration.startedAt);
    ctx.fillStyle = colors.veil; ctx.fillRect(0, 0, w, app.height);
    rect(ctx, x, y, panelW, panelH, colors.panel, 24, colors.panelLine);
    const finished=!view.classic && view.last && view.allComplete;
    text(ctx, finished ? '您已通关' : '恭喜你过关了', w / 2, y + 62, 27, colors.ink, 'center', 'bold');
    text(ctx,view.classic ? `${view.modeName} · ${view.modeTitle} · ${view.moves} 步` : finished ? '所有小伙伴都回家啦' : `第 ${view.number} 关 · ${view.name}`, w / 2, y + 92, 12, colors.muted, 'center');
    // Keep flying stars inside their mounting area, clear of the title and score.
    ctx.save();ctx.beginPath();ctx.rect(x+12,y+105,panelW-24,85);ctx.clip();
    for (let i = 0; i < 3; i++) {
      const sx=w/2+(i-1)*72,sy=y+149,r=i===1?31:27,a=arrival(elapsed,i);
      star(ctx,sx,sy,r,false);
      if(a.rank>=view.stars||!a.visible)continue;
      flyingStar(ctx,sx,sy,r,a);
    }
    ctx.restore();
    text(ctx, `本次获得 ${view.stars} 颗星`, w / 2, y + 199, 18, colors.gold, 'center', 'bold');
    text(ctx,view.classic ? `经典模式已完成 ${app.profile.data.classicCleared} 局` : `本关最佳 ${view.bestHearts} 颗 · 累计收集 ${view.totalHearts} 颗`,w/2,y+226,12,colors.muted,'center');
    text(ctx,app.storageWarning || (app.celebration.reward ? `通关奖励 +${app.celebration.reward} 钻石` : '最佳成绩已保留'),w/2,y+248,11,colors.gold,'center');
    // The overlay owns all input. Tapping outside it cannot rotate the board.
    layout.targets.length = 0; layout.board = null;
    button(ctx, layout, view.classic ? 'classic-next' : view.last ? 'home' : 'next', view.classic ? '生成下一局' : view.last ? '回到首页' : `继续第 ${Number(view.nextNumber)} 关`, x + 18, y + 273, panelW - 36, 44, true);
    button(ctx,layout,'reset','重玩本关',x+18,y+327,panelW-36,40);
    const half = (panelW - 46) / 2;
    button(ctx, layout, 'celebration-close', '查看棋盘', x + 18, y + 377, view.last ? panelW-36 : half, 30);
    if(!view.last)button(ctx, layout, 'home', '回到首页', x + 28 + half, y + 377, half, 30);
    celebrationConfetti(ctx,app,x,y,panelW,panelH,elapsed);
  }
  function failure(ctx,app,layout,view) {
    const w=app.width,pw=w-44,x=22,y=app.top+(app.height-app.top-app.bottom-285)/2;
    ctx.fillStyle=colors.veil;ctx.fillRect(0,0,w,app.height);
    rect(ctx,x,y,pw,285,colors.panel,24,colors.panelLine);
    text(ctx,'挑战失败',w/2,y+41,26,colors.ink,'center','bold');
    text(ctx,`${view.moveLimit} 步已用完，小伙伴还没能回家`,w/2,y+79,12,colors.muted,'center');
    layout.targets.length=0;layout.board=null;
    button(ctx,layout,'reset','重玩本局 · 不扣体力',x+18,y+132,pw-36,44,true);
    button(ctx,layout,'classic-next',app.testSupplyEnabled?'换一局 · 无限体力':'换一局 · 1 点体力',x+18,y+187,pw-36,38);
    button(ctx,layout,'classic-modes','返回模式选择',x+18,y+238,pw-36,30);
  }
  function render(ctx, app, renderer, now) {
    const layout = { targets: [], board: null, press:app.buttonPress, now };
    colors = { ...baseColors, ...app.profile.view(now).themeInfo };
    ctx.save();
    ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, app.width, app.height);
    const view = app.session.view();
    const modal=['energy','diamond'].includes(app.screen),screen=modal?app.energyReturn:app.screen;
    if (screen === 'home') home(ctx, app, layout, app.campaign.view(),renderer);
    if (screen === 'classic') classicChoices(ctx,app,layout);
    if (screen === 'classic-size') modes(ctx,app,layout,app.campaign.view());
    if (screen === 'game') game(ctx, app, layout, renderer, now, view);
    if (screen === 'levels') levels(ctx, app, layout, view, renderer);
    if (screen === 'settings') settings(ctx, app, layout);
    if (screen === 'checkin') checkin(ctx,app,layout);
    if (screen === 'records') records(ctx,app,layout);
    if (screen === 'help') help(ctx,app,layout);
    if (screen === 'game' && view.solved && app.celebration && app.celebration.game === app.session.game) celebration(ctx, app, layout, view, now);
    if (screen === 'game' && view.failed) failure(ctx,app,layout,view);
    if(modal)resources(ctx,app,layout);
    if(app.grain) {ctx.globalAlpha=colors.light ? .45 : .2;ctx.fillStyle=app.grain;ctx.fillRect(0,0,app.width,app.height);}
    ctx.restore();
    return layout;
  }
  return { render, LEVELS_PER_PAGE, arrival, createGrain };
}));
