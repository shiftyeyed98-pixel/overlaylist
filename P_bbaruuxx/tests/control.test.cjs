const {test} = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../control.js');
const schema = 'pparu-l1-v3';
const status = (editMode, revision = 'r1') => ({schema, editMode, revision});
const data = (revision = 'r1') => ({...status(false, revision), published:true, pages:{p:{rows:[[1,'normal']]}}});
function harness(replies, cached) {
  const calls = [], rendered = [], saved = [];
  let clock = 20000;
  const timers = new Map(); let timer = 0;
  const options = {
    url:'https://example.test/exec', now:() => clock,
    setTimeout:fn => {timers.set(++timer,fn); return timer;},
    clearTimeout:id => timers.delete(id), warn() {},
    storage:{getItem:() => cached, setItem:(...args) => saved.push(args)},
    render:value => rendered.push(value),
    fetch:async url => {
      calls.push(new URL(url).searchParams.get('mode'));
      if (!replies.length) throw new Error('unexpected request');
      let value = replies.shift();
      if (typeof value === 'function') value = await value();
      if (value instanceof Error) throw value;
      return {ok:true, json:async () => value};
    }
  };
  return {controller:create(options), calls, rendered, saved, timers, advance:() => clock+=11000};
}
test('TRUE at first start without cache never requests DATA or renders', async () => {
 const h=harness([status(true)]); await h.controller.tick();
 assert.deepEqual(h.calls,['status']); assert.equal(h.rendered.length,0);
});
test('FALSE uses exactly one status/data/status pipeline and saves only published data', async () => {
 const h=harness([status(false),data(),status(false)]); await h.controller.tick();
 assert.deepEqual(h.calls,['status','data','status']); assert.equal(h.rendered.length,1); assert.equal(h.saved.length,1);
});
test('TRUE in DATA response discards the response', async () => {
 const h=harness([status(false),status(true)]); await h.controller.tick();
 assert.equal(h.rendered.length,0); assert.equal(h.saved.length,0);
});
test('TRUE after DATA fetch prevents DOM/cache changes', async () => {
 const h=harness([status(false),data(),status(true)]); await h.controller.tick();
 assert.equal(h.rendered.length,0); assert.equal(h.saved.length,0);
});
for (const bad of [{},status('false'),{...status(false),schema:'pparu-l1-v2'},null,new Error('offline')]) {
 test('invalid status blocks DATA: '+JSON.stringify(bad), async () => {
  const h=harness([bad]); await h.controller.tick();
  assert.deepEqual(h.calls,['status']); assert.equal(h.rendered.length,0);
 });
}
test('invalid final status never commits and next successful poll recovers', async () => {
 const h=harness([status(false),data(),{},status(false),data(),status(false)]);
 await h.controller.tick(); assert.equal(h.rendered.length,0);
 await h.controller.tick(); assert.equal(h.rendered.length,1);
});
test('new published revision during request discards older response', async () => {
 const h=harness([status(false),data(),status(false,'r2')]); await h.controller.tick();
 assert.equal(h.rendered.length,0);
});
test('overlapping polls cannot start a second request chain', async () => {
 let release; const gate=new Promise(resolve=>release=resolve);
 const h=harness([() => gate,data(),status(false)]);
 const active=h.controller.tick(); await h.controller.tick();
 assert.deepEqual(h.calls,['status']); release(status(false)); await active;
 assert.equal(h.rendered.length,1);
});
test('known lock followed by unlock refreshes immediately', async () => {
 const h=harness([status(false),data(),status(false),status(true),status(false),data('r2'),status(false,'r2')]);
 await h.controller.tick(); await h.controller.tick(); await h.controller.tick();
 assert.equal(h.rendered.length,2);
});
test('unchanged published data does not redraw or rewrite cache', async () => {
 const h=harness([status(false),data(),status(false),status(false),data(),status(false)]);
 await h.controller.tick();h.advance();await h.controller.tick();
 assert.equal(h.rendered.length,1);assert.equal(h.saved.length,1);
});
test('start restores valid v3 cache once and starts one timer loop', async () => {
 const h=harness([status(true)],JSON.stringify(data()));h.controller.start();h.controller.start();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.rendered.length,1);assert.equal(h.saved.length,0);assert.deepEqual(h.calls,['status']);assert.equal(h.timers.size,1);
 h.controller.stop();assert.equal(h.timers.size,0);
});
test('old/invalid cache is ignored even during edit mode', async () => {
 const h=harness([status(true)],JSON.stringify({...data(),schema:'pparu-l1-v2'}));h.controller.start();
 await new Promise(resolve=>setImmediate(resolve));assert.equal(h.rendered.length,0);h.controller.stop();
});
test('stop during request prevents a later response from committing', async () => {
 let release; const gate=new Promise(resolve=>release=resolve);
 const h=harness([status(false),data(),() => gate]);const active=h.controller.tick();
 await new Promise(resolve=>setImmediate(resolve));h.controller.stop();release(status(false));await active;
 assert.equal(h.rendered.length,0);
});
test('payload without publication marker cannot commit', async () => {
 const h=harness([status(false),{...data(),published:false}]); await h.controller.tick();assert.equal(h.rendered.length,0);
});
test('request timeout releases pipeline and preserves screen', async () => {
 let timeout;const rendered=[];let timedOut=false;
 const controller=create({url:'https://example.test/exec',warn(){},render:x=>rendered.push(x),
  setTimeout:fn=>{timeout=fn;return 1;},clearTimeout(){},
  fetch:(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{timedOut=true;reject(Error('aborted'));}))});
 const active=controller.tick();timeout();await active;assert.equal(timedOut,true);assert.equal(rendered.length,0);
});
