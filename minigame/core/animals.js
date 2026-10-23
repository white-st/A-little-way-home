(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AnimalArt = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function oval(ctx, x, y, rx, ry, color) {
    ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);
    ctx.fillStyle=color;ctx.fill();ctx.restore();
  }
  function polygon(ctx, points, color) {
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=color;ctx.fill();
  }
  function ovalPath(ctx,x,y,rx,ry) {
    ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);ctx.moveTo(1,0);ctx.arc(0,0,1,0,Math.PI*2);ctx.closePath();ctx.restore();
  }
  function polygonPath(ctx,points) {
    points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
  }
  function surface(ctx,light,base,dark) {
    const paint=ctx.createLinearGradient(-.7,-1,.65,.9);
    paint.addColorStop(0,light);paint.addColorStop(.48,base);paint.addColorStop(1,dark);return paint;
  }
  function whiteOutline(ctx,radius) {
    // Stroke the complete silhouette underneath the artwork, without white seams.
    ctx.fillStyle='#fffdf7';ctx.strokeStyle='#fffdf7';ctx.lineJoin='round';
    ctx.lineWidth=2*Math.max(.85,Math.min(2.3,radius*.07))/radius;
    ctx.shadowColor='rgba(35,54,32,.28)';ctx.shadowBlur=Math.max(1.5,radius*.14);
    ctx.shadowOffsetX=Math.max(.4,radius*.045);ctx.shadowOffsetY=Math.max(.8,radius*.09);ctx.fill();
    ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;ctx.stroke();
  }
  function drawAnimal(ctx, x, y, radius, kind = 0, stride = 0, walking = false, facing = 1) {
    const type=((kind%4)+4)%4;
    const bob=walking?Math.sin(stride)*.06:0;
    ctx.save();ctx.translate(x,y);ctx.scale(radius,radius);
    ctx.translate(0,bob);
    const tones=[['#f7dfa9','#d6b57a','#ac7e49'],['#fffdf1','#e8e3d2','#bab8a3'],
      ['#f3bc94','#c78b6a','#995d43'],['#ddc5a9','#ad917a','#816754']][type];
    const fur=surface(ctx,...tones),cream=surface(ctx,'#fff9e9','#f1e6ce','#d2b991');
    // Feet alternate during travel; the face remains upright around road corners.
    const step=walking?Math.sin(stride)*.13:0;
    ctx.beginPath();
    ovalPath(ctx,-.3,.64+step,.18,.2);ovalPath(ctx,.3,.64-step,.18,.2);
    ovalPath(ctx,facing<0?.58:-.58,.35,.26,.21);ovalPath(ctx,0,.3,.52,.49);
    if(type===1) {
      ovalPath(ctx,-.33,-.77,.2,.51);ovalPath(ctx,.33,-.77,.2,.51);
    } else if(type===3) {
      ovalPath(ctx,-.47,-.58,.28,.28);ovalPath(ctx,.47,-.58,.28,.28);
    } else {
      polygonPath(ctx,[[-.65,-.37],[-.57,-.94],[-.08,-.53]]);
      polygonPath(ctx,[[.65,-.37],[.57,-.94],[.08,-.53]]);
    }
    ovalPath(ctx,0,-.23,.7,.58);whiteOutline(ctx,radius);
    oval(ctx,-.3,.64+step,.18,.2,fur);oval(ctx,.3,.64-step,.18,.2,fur);
    oval(ctx,facing<0?.58:-.58,.35,.26,.21,fur);
    oval(ctx,0,.3,.52,.49,fur);oval(ctx,0,.36,.3,.32,cream);
    if(type===1) {
      oval(ctx,-.33,-.77,.2,.51,fur);oval(ctx,.33,-.77,.2,.51,fur);
      oval(ctx,-.33,-.79,.085,.33,'#cba89b');oval(ctx,.33,-.79,.085,.33,'#cba89b');
    } else if(type===3) {
      oval(ctx,-.47,-.58,.28,.28,fur);oval(ctx,.47,-.58,.28,.28,fur);
      oval(ctx,-.47,-.58,.14,.14,'#e4c6b1');oval(ctx,.47,-.58,.14,.14,'#e4c6b1');
    } else {
      polygon(ctx,[[-.65,-.37],[-.57,-.94],[-.08,-.53]],fur);
      polygon(ctx,[[.65,-.37],[.57,-.94],[.08,-.53]],fur);
      polygon(ctx,[[-.53,-.45],[-.5,-.76],[-.24,-.49]],'#d49b8d');
      polygon(ctx,[[.53,-.45],[.5,-.76],[.24,-.49]],'#d49b8d');
    }
    oval(ctx,0,-.23,.7,.58,fur);
    // A small soft crown highlight gives the rounded face depth at every size.
    oval(ctx,-.17,-.51,.29,.13,'rgba(255,255,241,.18)');
    if(type===2) {
      polygon(ctx,[[-.62,-.22],[-.1,-.04],[0,.26],[-.42,.12]],'#f2e8d3');
      polygon(ctx,[[.62,-.22],[.1,-.04],[0,.26],[.42,.12]],'#f2e8d3');
    } else oval(ctx,0,.02,.32,.23,'#f2e8d3');
    if(type===0) {
      polygon(ctx,[[-.16,-.73],[0,-.44],[.16,-.73]],'#bc8d56');
    }
    oval(ctx,-.24,-.22,.065,.085,'#394c3c');oval(ctx,.24,-.22,.065,.085,'#394c3c');
    oval(ctx,0,-.015,.075,.055,'#6d5147');
    ctx.strokeStyle='#805d4b';ctx.lineWidth=.035;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(0,.03);ctx.quadraticCurveTo(0,.14,.13,.1);ctx.moveTo(0,.03);ctx.quadraticCurveTo(0,.14,-.13,.1);ctx.stroke();
    ctx.restore();
  }
  function drawHome(ctx, x, y, radius, welcome = false) {
    ctx.save();ctx.translate(x,y);ctx.scale(radius,radius);
    ctx.beginPath();ctx.rect(-.71,-.23,1.42,.94);ctx.rect(.38,-.87,.22,.5);
    polygonPath(ctx,[[-1,-.18],[-.04,-1.04],[1,-.18]]);
    ovalPath(ctx,-.77,.58,.29,.2);ovalPath(ctx,.78,.58,.26,.21);whiteOutline(ctx,radius);
    ctx.fillStyle=surface(ctx,'#fff7d9','#eee0bc','#c8b58b');ctx.fillRect(-.71,-.23,1.42,.94);
    ctx.fillStyle='rgba(122,102,67,.15)';ctx.fillRect(.42,-.23,.29,.94);
    ctx.fillStyle=surface(ctx,'#e4ad8a','#bb856b','#925d4b');ctx.fillRect(.38,-.87,.22,.5);
    polygon(ctx,[[-1,-.18],[-.04,-1.04],[1,-.18]],surface(ctx,'#f3c3a4','#c38d71','#965e49'));
    polygon(ctx,[[-1,-.18],[1,-.18],[.71,-.05],[-.71,-.05]],'rgba(107,64,43,.22)');
    ctx.beginPath();ctx.moveTo(-.83,-.24);ctx.lineTo(-.04,-.94);ctx.lineTo(.8,-.24);
    ctx.lineWidth=.045;ctx.strokeStyle='rgba(255,236,201,.66)';ctx.lineJoin='round';ctx.stroke();
    ctx.fillStyle=surface(ctx,'#abc28b','#739067','#4e6a48');ctx.fillRect(-.2,.15,.4,.56);
    oval(ctx,.1,.44,.033,.033,'#e7d29d');
    ctx.fillStyle='#fff0c9';ctx.fillRect(-.59,.06,.27,.29);ctx.fillRect(.32,.06,.27,.29);
    ctx.fillStyle=surface(ctx,'#fff0ac',welcome?'#e8c477':'#c8b783','#ab965d');ctx.fillRect(-.57,.08,.23,.25);ctx.fillRect(.34,.08,.23,.25);
    oval(ctx,-.77,.58,.29,.2,surface(ctx,'#bdd5a0','#83a074','#557649'));
    oval(ctx,.78,.58,.26,.21,surface(ctx,'#cde2ac','#91aa7f','#60814e'));
    ctx.restore();
  }
  return { drawAnimal, drawHome };
}));
