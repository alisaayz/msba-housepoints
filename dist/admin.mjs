import {editorRequest} from './service.mjs?v=13';
import {HOUSES} from './ledger.mjs?v=13';
const $=selector=>document.querySelector(selector);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function initEditor(onChange){
 let token=null,editorState=null,editingId=null,working=false,expiresAt=0;
 const status=$('#editor-status');
 function lock(message='Editor locked.'){
  token=null;expiresAt=0;editorState=null;
  $('#editor-workspace').hidden=true;$('#editor-login').hidden=false;
  $('#editor-login [name=password]').value='';$('#editor-entries').replaceChildren();$('#approval-list').replaceChildren();
  $('#entry-edit-dialog').close();status.textContent=message;
 }
 function render(){
  for(const house of HOUSES){$('#editor-totals [name='+house+']').value=editorState.totals[house];$('#editor-names [name='+house+']').value=editorState.houseNames?.[house]||'House '+house;}
  const houseName=house=>editorState.houseNames?.[house]||'House '+house;
  const pending=editorState.entries.filter(entry=>!entry.deletedAt&&entry.status==='pending').sort((a,b)=>new Date(a.date)-new Date(b.date)||a.id.localeCompare(b.id));
  $('#approval-count').textContent=pending.length+' pending';
  $('#approval-list').innerHTML=pending.length?pending.map(entry=>{
   const date=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(entry.date));
   return `<article class="approval-card"><div class="approval-details"><div class="approval-person"><span class="activity-badge ${entry.house.toLowerCase()}" aria-label="House ${entry.house}">${entry.house}</span><div class="approval-name-points"><h4>${escape(entry.student)}</h4><span class="approval-divider" aria-hidden="true">|</span><span class="approval-points">${entry.points} ${entry.points===1?'point':'points'}</span></div></div><p class="approval-reason">${escape(entry.reason)}</p><p class="approval-date">Pending approval · Submitted ${escape(date)}</p></div><div class="approval-actions"><button type="button" class="button dark" data-action="approve" data-id="${escape(entry.id)}">Approve</button><button type="button" class="button outline" data-action="edit" data-id="${escape(entry.id)}">Edit</button><button type="button" class="button outline danger" data-action="delete" data-id="${escape(entry.id)}">Reject</button></div></article>`;
  }).join(''):'<div class="approval-empty">No entries awaiting approval. You’re all caught up.</div>';
  const rows=editorState.entries.filter(entry=>$('#editor-deleted').checked?entry.deletedAt:!entry.deletedAt&&entry.status==='approved');
  $('#editor-entries').innerHTML=rows.length?rows.map(entry=>`<tr><td>${escape(entry.student)}</td><td>${escape(houseName(entry.house))} (${entry.house})</td><td>${entry.points}</td><td>${escape(entry.reason)}</td><td>${entry.deletedAt?(entry.status==='pending'?'Rejected':'Deleted'):'Approved'}</td><td class="entry-actions">${entry.deletedAt?`<button type="button" data-action="restore" data-id="${escape(entry.id)}">Restore</button>`:`<button type="button" data-action="edit" data-id="${escape(entry.id)}">Edit</button><button type="button" data-action="delete" data-id="${escape(entry.id)}" class="danger">Delete</button>`}</td></tr>`).join(''):'<tr><td colspan="6">No entries to show.</td></tr>';
 }
 function show(data){editorState=data;$('#editor-login').hidden=true;$('#editor-workspace').hidden=false;render();onChange(data);}
 async function act(path,data){
  if(working)throw new Error('A change is already being saved.');
  if(!token||Date.now()>=expiresAt){lock('Session expired. Unlock the editor again.');throw new Error('Unlock the editor again.');}
  working=true;status.textContent=path==='state'?'Refreshing approvals…':'Saving…';
  try{const result=await editorRequest(path,data,token);show(result);status.textContent=path==='approve'?'Entry approved and posted.':path==='state'?'Approval list refreshed.':'Changes saved.';return result;}
  catch(error){if(error.status===401)lock(error.message);else status.textContent=error.message;throw error;}
  finally{working=false;}
 }
 $('#editor-login').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;status.textContent='Unlocking…';
  try{const result=await editorRequest('login',{password:$('#editor-login [name=password]').value});$('#editor-login [name=password]').value='';token=result.token;expiresAt=result.expiresAt;const data=await editorRequest('state',null,token);show(data);status.textContent='Editor unlocked. Review pending approvals below.';}
  catch(error){lock(error.message);}finally{button.disabled=false;}
 });
 $('#editor-lock').addEventListener('click',()=>lock());
 $('#approval-refresh').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{await act('state',null);}catch{}finally{button.disabled=false;}});
 $('#editor-deleted').addEventListener('change',render);
 $('#editor-names').addEventListener('submit',async event=>{event.preventDefault();const form=new FormData(event.currentTarget);try{await act('names',{houseNames:Object.fromEntries(HOUSES.map(house=>[house,String(form.get(house)).trim()]))});}catch{}});
 $('#editor-totals').addEventListener('submit',async event=>{event.preventDefault();const form=new FormData(event.currentTarget);try{await act('totals',{totals:Object.fromEntries(HOUSES.map(house=>[house,Number(form.get(house))]))});}catch{}});
 async function entryAction(event){
  const button=event.target.closest('button[data-action]');if(!button||!editorState)return;
  const entry=editorState.entries.find(item=>item.id===button.dataset.id);if(!entry)return;
  if(button.dataset.action==='edit'){
   editingId=entry.id;for(const field of ['student','house','points','reason'])$('#entry-edit-form [name='+field+']').value=entry[field];
   $('#entry-edit-title').textContent=entry.status==='pending'?'Edit pending entry':'Edit entry';
   $('#edit-status').textContent=entry.status==='pending'?'Saving changes keeps this entry pending. Approve it when you are ready.':'';
   $('#entry-edit-dialog').showModal();return;
  }
  button.disabled=true;try{await act(button.dataset.action,{id:entry.id});}catch{}finally{button.disabled=false;}
 }
 $('#approval-list').addEventListener('click',entryAction);
 $('#editor-entries').addEventListener('click',entryAction);
 $('#edit-close').addEventListener('click',()=>$('#entry-edit-dialog').close());
 $('#entry-edit-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=new FormData(event.currentTarget);
  try{await act('edit',{id:editingId,student:form.get('student'),house:form.get('house'),points:Number(form.get('points')),reason:form.get('reason')});$('#entry-edit-dialog').close();}
  catch(error){$('#edit-status').textContent=error.message;}
 });
 $('#editor-reset').addEventListener('click',async()=>{if(!confirm('Reset every house to zero and remove approved and pending entries? Deleted entries can be restored in the editor.'))return;try{await act('reset',{});}catch{}});
 window.addEventListener('pagehide',()=>lock());
}
