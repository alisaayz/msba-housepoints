import {editorRequest} from './service.mjs?v=5';
import {HOUSES} from './ledger.mjs?v=5';
const $=selector=>document.querySelector(selector);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function initEditor(onChange){
 let token=null,editorState=null,editingId=null,working=false,expiresAt=0;
 const status=$('#editor-status');
 function lock(message='Editor locked.'){token=null;expiresAt=0;editorState=null;$('#editor-workspace').hidden=true;$('#editor-login').hidden=false;$('#editor-login [name=password]').value='';$('#editor-entries').replaceChildren();$('#entry-edit-dialog').close();status.textContent=message;}
 function render(){
  for(const house of HOUSES)$('#editor-totals [name='+house+']').value=editorState.totals[house];
  const rows=editorState.entries.filter(entry=>$('#editor-deleted').checked?entry.deletedAt:!entry.deletedAt);
  $('#editor-entries').innerHTML=rows.length?rows.map(entry=>`<tr><td>${escape(entry.student)}</td><td>${entry.house}</td><td>${entry.points}</td><td>${escape(entry.reason)}</td><td class="entry-actions">${entry.deletedAt?`<button type="button" data-action="restore" data-id="${escape(entry.id)}">Restore</button>`:`<button type="button" data-action="edit" data-id="${escape(entry.id)}">Edit</button><button type="button" data-action="delete" data-id="${escape(entry.id)}" class="danger">Delete</button>`}</td></tr>`).join(''):'<tr><td colspan="5">No entries to show.</td></tr>';
 }
 function show(data){editorState=data;$('#editor-login').hidden=true;$('#editor-workspace').hidden=false;render();onChange(data);}
 async function act(path,data){
  if(working)throw new Error('A change is already being saved.');
  if(!token||Date.now()>=expiresAt){lock('Session expired. Unlock the editor again.');throw new Error('Unlock the editor again.');}
  working=true;status.textContent='Saving…';
  try{const result=await editorRequest(path,data,token);show(result);status.textContent='Changes saved.';return result;}
  catch(error){if(error.status===401)lock(error.message);else status.textContent=error.message;throw error;}
  finally{working=false;}
 }
 $('#editor-login').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;status.textContent='Unlocking…';
  try{const result=await editorRequest('login',{password:$('#editor-login [name=password]').value});$('#editor-login [name=password]').value='';token=result.token;expiresAt=result.expiresAt;const data=await editorRequest('state',null,token);show(data);status.textContent='Editor unlocked. Lock it when you are finished.';}
  catch(error){lock(error.message);}finally{button.disabled=false;}
 });
 $('#editor-lock').addEventListener('click',()=>lock());
 $('#editor-deleted').addEventListener('change',render);
 $('#editor-totals').addEventListener('submit',async event=>{event.preventDefault();const form=new FormData(event.currentTarget);try{await act('totals',{totals:Object.fromEntries(HOUSES.map(house=>[house,Number(form.get(house))]))});}catch{}});
 $('#editor-entries').addEventListener('click',async event=>{
  const button=event.target.closest('button[data-action]');if(!button)return;const entry=editorState.entries.find(item=>item.id===button.dataset.id);if(!entry)return;
  if(button.dataset.action==='edit'){editingId=entry.id;for(const field of ['student','house','points','reason'])$('#entry-edit-form [name='+field+']').value=entry[field];$('#edit-status').textContent='';$('#entry-edit-dialog').showModal();return;}
  button.disabled=true;try{await act(button.dataset.action,{id:entry.id});}catch{}finally{button.disabled=false;}
 });
 $('#edit-close').addEventListener('click',()=>$('#entry-edit-dialog').close());
 $('#entry-edit-form').addEventListener('submit',async event=>{event.preventDefault();const form=new FormData(event.currentTarget);try{await act('edit',{id:editingId,student:form.get('student'),house:form.get('house'),points:Number(form.get('points')),reason:form.get('reason')});$('#entry-edit-dialog').close();}catch(error){$('#edit-status').textContent=error.message;}});
 $('#editor-reset').addEventListener('click',async()=>{if(!confirm('Reset every house to zero and remove current entries? Deleted entries can be restored in the editor.'))return;try{await act('reset',{});}catch{}});
 window.addEventListener('pagehide',()=>lock());
}
