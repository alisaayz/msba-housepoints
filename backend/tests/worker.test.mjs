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
test('a student can save without credentials and read the shared record',async()=>{
 const env={DB:database()},input=payload();const response=await worker.fetch(request(input),env);assert.equal(response.status,201);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://alisaayz.github.io');
 const saved=(await response.json()).entry;assert.equal(saved.student,'Alisa');
 const fresh=await worker.fetch(new Request('https://example.test/entries'),env);assert.equal((await fresh.json()).entries[0].id,input.id);
});
test('retrying a submission adds its points only once',async()=>{
 const env={DB:database()},input=payload();await worker.fetch(request(input),env);assert.equal((await worker.fetch(request(input),env)).status,200);
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
 const env=editorEnv();for(const path of ['totals','reset','edit','delete','restore'])assert.equal((await worker.fetch(adminRequest(path,{totals:{M:0,S:0,B:0,A:0},id:crypto.randomUUID()}),env)).status,401);
 assert.equal((await worker.fetch(adminRequest('login',{password:'incorrect'}),env)).status,401);
 assert.equal((await worker.fetch(adminRequest('state',null,'forged-token'),env)).status,401);
 const token=await unlock(env);assert.ok(token);assert.equal((await worker.fetch(adminRequest('state',null,token),env)).status,200);
});
test('editor can set totals and edit, delete, and restore entries',async()=>{
 const env=editorEnv(),input=payload();await worker.fetch(request(input),env);const token=await unlock(env);
 let response=await worker.fetch(adminRequest('totals',{totals:{M:95,S:83,B:115,A:134}},token),env);assert.equal(response.status,200);
 response=await worker.fetch(adminRequest('edit',{...input,student:'Edited student',house:'S',points:2},token),env);let data=await response.json();assert.equal(data.totals.M,90);assert.equal(data.totals.S,85);assert.equal(data.entries[0].student,'Edited student');
 response=await worker.fetch(adminRequest('delete',{id:input.id},token),env);data=await response.json();assert.equal(data.totals.S,83);assert.ok(data.entries[0].deletedAt);
 const publicState=await worker.fetch(new Request('https://example.test/entries'),env);assert.deepEqual((await publicState.json()).entries,[]);
 response=await worker.fetch(adminRequest('restore',{id:input.id},token),env);data=await response.json();assert.equal(data.totals.S,85);assert.equal(data.entries[0].deletedAt,null);
 assert.equal((await worker.fetch(adminRequest('totals',{totals:{M:-1,S:0,B:0,A:0}},token),env)).status,400);
});
test('reset clears public points and entries while retaining recoverable history',async()=>{
 const env=editorEnv(),input=payload();await worker.fetch(request(input),env);const token=await unlock(env);assert.equal((await worker.fetch(adminRequest('reset',{},token),env)).status,200);
 const response=await worker.fetch(new Request('https://example.test/entries'),env),data=await response.json();assert.deepEqual(data.entries,[]);assert.deepEqual(data.totals,{M:0,S:0,B:0,A:0});
 const deleted=await worker.fetch(adminRequest('state',null,token),env);assert.ok((await deleted.json()).entries[0].deletedAt);
});
test('repeated incorrect passwords are throttled',async()=>{
 const env=editorEnv();for(let i=0;i<5;i++)assert.equal((await worker.fetch(adminRequest('login',{password:'wrong'}),env)).status,401);
 assert.equal((await worker.fetch(adminRequest('login',{password:'wrong'}),env)).status,429);
});
