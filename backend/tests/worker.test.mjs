import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../worker.mjs';
function database() {
 const db=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort()) db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
 const prepare=sql=>{let params=[];return {bind(...args){params=args;return this;},async all(){return {results:db.prepare(sql).all(...params)};},async first(){return db.prepare(sql).get(...params)||null;},async run(){const r=db.prepare(sql).run(...params);return {meta:{changes:Number(r.changes)}};},async execute(){return /^SELECT/i.test(sql.trim())?this.all():this.run();}};};
 return {prepare,async batch(statements){db.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.execute());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}};
}
const payload=()=>({id:crypto.randomUUID(),student:'Alisa',house:'M',points:5,reason:'Team activity'});
const request=data=>new Request('https://example.test/entries',{method:'POST',headers:{Origin:'https://alisaayz.github.io','Content-Type':'application/json'},body:JSON.stringify(data)});
test('a student can submit without credentials but awaits approval before posting',async()=>{
 const env={DB:database()},input=payload();const response=await worker.fetch(request(input),env);assert.equal(response.status,201);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://alisaayz.github.io');
 const saved=(await response.json()).entry;assert.equal(saved.student,'Alisa');assert.equal(saved.status,'pending');
 const fresh=await worker.fetch(new Request('https://example.test/entries'),env);const data=await fresh.json();assert.deepEqual(data.entries,[]);assert.deepEqual(data.totals,{M:0,S:0,B:0,A:0});
});
test('retrying a submission adds its points only once',async()=>{
 const env=editorEnv(),input=payload();await worker.fetch(request(input),env);assert.equal((await worker.fetch(request(input),env)).status,200);const token=await unlock(env);await worker.fetch(adminRequest('approve',{id:input.id},token),env);await worker.fetch(adminRequest('approve',{id:input.id},token),env);await worker.fetch(request(input),env);
 const response=await worker.fetch(new Request('https://example.test/entries'),env);const data=await response.json();assert.equal(data.entries.length,1);assert.equal(data.totals.M,5);
 assert.equal((await worker.fetch(request({...input,points:99}),env)).status,409);
});
test('invalid student inputs never change shared data',async()=>{
 const env={DB:database()};for(const change of [{student:' '},{house:'X'},{points:-5},{points:1.5},{reason:' '},{id:'not-an-id'}]) assert.equal((await worker.fetch(request({...payload(),...change}),env)).status,400);
 const response=await worker.fetch(new Request('https://example.test/entries'),env);assert.deepEqual((await response.json()).entries,[]);
});
test('browser preflight succeeds and unrelated origins are rejected',async()=>{
 const response=await worker.fetch(new Request('https://example.test/entries',{method:'OPTIONS',headers:{Origin:'https://alisaayz.github.io'}}),{});assert.equal(response.status,204);
 const wrong=new Request('https://example.test/entries',{method:'POST',headers:{Origin:'https://unrelated.test','Content-Type':'application/json'},body:JSON.stringify(payload())});assert.equal((await worker.fetch(wrong,{DB:database()})).status,403);
});
const editorEnv=()=>({DB:database(),ADMIN_PASSWORD:'test-editor-password',ADMIN_SESSION_SECRET:'test-session-signing-key-strong-and-long'});
const adminRequest=(path,data,token)=>new Request('https://example.test/admin/'+path,{method:data?'POST':'GET',headers:{Origin:'https://alisaayz.github.io',...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});
const unlock=async env=>(await (await worker.fetch(adminRequest('login',{password:env.ADMIN_PASSWORD}),env)).json()).token;
test('editor writes require a valid server-verified session',async()=>{
 const env=editorEnv();for(const path of ['approve','names','totals','reset','edit','delete','restore'])assert.equal((await worker.fetch(adminRequest(path,{totals:{M:0,S:0,B:0,A:0},id:crypto.randomUUID()}),env)).status,401);
 assert.equal((await worker.fetch(adminRequest('login',{password:'incorrect'}),env)).status,401);
 assert.equal((await worker.fetch(adminRequest('state',null,'forged-token'),env)).status,401);
 const token=await unlock(env);assert.ok(token);assert.equal((await worker.fetch(adminRequest('state',null,token),env)).status,200);
});
test('editor can set totals and edit, delete, and restore entries',async()=>{
 const env=editorEnv(),input=payload();await worker.fetch(request(input),env);const token=await unlock(env);await worker.fetch(adminRequest('approve',{id:input.id},token),env);
 let response=await worker.fetch(adminRequest('totals',{totals:{M:95,S:83,B:115,A:134}},token),env);assert.equal(response.status,200);
 response=await worker.fetch(adminRequest('edit',{...input,student:'Edited student',house:'S',points:2},token),env);let data=await response.json();assert.equal(data.totals.M,90);assert.equal(data.totals.S,85);assert.equal(data.entries[0].student,'Edited student');
 response=await worker.fetch(adminRequest('delete',{id:input.id},token),env);data=await response.json();assert.equal(data.totals.S,83);assert.ok(data.entries[0].deletedAt);
 const publicState=await worker.fetch(new Request('https://example.test/entries'),env);assert.deepEqual((await publicState.json()).entries,[]);
 response=await worker.fetch(adminRequest('restore',{id:input.id},token),env);data=await response.json();assert.equal(data.totals.S,85);assert.equal(data.entries[0].deletedAt,null);
 assert.equal((await worker.fetch(adminRequest('totals',{totals:{M:-1,S:0,B:0,A:0}},token),env)).status,400);
});
test('reset clears public points and entries while retaining recoverable history',async()=>{
 const env=editorEnv(),input=payload();await worker.fetch(request(input),env);const token=await unlock(env);await worker.fetch(adminRequest('approve',{id:input.id},token),env);await worker.fetch(request(payload()),env);assert.equal((await worker.fetch(adminRequest('reset',{},token),env)).status,200);
 const response=await worker.fetch(new Request('https://example.test/entries'),env),data=await response.json();assert.deepEqual(data.entries,[]);assert.deepEqual(data.totals,{M:0,S:0,B:0,A:0});
 const deleted=await worker.fetch(adminRequest('state',null,token),env);const archived=(await deleted.json()).entries;assert.equal(archived.length,2);assert.ok(archived.every(entry=>entry.deletedAt));
});
test('repeated incorrect passwords are throttled',async()=>{
 const env=editorEnv();for(let i=0;i<5;i++)assert.equal((await worker.fetch(adminRequest('login',{password:'wrong'}),env)).status,401);
 assert.equal((await worker.fetch(adminRequest('login',{password:'wrong'}),env)).status,429);
});

test('shared names persist across reads and point operations without changing house identities',async()=>{
 const env=editorEnv(),input=payload();await worker.fetch(request(input),env);const token=await unlock(env);await worker.fetch(adminRequest('approve',{id:input.id},token),env);
 const names={M:'Monsters',S:'Stargazers',B:'Bears',A:'All Stars'};
 let response=await worker.fetch(adminRequest('names',{houseNames:{...names,M:'  Monsters  '}},token),env);assert.equal(response.status,200);
 let data=await response.json();assert.deepEqual(data.houseNames,names);assert.equal(data.totals.M,5);assert.equal(data.entries[0].house,'M');assert.equal(data.entries[0].id,input.id);
 data=await (await worker.fetch(new Request('https://example.test/entries'),env)).json();assert.deepEqual(data.houseNames,names);
 for(const invalid of [{...names,M:' '},{...names,S:'x'.repeat(41)},{M:'New name'},null])assert.equal((await worker.fetch(adminRequest('names',{houseNames:invalid},token),env)).status,400);
 data=await (await worker.fetch(adminRequest('state',null,token),env)).json();assert.deepEqual(data.houseNames,names);
 await worker.fetch(adminRequest('reset',{},token),env);data=await (await worker.fetch(new Request('https://example.test/entries'),env)).json();assert.deepEqual(data.houseNames,names);assert.deepEqual(data.totals,{M:0,S:0,B:0,A:0});
});
test('unnamed houses use their original labels',async()=>{
 const data=await (await worker.fetch(new Request('https://example.test/entries'),editorEnv())).json();assert.deepEqual(data.houseNames,{M:'House M',S:'House S',B:'House B',A:'House A'});
});

test('faculty can edit pending entries before approval, and approval uses the edited values',async()=>{
 const env=editorEnv(),input=payload();await worker.fetch(request({...input,status:'approved'}),env);const token=await unlock(env);
 let data=await (await worker.fetch(adminRequest('state',null,token),env)).json();assert.equal(data.entries[0].status,'pending');
 const edited={...input,house:'S',points:3,reason:'Reviewed activity',student:'Reviewed student'};
 data=await (await worker.fetch(adminRequest('edit',edited,token),env)).json();assert.equal(data.entries[0].status,'pending');assert.deepEqual(data.totals,{M:0,S:0,B:0,A:0});
 let publicData=await (await worker.fetch(new Request('https://example.test/entries'),env)).json();assert.deepEqual(publicData.entries,[]);
 data=await (await worker.fetch(adminRequest('approve',{id:input.id},token),env)).json();assert.equal(data.totals.S,3);assert.equal(data.entries[0].status,'approved');
 publicData=await (await worker.fetch(new Request('https://example.test/entries'),env)).json();assert.equal(publicData.entries[0].student,'Reviewed student');assert.equal(publicData.entries[0].house,'S');assert.equal(publicData.entries[0].points,3);
 assert.equal((await worker.fetch(adminRequest('approve',{id:input.id},token),env)).status,200);publicData=await (await worker.fetch(new Request('https://example.test/entries'),env)).json();assert.equal(publicData.totals.S,3);
});
test('rejecting and restoring pending entries does not change points or publish them',async()=>{
 const env=editorEnv(),input=payload();await worker.fetch(request(input),env);const token=await unlock(env);
 let data=await (await worker.fetch(adminRequest('delete',{id:input.id},token),env)).json();assert.ok(data.entries[0].deletedAt);assert.equal(data.entries[0].status,'pending');assert.equal(data.totals.M,0);
 assert.equal((await worker.fetch(adminRequest('approve',{id:input.id},token),env)).status,409);
 data=await (await worker.fetch(adminRequest('restore',{id:input.id},token),env)).json();assert.equal(data.entries[0].deletedAt,null);assert.equal(data.entries[0].status,'pending');assert.equal(data.totals.M,0);
 const publicData=await (await worker.fetch(new Request('https://example.test/entries'),env)).json();assert.deepEqual(publicData.entries,[]);
});
test('existing posted entries retain approved status and totals after migration',()=>{
 const db=new DatabaseSync(':memory:');const files=readdirSync(new URL('../drizzle/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort();
 for(const file of files.slice(0,-1))db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
 const input=payload();db.prepare('INSERT INTO entries(id,student,house,points,reason,created_at) VALUES(?,?,?,?,?,?)').run(input.id,input.student,input.house,input.points,input.reason,new Date().toISOString());db.prepare('INSERT INTO house_totals(house,points) VALUES(?,?)').run('M',95);
 db.exec(readFileSync(new URL('../drizzle/'+files.at(-1),import.meta.url),'utf8'));assert.equal(db.prepare('SELECT status FROM entries').get().status,'approved');assert.equal(db.prepare('SELECT points FROM house_totals').get().points,95);db.close();
});
