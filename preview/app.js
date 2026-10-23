/* global LightSession, LightRenderer, LightEngine, LightSound, LightMusic, createBrowserSoundVoice, createBrowserMusicVoice */
(() => {
  const { Session, STORAGE_KEY } = LightSession;
  const $ = id => document.getElementById(id);
  const notify = message => { $('status').textContent = message; $('status').hidden = false; };
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); }
  catch (error) { notify('进度读取失败，本次仍可正常游玩。'); }
  const session = new Session(saved);
  let soundSaved;
  try { soundSaved = JSON.parse(localStorage.getItem(LightSound.STORAGE_KEY)); }
  catch (error) { soundSaved = false; notify('音效设置读取失败，已暂时静音，可手动开启。'); }
  function readVolume(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch (error) { notify('音量设置读取失败，已使用默认音量。'); }
  }
  const sound = new LightSound.SoundEffects({ saved: soundSaved, savedVolume: readVolume(LightSound.VOLUME_KEY), createVoice: createBrowserSoundVoice, onError: () => notify('音效暂时无法播放，游戏仍可继续。') });
  sound.setActive(!document.hidden);
  let musicSaved;
  try { musicSaved = JSON.parse(localStorage.getItem(LightMusic.STORAGE_KEY)); }
  catch (error) { musicSaved = false; notify('音乐设置读取失败，已暂时关闭，可手动开启。'); }
  const music = new LightMusic.BackgroundMusic({ saved: musicSaved, savedVolume: readVolume(LightMusic.VOLUME_KEY), createVoice: createBrowserMusicVoice, onError: () => notify('背景音乐暂时无法播放，游戏仍可继续。') });
  music.setActive(!document.hidden);
  function refreshMusic() {
    $('music-toggle').setAttribute('aria-checked', String(music.enabled));
    $('music-toggle').title = music.enabled ? '关闭背景音乐' : '开启背景音乐';
    $('music-label').textContent = music.enabled ? '音乐 开' : '音乐 关';
  }
  $('music-toggle').addEventListener('click', () => {
    music.setEnabled(!music.enabled);
    if (music.enabled) music.interact();
    refreshMusic();
    try { localStorage.setItem(LightMusic.STORAGE_KEY, JSON.stringify(music.enabled)); }
    catch (error) { notify('音乐设置未能保存，本次切换仍然有效。'); }
  });
  refreshMusic();
  function refreshSound() {
    $('sound-toggle').setAttribute('aria-checked', String(sound.enabled));
    $('sound-toggle').title = sound.enabled ? '关闭音效' : '开启音效';
    $('sound-label').textContent = sound.enabled ? '音效 开' : '音效 关';
  }
  $('sound-toggle').addEventListener('click', () => {
    sound.setEnabled(!sound.enabled);
    refreshSound();
    try { localStorage.setItem(LightSound.STORAGE_KEY, JSON.stringify(sound.enabled)); }
    catch (error) { notify('音效设置未能保存，本次切换仍然有效。'); }
  });
  refreshSound();
  for (const [name, player, key] of [['music', music, LightMusic.VOLUME_KEY], ['sound', sound, LightSound.VOLUME_KEY]]) {
    const input = $(`${name}-volume`), output = $(`${name}-volume-value`);
    const refreshVolume = () => {
      const percent = Math.round(player.volume * 100);
      input.value = percent;
      input.style.setProperty('--volume', `${percent}%`);
      input.setAttribute('aria-valuetext', `${percent}%`);
      output.textContent = `${percent}%`;
    };
    input.addEventListener('input', () => {
      player.setVolume(Number(input.value) / 100);
      refreshVolume();
      try { localStorage.setItem(key, JSON.stringify(player.volume)); }
      catch (error) { notify('音量未能保存，本次调整仍然有效。'); }
    });
    refreshVolume();
  }
  const canvas = $('board');
  const context = canvas.getContext('2d');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let frame = null;
  let controlLevel = -1;
  let selectedSection = session.game.level.section;
  let previousSolved = false;

  function draw(time = performance.now()) { if (width) LightRenderer.render(context, width, session.game, time, { reducedMotion: motion.matches }); }
  function animate(time) { frame = null; draw(time); if (!document.hidden && !motion.matches) frame = requestAnimationFrame(animate); }
  function start() { if (frame == null && !document.hidden && !motion.matches) frame = requestAnimationFrame(animate); }
  function refresh() {
    const view = session.view();
    if (controlLevel !== view.index) selectedSection = view.section;
    $('chapter').textContent = view.chapter;
    $('chapter-title').textContent = view.sectionTitle;
    $('level-name').textContent = view.name;
    $('description').textContent = view.description;
    $('stage-number').textContent = view.number;
    $('stage-total').textContent = `/ ${view.totalText}`;
    $('lamp-counter').textContent = `点亮 ${view.lit} / ${view.nodes}`;
    $('moves').textContent = view.moves;
    $('tip-text').textContent = view.tip;
    $('star-rule').textContent = `无提示 · ${view.par} 步以内可获三星`;
    $('completion').textContent = `${view.completed} / ${view.total}`;
    $('progress-fill').style.width = `${view.completed / view.total * 100}%`;
    $('grid-size').textContent = `${view.size} × ${view.size}`;
    $('undo').disabled = !view.canUndo;
    $('hint').disabled = view.solved;
    $('tip-panel').hidden = view.solved;
    $('success-panel').hidden = !view.solved;
    $('stars').textContent = view.starText;
    $('success-label').textContent = view.last ? '旅程完成' : '全网已接通';
    $('success-title').textContent = view.last ? '整片星河，都亮起来了。' : '每个节点，都有了光。';
    $('success-note').textContent = `${view.moves} 次旋转 · ${view.stars === 3 ? '完美路线' : '再试一次，挑战三星'}${view.last ? ` · 已完成全部 ${view.total} 关` : ''}`;
    $('next').textContent = view.last ? '再玩一次' : '前往下一关';
    renderNavigation(view);
    if (controlLevel !== view.index) {
      $('wire-controls').replaceChildren(...session.game.pieces.map((piece, index) => {
        const button = document.createElement('button');
        button.className = 'wire-control';
        button.dataset.x = piece.x; button.dataset.y = piece.y;
        button.dataset.index = index;
        button.addEventListener('click', () => action('rotate', piece.x, piece.y));
        return button;
      }));
      controlLevel = view.index;
    }
    document.querySelectorAll('.wire-control').forEach(button => {
      const index = Number(button.dataset.index), piece = session.game.pieces[index];
      const powered = session.game.result.lit.includes(index);
      const source = piece.x === session.game.level.source.x && piece.y === session.game.level.source.y;
      button.disabled = view.solved;
      button.setAttribute('aria-label', `旋转线路 第${piece.y + 1}行第${piece.x + 1}列，${source ? '中央电源' : LightEngine.shapeName(piece)}，接口朝${LightEngine.portNames(piece)}，${powered ? '已通电' : '未通电'}`);
      button.title = `${source ? '中央电源' : LightEngine.shapeName(piece)} · 接口朝${LightEngine.portNames(piece)} · 点击旋转`;
    });
    positionControls();
    draw();
    if (view.solved && !previousSolved) $('next').focus({ preventScroll: true });
    previousSolved = view.solved;
  }
  function renderNavigation(view) {
    $('chapter-tabs').replaceChildren(...view.sections.map(section => {
      const button = document.createElement('button');
      button.className = `chapter-tab${section.index === selectedSection ? ' selected' : ''}`;
      button.setAttribute('aria-label', `浏览${section.title}`);
      button.setAttribute('aria-pressed', String(section.index === selectedSection));
      button.innerHTML = `${section.name}<small>${section.completed}/${section.choices.length}</small>`;
      button.addEventListener('click', () => { selectedSection = section.index; renderNavigation(session.view()); });
      return button;
    }));
    const section = view.sections[selectedSection];
    $('level-section-title').textContent = `${section.title} · ${section.choices[0].number}—${section.choices.at(-1).number}`;
    $('level-list').replaceChildren(...section.choices.map(level => {
      const button = document.createElement('button');
      button.className = `level-button${level.active ? ' active' : ''}`;
      button.disabled = level.locked;
      button.setAttribute('aria-label', `第${level.index + 1}关 ${level.name}${level.locked ? `，${level.statusText}` : ''}`);
      button.title = level.statusText;
      if (level.active) button.setAttribute('aria-current', 'step');
      button.innerHTML = `<span class="level-number">${level.number}</span><span class="level-copy">${level.name}<small class="level-status">${level.stars ? '★'.repeat(level.stars) : level.statusText}</small></span>${level.locked ? '<span class="level-lock"></span>' : `<span class="level-arrow">${level.active ? '●' : '·'}</span>`}`;
      button.addEventListener('click', () => {
        if (session.select(level.index)) { music.interact(); sound.stop(); refresh(); window.scrollTo({ top: 0, behavior: motion.matches ? 'instant' : 'smooth' }); }
      });
      return button;
    }));
  }
  function positionControls() {
    const { padding, cell } = LightRenderer.geometry(width, session.game.level.size);
    document.querySelectorAll('.wire-control').forEach(button => {
      button.style.left = `${padding + Number(button.dataset.x) * cell}px`;
      button.style.top = `${padding + Number(button.dataset.y) * cell}px`;
      button.style.width = `${cell}px`; button.style.height = `${cell}px`;
    });
  }
  function action(name, x, y) {
    const before = LightSound.snapshot(session.game);
    if (!session.act(name, x, y)) return;
    music.interact();
    sound.afterAction(before, session.game, name);
    if (name === 'restart') selectedSection = session.game.level.section;
    if (session.game.result.solved || name === 'restart') {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session.progress)); }
      catch (error) { notify('进度未能保存，关闭后可能丢失。'); }
    }
    refresh();
    if (name === 'next' || name === 'restart') window.scrollTo({ top: 0, behavior: motion.matches ? 'instant' : 'smooth' });
  }
  ['undo', 'reset', 'hint'].forEach(name => $(name).addEventListener('click', () => action(name)));
  $('next').addEventListener('click', () => action(session.view().last ? 'reset' : 'next'));
  $('restart-journey').addEventListener('click', () => { $('restart-confirm').hidden = false; $('cancel-restart').focus(); });
  $('cancel-restart').addEventListener('click', () => { $('restart-confirm').hidden = true; $('restart-journey').focus(); });
  $('confirm-restart').addEventListener('click', () => { $('restart-confirm').hidden = true; action('restart'); $('restart-journey').focus({ preventScroll: true }); });
  new ResizeObserver(() => {
    width = canvas.getBoundingClientRect().width;
    canvas.width = Math.round(width * devicePixelRatio);
    canvas.height = Math.round(width * devicePixelRatio);
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    positionControls(); draw();
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => {
    sound.setActive(!document.hidden);
    music.setActive(!document.hidden);
    if (document.hidden) {
      if (frame != null) { cancelAnimationFrame(frame); frame = null; }
      LightRenderer.resetMotion(context);
    } else { draw(); start(); }
  });
  window.addEventListener('pagehide', () => { sound.setActive(false); music.setActive(false); });
  window.addEventListener('pageshow', () => { sound.setActive(!document.hidden); music.setActive(!document.hidden); });
  motion.addEventListener('change', () => {
    if (frame != null) { cancelAnimationFrame(frame); frame = null; }
    LightRenderer.resetMotion(context); draw(); start();
  });
  refresh(); start();
})();
