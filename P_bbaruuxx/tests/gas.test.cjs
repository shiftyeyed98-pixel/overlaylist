const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const crypto=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'../Code.gs'),'utf8');
function harness({states=[false], mutate=false, busy=false, missingData=false, large=false}={}) {
 let reads=0, writes=0, released=0, lock=false;
 const config=Array.from({length:12},()=>Array(24).fill(''));
 config[0][11]=0;config[0][15]=1.2;config[0][18]=85;config[0][20]=90;
 config[2][0]='page1';config[1][0]=true;config[11][0]=true;config[5][0]='pink';
 const sheetRows=[Array(12).fill(''),['page1','title','e_colorshift','new',1000,'item','note','e_colorshift','best','red',true,true]];
 if(large)sheetRows[1][5]='긴메뉴'.repeat(20000);
 let cells=[];
 const snapshot={getMaxRows:()=>1000,hideSheet(){},getRange(row,col,count=1){return {
  getValues:()=>Array.from({length:count},(_,i)=>[cells[row-1+i]??'']),
  setValues(values){writes++;values.forEach((v,i)=>cells[row-1+i]=v[0]);}
 };}};
 let hasSnapshot=false;
 const code={getRange(range){
  if(range==='L1')return {getValue:()=>states.length>1?states.shift():states[0]};
  if(range==='C1:Z12')return {getValues:()=>config,getDisplayValues:()=>config.map(r=>r.map(String))};
  throw Error(range);
 }};
 const data={getDataRange:()=>({getValues(){reads++;const rows=structuredClone(sheetRows);if(mutate)rows[1][5]+='-'+reads;return rows;}})};
 const ss={getSheetByName(name){return name==='CODE'?code:name==='DATA'?(missingData?null:data):hasSnapshot?snapshot:null;},
  insertSheet(){hasSnapshot=true;return snapshot;}};
 const context={SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush(){}},
  ContentService:{MimeType:{JSON:'JSON'},createTextOutput:text=>({text,setMimeType(){return this;}})},
  LockService:{getScriptLock:()=>({tryLock(){lock=!busy;return lock;},hasLock:()=>lock,releaseLock(){released++;lock=false;}})},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
   computeDigest:(_,text)=>[...crypto.createHash('sha256').update(text).digest()],
   base64Encode:text=>Buffer.from(text).toString('base64'),base64Decode:text=>Buffer.from(text,'base64'),
   newBlob:bytes=>({getDataAsString:()=>Buffer.from(bytes).toString('utf8')})}};
 vm.createContext(context);vm.runInContext(source,context);
 return {call:(mode='data')=>JSON.parse(context.doGet({parameter:{mode}}).text),states,
  stats:()=>({reads,writes,released}),corrupt:()=>cells[3]='b64:invalid',context};
}
test('GAS TRUE does not read DATA or create snapshot',()=>{
 const h=harness({states:[true]});const out=h.call();assert.equal(out.editMode,true);
 assert.equal('pages' in out,false);assert.equal(h.stats().reads,0);assert.equal(h.stats().writes,0);
});
test('GAS FALSE publishes/reloads snapshot and preserves existing mapping',()=>{
 const h=harness();const out=h.call();assert.equal(out.published,true);assert.equal(out.schema,'pparu-l1-v3');
 assert.equal(out.revision.length,64);assert.equal(out.scrollSeconds,0);assert.equal(out.scale,1.2);
 assert.deepEqual(out.pages.page1.rows[0],['1000','item','best','note','e_colorshift','red',true]);
 assert.equal(out.pages.page1.titleColor,'pink');assert.equal(out.fixedBottomWidthPercent,90);
 assert.equal(h.stats().reads,2);assert.equal(h.stats().writes,1);
 const next=h.call();assert.equal(next.revision,out.revision);assert.equal(h.stats().writes,1);
});
test('GAS status is read-only and returns published revision',()=>{
 const h=harness();const initial=h.call('status');assert.equal(initial.revision,null);assert.equal(h.stats().reads,0);
 const out=h.call();const stats=h.stats();assert.equal(h.call('status').revision,out.revision);assert.equal(h.stats().reads,stats.reads);
});
test('GAS TRUE after first DATA read prevents publication',()=>{
 const h=harness({states:[false,true]});assert.equal(h.call().editMode,true);
 assert.equal(h.stats().reads,1);assert.equal(h.stats().writes,0);
});
test('GAS TRUE after second DATA read prevents publication',()=>{
 const h=harness({states:[false,false,true]});assert.equal(h.call().editMode,true);
 assert.equal(h.stats().reads,2);assert.equal(h.stats().writes,0);
});
test('GAS TRUE at final return withholds all payload',()=>{
 const h=harness({states:[false,false,false,true]});const out=h.call();assert.equal(out.editMode,true);assert.equal('pages' in out,false);
});
test('GAS changing DATA prevents publication',()=>{
 const h=harness({mutate:true});const out=h.call();assert.equal(out.editMode,true);assert.ok(out.error);assert.equal(h.stats().writes,0);
});
for(const state of ['',null,'FALSE','TRUE',0])test('GAS invalid L1 fails closed: '+state,()=>{
 const h=harness({states:[state]});const out=h.call();assert.equal(out.editMode,true);assert.ok(out.error);assert.equal(h.stats().reads,0);
});
test('GAS concurrent lock contention fails closed without touching DATA',()=>{
 const h=harness({busy:true});assert.equal(h.call().editMode,true);assert.equal(h.stats().reads,0);assert.equal(h.stats().released,0);
});
test('GAS missing DATA returns no payload and releases script lock',()=>{
 const h=harness({missingData:true});const out=h.call();assert.ok(out.error);assert.equal(out.editMode,true);assert.equal(h.stats().released,1);
});
test('GAS rejects corrupt stored snapshot',()=>{
 const h=harness();h.call();h.corrupt();
 const out=h.call();assert.equal(out.editMode,true);assert.ok(out.error);
});
test('GAS rejects unsupported mode',()=>{const h=harness();assert.ok(h.call('publish').error);assert.equal(h.stats().reads,0);});

test('GAS large Unicode publication spans chunks and round-trips intact',()=>{
 const h=harness({large:true});const out=h.call();
 assert.equal(out.published,true);assert.equal(out.pages.page1.rows[0][1],'긴메뉴'.repeat(20000));
});
