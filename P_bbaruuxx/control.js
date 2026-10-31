/* One serialized status -> published DATA -> status -> render path. */
(function (root) {
  'use strict';
  function create(options) {
    const schema = options.schema || 'pparu-l1-v3';
    const cacheKey = 'pparu-published-v3:' + options.url;
    const request = options.fetch || root.fetch.bind(root);
    const now = options.now || Date.now;
    const later = options.setTimeout || root.setTimeout.bind(root);
    const cancel = options.clearTimeout || root.clearTimeout.bind(root);
    let storage;
    try { storage = options.storage; } catch (_) {}
    let busy = false, started = false, stopped = false, timer;
    let locked = true, lastCheck = 0, signature = '';

    function status(value) {
      if (!value || value.error || value.schema !== schema ||
          typeof value.editMode !== 'boolean' ||
          !(value.revision === null || typeof value.revision === 'string')) {
        throw new Error('GAS 제어 응답이 올바르지 않습니다. v3 재배포를 확인하세요.');
      }
      return value.editMode;
    }
    function published(value) {
      if (status(value) || value.published !== true || !value.revision ||
          !value.pages || Array.isArray(value.pages) || typeof value.pages !== 'object' ||
          Object.values(value.pages).some(p => !p || !Array.isArray(p.rows))) {
        throw new Error('게시된 메뉴 데이터가 아닙니다.');
      }
      return value;
    }
    function commit(value, restore) {
      published(value);
      if (!restore && (locked || stopped)) return;
      const next = JSON.stringify(value);
      if (next === signature) return;
      options.render(value);
      signature = next;
      if (!restore) {
        try { if (storage) storage.setItem(cacheKey, next); } catch (_) {}
      }
    }
    async function json(mode) {
      const url = new URL(options.url);
      url.searchParams.set('mode', mode);
      url.searchParams.set('_', String(now()));
      const abort = new AbortController();
      const timeout = later(() => abort.abort(), 15000);
      try {
        const response = await request(url.toString(), {cache: 'no-store', signal: abort.signal});
        if (!response.ok) throw new Error('GAS HTTP ' + response.status);
        const value = await response.json();
        status(value);
        return value;
      } finally { cancel(timeout); }
    }
    async function tick() {
      if (busy || stopped) return;
      busy = true;
      try {
        const before = await json('status');
        const wasLocked = locked;
        locked = status(before);
        if (locked) return;
        if (!wasLocked && signature && now() - lastCheck < 10000) return;
        lastCheck = now();
        const data = await json('data');
        if (status(data)) { locked = true; return; }
        published(data);
        const after = await json('status');
        locked = status(after);
        if (locked || after.revision !== data.revision) {
          locked = true; // 게시본이 바뀌었으면 다음 회차에 새 게시본을 조회한다.
          return;
        }
        commit(data, false); // 마지막 검사부터 DOM 반영까지 await 없음
      } catch (error) {
        locked = true;
        if (options.warn) options.warn(error);
        else if (root.console) root.console.warn('메뉴 갱신 차단, 기존 화면 유지:', error);
      } finally { busy = false; }
    }
    async function loop() {
      try { await tick(); }
      finally { if (!stopped) timer = later(loop, 3000); }
    }
    function start() {
      if (started) return;
      started = true;
      try {
        const cached = storage && storage.getItem(cacheKey);
        if (cached) commit(JSON.parse(cached), true);
      } catch (_) { /* 구버전 또는 손상된 캐시는 복원하지 않는다. */ }
      void loop();
    }
    function stop() { stopped = true; locked = true; cancel(timer); }
    return {start, stop, tick};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {create};
  else root.PparuControl = {create};
})(typeof globalThis !== 'undefined' ? globalThis : this);
