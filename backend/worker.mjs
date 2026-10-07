const HOUSES=['M','S','B','A'];
const ORIGINS=new Set(['https://alisaayz.github.io','https://msba-housepoints-data.zhaoheng988.chatgpt.site']);
const encode=new TextEncoder();
function headers(request){const origin=request.headers.get('Origin');return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',...(ORIGINS.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}:{})};}
function json(request,data,status=200){return new Response(JSON.stringify(data),{status,headers:headers(request)});}
function fail(message,status=400){return Object.assign(new Error(message),{status});}
function entry(row){return {id:row.id,student:row.student,house:row.house,points:row.points,reason:row.reason,date:row.created_at,deletedAt:row.deleted_at||null};}
export function validateEntry(input){
 if(!input || typeof input!=='object' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id||'')) throw fail('Please try submitting your entry again.');
 if(typeof input.student!=='string'||!input.student.trim()||input.student.trim().length>40) throw fail('Enter a name or nickname (up to 40 characters).');
 if(!HOUSES.includes(input.house)) throw fail('Choose your house.');
 if(!Number.isSafeInteger(input.points)||input.points<1||input.points>10000) throw fail('Enter whole points between 1 and 10,000.');
 if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.trim().length>300) throw fail('Add your activity (up to 300 characters).');
 return {id:input.id,student:input.student.trim(),house:input.house,points:input.points,reason:input.reason.trim()};
}
async function readJson(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json')) throw fail('Expected JSON.',415);
 if(Number(request.headers.get('Content-Length'))>8192) throw fail('The entry is too long.',413);
 let raw='',bytes=0;const reader=request.body?.getReader(),decoder=new TextDecoder();
 if(reader){while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>8192){await reader.cancel();throw fail('The entry is too long.',413);}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();}
 try{return JSON.parse(raw);}catch{throw fail('Check your input and try again.');}
}
const toBase64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const fromBase64=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
async function key(env){if(!env.ADMIN_SESSION_SECRET)throw fail('The editor is not configured yet.',503);return crypto.subtle.importKey('raw',encode.encode(env.ADMIN_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function adminLogin(request,env){
 if(!env.ADMIN_PASSWORD)throw fail('The editor is not configured yet.',503);
 const input=await readJson(request);if(typeof input.password!=='string'||input.password.length>128)throw fail('Enter the editor password.',401);
 const secret=await key(env);const ip=request.headers.get('CF-Connecting-IP')||'unknown';
 const bucket=toBase64(await crypto.subtle.sign('HMAC',secret,encode.encode('login-rate:'+ip)));
 const now=Date.now(),previous=await env.DB.prepare('SELECT attempts,expires FROM auth_attempts WHERE key=?').bind(bucket).first();
 if(previous?.expires>now&&previous.attempts>=5)throw fail('Too many attempts. Try again in 15 minutes.',429);
 const expected=await crypto.subtle.sign('HMAC',secret,encode.encode(env.ADMIN_PASSWORD));
 const valid=await crypto.subtle.verify('HMAC',secret,expected,encode.encode(input.password));
 if(!valid){const attempts=previous?.expires>now?previous.attempts+1:1;const expires=previous?.expires>now?previous.expires:now+900000;await env.DB.prepare('INSERT INTO auth_attempts(key,attempts,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET attempts=excluded.attempts,expires=excluded.expires').bind(bucket,attempts,expires).run();throw fail('Incorrect password.',401);}
 await env.DB.prepare('DELETE FROM auth_attempts WHERE key=?').bind(bucket).run();
 const expiresAt=now+7200000,payload=toBase64(encode.encode(JSON.stringify({expiresAt,nonce:crypto.randomUUID(),audience:'msba-housepoints-admin'})));
 const signature=toBase64(await crypto.subtle.sign('HMAC',secret,encode.encode(payload)));
 return {token:payload+'.'+signature,expiresAt};
}
async function requireAdmin(request,env){
 const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
 if(!token||token.length>2000)throw fail('Unlock the editor to make changes.',401);
 try{const [payload,signature,...rest]=token.split('.');if(rest.length||!payload||!signature)throw Error();const valid=await crypto.subtle.verify('HMAC',await key(env),fromBase64(signature),encode.encode(payload));if(!valid)throw Error();const claims=JSON.parse(new TextDecoder().decode(fromBase64(payload)));if(claims.audience!=='msba-housepoints-admin'||!Number.isFinite(claims.expiresAt)||claims.expiresAt<=Date.now())throw Error();}
 catch{throw fail('Your editor session has expired. Unlock it again.',401);}
}
function ensureHouses(env){return HOUSES.map(house=>env.DB.prepare('INSERT INTO house_totals(house,points) VALUES(?,0) ON CONFLICT(house) DO NOTHING').bind(house));}
async function state(env,all=false){
 const [records,scores,names]=await env.DB.batch([env.DB.prepare('SELECT id,student,house,points,reason,created_at,deleted_at FROM entries '+(all?'':'WHERE deleted_at IS NULL ')+'ORDER BY created_at DESC,id DESC LIMIT 10001'),env.DB.prepare('SELECT house,points FROM house_totals'),env.DB.prepare('SELECT house,name FROM house_names')]);
 if(records.results.length>10000)throw fail('The point history is too large to load completely.',503);
 const totals=Object.fromEntries(HOUSES.map(house=>[house,0]));for(const score of scores.results)if(HOUSES.includes(score.house))totals[score.house]=score.points;
 const houseNames=Object.fromEntries(HOUSES.map(house=>[house,'House '+house]));for(const row of names.results)if(HOUSES.includes(row.house))houseNames[row.house]=row.name;
 return {entries:records.results.map(entry),totals,houseNames};
}
async function adminAction(path,input,env){
 if(path==='/admin/names'){
  if(!input?.houseNames||HOUSES.some(house=>typeof input.houseNames[house]!=='string'||!input.houseNames[house].trim()||input.houseNames[house].trim().length>40))throw fail('Enter a house name from 1 to 40 characters for each letter.');
  await env.DB.batch(HOUSES.map(house=>env.DB.prepare('INSERT INTO house_names(house,name) VALUES(?,?) ON CONFLICT(house) DO UPDATE SET name=excluded.name').bind(house,input.houseNames[house].trim())));
 }else if(path==='/admin/totals'){
  if(!input.totals||HOUSES.some(house=>!Number.isSafeInteger(input.totals[house])||input.totals[house]<0||input.totals[house]>1000000))throw fail('Enter a whole total from 0 to 1,000,000 for each house.');
  await env.DB.batch(HOUSES.map(house=>env.DB.prepare('INSERT INTO house_totals(house,points) VALUES(?,?) ON CONFLICT(house) DO UPDATE SET points=excluded.points').bind(house,input.totals[house])));
 }else if(path==='/admin/reset'){
  await env.DB.batch([env.DB.prepare('UPDATE entries SET deleted_at=? WHERE deleted_at IS NULL').bind(new Date().toISOString()),...HOUSES.map(house=>env.DB.prepare('INSERT INTO house_totals(house,points) VALUES(?,0) ON CONFLICT(house) DO UPDATE SET points=0').bind(house))]);
 }else{
  if(typeof input.id!=='string'||input.id.length>100)throw fail('Choose an entry.');
  const row=await env.DB.prepare('SELECT * FROM entries WHERE id=?').bind(input.id).first();if(!row)throw fail('That entry was not found.',404);
  if(path==='/admin/edit'){
   if(row.deleted_at)throw fail('Restore this entry before editing it.',409);const valid=validateEntry(input);
   await env.DB.batch([...ensureHouses(env),env.DB.prepare('UPDATE house_totals SET points=MAX(0,points-CASE WHEN house=(SELECT house FROM entries WHERE id=? AND deleted_at IS NULL) THEN (SELECT points FROM entries WHERE id=?) ELSE 0 END+CASE WHEN house=? THEN ? ELSE 0 END) WHERE EXISTS(SELECT 1 FROM entries WHERE id=? AND deleted_at IS NULL)').bind(valid.id,valid.id,valid.house,valid.points,valid.id),env.DB.prepare('UPDATE entries SET student=?,house=?,points=?,reason=? WHERE id=? AND deleted_at IS NULL').bind(valid.student,valid.house,valid.points,valid.reason,valid.id)]);
  }else if(path==='/admin/delete'){
   await env.DB.batch([...ensureHouses(env),env.DB.prepare('UPDATE house_totals SET points=MAX(0,points-(SELECT points FROM entries WHERE id=?)) WHERE house=(SELECT house FROM entries WHERE id=?) AND EXISTS(SELECT 1 FROM entries WHERE id=? AND deleted_at IS NULL)').bind(row.id,row.id,row.id),env.DB.prepare('UPDATE entries SET deleted_at=? WHERE id=? AND deleted_at IS NULL').bind(new Date().toISOString(),row.id)]);
  }else if(path==='/admin/restore'){
   await env.DB.batch([...ensureHouses(env),env.DB.prepare('UPDATE house_totals SET points=points+(SELECT points FROM entries WHERE id=?) WHERE house=(SELECT house FROM entries WHERE id=?) AND EXISTS(SELECT 1 FROM entries WHERE id=? AND deleted_at IS NOT NULL)').bind(row.id,row.id,row.id),env.DB.prepare('UPDATE entries SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL').bind(row.id)]);
  }else throw fail('Not found',404);
 }
 return state(env,true);
}
export default{async fetch(request,env){
 const path=new URL(request.url).pathname,origin=request.headers.get('Origin');
 if(origin&&!ORIGINS.has(origin))return json(request,{error:'This origin is not allowed.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:headers(request)});
 if(path==='/'&&request.method==='GET')return json(request,{service:'MSBA shared house points',website:'https://alisaayz.github.io/msba-housepoints/'});
 if(path!=='/entries'&&!path.startsWith('/admin/'))return json(request,{error:'Not found'},404);
 if(!env.DB)return json(request,{error:'Shared points are temporarily unavailable. Please try again.'},503);
 try{
  if(path==='/entries'&&request.method==='GET')return json(request,await state(env));
  if(path.startsWith('/admin/')){
   if(path==='/admin/login'&&request.method==='POST'){if(!ORIGINS.has(origin))throw fail('Use the website to unlock the editor.',403);return json(request,await adminLogin(request,env));}
   await requireAdmin(request,env);
   if(path==='/admin/state'&&request.method==='GET')return json(request,await state(env,true));
   if(request.method!=='POST')throw fail('Method not allowed',405);
   if(!ORIGINS.has(origin))throw fail('Use the website to make changes.',403);
   return json(request,await adminAction(path,await readJson(request),env));
  }
  if(request.method!=='POST')throw fail('Method not allowed',405);
  if(!ORIGINS.has(origin))throw fail('Submit through the house points website.',403);
  const input=validateEntry(await readJson(request));
  const result=await env.DB.batch([env.DB.prepare('INSERT INTO house_totals(house,points) VALUES(?,0) ON CONFLICT(house) DO NOTHING').bind(input.house),env.DB.prepare('UPDATE house_totals SET points=points+? WHERE house=? AND NOT EXISTS(SELECT 1 FROM entries WHERE id=?)').bind(input.points,input.house,input.id),env.DB.prepare('INSERT INTO entries(id,student,house,points,reason,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(input.id,input.student,input.house,input.points,input.reason,new Date().toISOString())]);
  const saved=await env.DB.prepare('SELECT * FROM entries WHERE id=?').bind(input.id).first();
  if(saved.deleted_at)throw fail('This entry was removed. Refresh before submitting a new entry.',409);
  if(['student','house','points','reason'].some(field=>saved[field]!==input[field]))throw fail('That submission was already saved with different details. Refresh and try again.',409);
  return json(request,{entry:entry(saved),...(await state(env))},result[2].meta?.changes?201:200);
 }catch(error){if(!error.status)console.error('Point storage failed:',error.message);return json(request,{error:error.status?error.message:'Shared points are temporarily unavailable. Please try again.'},error.status||503);}
}};
