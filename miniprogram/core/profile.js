(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LightProfile = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STORAGE_KEY = 'explore-player-profile-v1';
  const ENERGY_MAX = 5, ENERGY_INTERVAL = 30 * 60 * 1000, ENERGY_PRICE = 20;
  const APPEARANCES = [
    { light: true, mint: '#4e8050', bg: '#e4f1cc', card: '#f6faed', line: '#b8cfa5',
      ink: '#29482e', muted: '#617654', gold: '#8a652b', primaryInk: '#fffdf1', disabled: '#8a9b7e', selected: '#d2e4ba',
      panel: '#f7faee', panelLine: '#a4bf8e', veil: 'rgba(43,69,35,.38)', diamond: '#397f90' },
    { light: false, bg: '#0c171d', card: '#142630', line: '#29434c', mint: '#80dfc1' }
  ];
  const integer = (n, fallback = 0) => Number.isSafeInteger(n) && n >= 0 ? n : fallback;
  // Daily rewards use a fixed UTC+8 calendar, including when the device travels.
  const day = now => Math.floor((now + 8 * 3600000) / 86400000);
  const better = (a, b) => !b || a.stars > b.stars || (a.stars === b.stars && a.moves < b.moves);
  class Profile {
    constructor(saved, progress, now = Date.now()) {
      const s = saved && saved.version === 1 ? saved : null;
      this.data = {
        version: 1, energy: s ? Math.min(ENERGY_MAX, integer(s.energy, ENERGY_MAX)) : ENERGY_MAX,
        energyAt: s ? integer(s.energyAt, now) : now, lastSeenAt: s ? integer(s.lastSeenAt, now) : now,
        diamonds: s ? integer(s.diamonds) : progress.reduce((sum, n) => sum + n * 5, 0),
        rewardedStars: progress.map((n, i) => {
          const stars=s && Array.isArray(s.rewardedStars) ? s.rewardedStars[i] : 0;
          return s ? Number.isInteger(stars) && stars>=0 && stars<=3 ? stars : 0 : n;
        }),
        claimedDay: s && Number.isInteger(s.claimedDay) ? s.claimedDay : -1,
        streak: s ? Math.min(7, integer(s.streak)) : 0,
        // Preserve old ownership data; appearance is now a free settings switch.
        owned: s && Array.isArray(s.owned) ? s.owned.filter(id=>['forest','ocean','violet'].includes(id)) : ['forest'],
        theme: s ? s.theme : 'forest', serial: s ? integer(s.serial) : 0,
        nightMode: s && typeof s.nightMode==='boolean' ? s.nightMode : !!(s && ['ocean','violet'].includes(s.theme)),
        rewardedRun: s ? integer(s.rewardedRun) : 0, classicCleared: s ? integer(s.classicCleared) : 0,
        records: s && Array.isArray(s.records) ? s.records.filter(r => r && ['campaign','classic','limited'].includes(r.kind) && r.size >= 3 && r.size <= 9 && r.stars >= 1 && r.stars <= 3 && Number.isSafeInteger(r.moves) && r.moves >= 0).slice(0, 21) : []
      };
      this.refresh(now);
    }
    refresh(now = Date.now()) {
      const d = this.data, time = Math.max(now, d.lastSeenAt);
      d.lastSeenAt = time;
      if (d.energy === ENERGY_MAX) { d.energyAt = time; return false; }
      const gained = Math.max(0, Math.floor((time - d.energyAt) / ENERGY_INTERVAL));
      if (!gained) return false;
      d.energy = Math.min(ENERGY_MAX, d.energy + gained);
      d.energyAt = d.energy === ENERGY_MAX ? time : d.energyAt + gained * ENERGY_INTERVAL;
      return true;
    }
    view(now = Date.now()) {
      const d = this.data, time = Math.max(now, d.lastSeenAt), today = day(time);
      const nextStreak = d.claimedDay === today - 1 ? d.streak % 7 + 1 : 1;
      return { ...d, canClaim: today > d.claimedDay, today,
        nextStreak, checkinReward: nextStreak === 7 ? 50 : 20,
        remaining: d.energy >= ENERGY_MAX ? 0 : Math.max(0, ENERGY_INTERVAL - (time - d.energyAt)),
        themeInfo: APPEARANCES[d.nightMode ? 1 : 0] };
    }
    spendEnergy(now = Date.now()) {
      this.refresh(now);
      if (this.data.energy === 0) return false;
      this.data.energy--; return true;
    }
    buyEnergy(now = Date.now()) {
      this.refresh(now);
      if (this.data.energy === ENERGY_MAX) return '体力已经满了';
      if (this.data.diamonds < ENERGY_PRICE) return '钻石不足，可通过签到和通关获得';
      this.data.diamonds -= ENERGY_PRICE; this.data.energy++;
      if (this.data.energy === ENERGY_MAX) this.data.energyAt = this.data.lastSeenAt;
      return '';
    }
    fillEnergy(now = Date.now()) {
      this.refresh(now);
      if (this.data.energy === ENERGY_MAX) return false;
      this.data.energy = ENERGY_MAX;
      this.data.energyAt = this.data.lastSeenAt;
      return true;
    }
    checkin(now = Date.now()) {
      this.refresh(now); const v = this.view(now);
      if (!v.canClaim) return 0;
      this.data.claimedDay = v.today; this.data.streak = v.nextStreak;
      this.data.diamonds += v.checkinReward; return v.checkinReward;
    }
    toggleNightMode() { this.data.nightMode=!this.data.nightMode; }
    newRun() { return ++this.data.serial; }
    complete(kind, id, game, stars, now = Date.now()) {
      const d = this.data; let reward = 0;
      if (kind === 'campaign') {
        reward = Math.max(0, stars - d.rewardedStars[id]) * 5;
        d.rewardedStars[id] = Math.max(d.rewardedStars[id], stars);
      } else if (id > d.rewardedRun) {
        d.rewardedRun = id; d.classicCleared++; reward = 5;
      }
      d.diamonds += reward;
      const record = { kind, size: game.level.size, stars, moves: game.moves, at: now, name: game.level.name };
      const index = d.records.findIndex(r => r.kind === kind && r.size === record.size);
      if (better(record, d.records[index])) {
        if (index < 0) d.records.push(record); else d.records[index] = record;
      }
      return reward;
    }
  }
  return { Profile, STORAGE_KEY, ENERGY_MAX, ENERGY_INTERVAL, ENERGY_PRICE, day };
}));
