const HOUSES = new Set(['M','S','B','A']);
const PUBLIC_ORIGIN = 'https://alisaayz.github.io';
const SERVICE_ORIGIN = 'https://msba-housepoints-data.beige-wand-5959.chatgpt.site';

function headers(request) {
  const origin=request.headers.get('Origin');
  return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',...(origin===PUBLIC_ORIGIN || origin===SERVICE_ORIGIN ? {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'} : {})};
}
function json(request,data,status=200) {return new Response(JSON.stringify(data),{status,headers:headers(request)});}
function entry(row) {return {id:row.id,student:row.student,house:row.house,points:row.points,reason:row.reason,date:row.created_at};}
export function validateEntry(input) {
  if (!input || typeof input!=='object' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id || '')) throw new Error('Please try submitting your entry again.');
  if (typeof input.student!=='string' || !input.student.trim() || input.student.trim().length>40) throw new Error('Enter a name or nickname (up to 40 characters).');
  if (!HOUSES.has(input.house)) throw new Error('Choose your house.');
  if (!Number.isSafeInteger(input.points) || input.points<1 || input.points>10000) throw new Error('Enter whole points between 1 and 10,000.');
  if (typeof input.reason!=='string' || !input.reason.trim() || input.reason.trim().length>300) throw new Error('Add your activity (up to 300 characters).');
  return {id:input.id,student:input.student.trim(),house:input.house,points:input.points,reason:input.reason.trim()};
}

export default {
  async fetch(request,env) {
    const path=new URL(request.url).pathname;
    if (path==='/' && request.method==='GET') return json(request,{service:'MSBA shared house points',website:PUBLIC_ORIGIN+'/msba-housepoints/'});
    if (path!=='/entries') return json(request,{error:'Not found'},404);
    const origin=request.headers.get('Origin');
    if (origin && origin!==PUBLIC_ORIGIN && origin!==SERVICE_ORIGIN) return json(request,{error:'This origin is not allowed.'},403);
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers:headers(request)});
    if (!env.DB) return json(request,{error:'Shared points are temporarily unavailable. Please try again.'},503);
    try {
      if (request.method==='GET') {
        const {results}=await env.DB.prepare('SELECT id,student,house,points,reason,created_at FROM entries ORDER BY created_at DESC, id DESC LIMIT 10001').all();
        if (results.length>10000) return json(request,{error:'The point history is too large to load completely.'},503);
        return json(request,{entries:results.map(entry)});
      }
      if (request.method!=='POST') return json(request,{error:'Method not allowed'},405);
      if (origin!==PUBLIC_ORIGIN && origin!==SERVICE_ORIGIN) return json(request,{error:'Submit through the house points website.'},403);
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json(request,{error:'Expected a JSON point entry.'},415);
      if (Number(request.headers.get('Content-Length'))>8192) return json(request,{error:'The entry is too long.'},413);
      const reader=request.body?.getReader();
      let raw='',bytes=0;
      if (reader) {
        const decoder=new TextDecoder();
        while (true) {const chunk=await reader.read();if(chunk.done) break;bytes+=chunk.value.byteLength;if(bytes>8192){await reader.cancel();return json(request,{error:'The entry is too long.'},413);}raw+=decoder.decode(chunk.value,{stream:true});}
        raw+=decoder.decode();
      }
      let input;
      try {input=validateEntry(JSON.parse(raw));} catch(error) {return json(request,{error:error instanceof SyntaxError ? 'Check your entry and try again.' : error.message},400);}
      const result=await env.DB.prepare('INSERT INTO entries (id,student,house,points,reason,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(input.id,input.student,input.house,input.points,input.reason,new Date().toISOString()).run();
      const saved=await env.DB.prepare('SELECT id,student,house,points,reason,created_at FROM entries WHERE id = ?').bind(input.id).first();
      if (!saved) throw new Error('Missing saved entry');
      if (['student','house','points','reason'].some(key=>saved[key]!==input[key])) return json(request,{error:'That submission was already saved with different details. Refresh and try again.'},409);
      return json(request,{entry:entry(saved)},result.meta?.changes ? 201 : 200);
    } catch(error) {
      console.error('Point storage failed:',error.message);
      return json(request,{error:'Could not reach shared point storage. Your entry has not been cleared; please try again.'},503);
    }
  }
};
