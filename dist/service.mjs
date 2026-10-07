export const API_URL=typeof location!=='undefined' && ['localhost','127.0.0.1'].includes(location.hostname) ? location.origin+'/api/entries' : 'https://msba-housepoints-data.zhaoheng988.chatgpt.site/entries';
export function validateStudentEntry(input) {
  if (!input || typeof input.student!=='string' || !input.student.trim() || input.student.trim().length>40) throw new Error('Enter a name or nickname (up to 40 characters).');
  if (!['M','S','B','A'].includes(input.house)) throw new Error('Choose your house.');
  if (!Number.isSafeInteger(input.points) || input.points<1 || input.points>10000) throw new Error('Enter whole points between 1 and 10,000.');
  if (typeof input.reason!=='string' || !input.reason.trim() || input.reason.trim().length>300) throw new Error('Add your activity (up to 300 characters).');
  return {student:input.student.trim(),house:input.house,points:input.points,reason:input.reason.trim()};
}
async function request(options={}) {
  let response;
  try {response=await fetch(API_URL,{...options,cache:'no-store',signal:AbortSignal.timeout(15000)});} catch {throw new Error('Could not reach shared points. Check your connection and try again.');}
  let body;
  try {body=await response.json();} catch {throw new Error('Shared points are temporarily unavailable. Please try again.');}
  if (!response.ok) throw new Error(body.error || 'Shared points are temporarily unavailable.');
  return body;
}
export async function fetchStudentEntries() {
  const result=await request();
  if (!Array.isArray(result.entries)) throw new Error('The scoreboard returned an unexpected response.');
  return result.entries;
}
export async function saveStudentEntry(input) {
  const valid=validateStudentEntry(input);
  return request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:input.id,...valid})});
}
