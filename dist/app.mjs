import {HOUSES, getStandings} from './ledger.mjs?v=4';
import {validateStudentEntry,fetchStudentEntries,saveStudentEntry} from './service.mjs?v=4';
const $ = selector => document.querySelector(selector);
const format = number => new Intl.NumberFormat('en-US').format(number);
let entries = [], loaded = false, busy = false, lastLoad = 0, visibleCount = 12;
let legacyEntries=[],saving=false,pendingEntry=null,dataRevision=0;
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));

function render() {
  const standings = getStandings(entries);
  const maximum = Math.max(0, ...standings.map(house => house.points));
  $('#house-grid').innerHTML = standings.map(({house, points}) => `<article class="house-card ${house.toLowerCase()}" aria-label="House ${house}, ${loaded ? `${points} points` : 'loading'}"><div class="house-top"><span class="house-name">HOUSE ${house}</span></div><div class="house-letter" aria-hidden="true">${house}</div><div class="score-row"><span class="score">${loaded ? format(points) : '—'}</span><span class="score-label">points</span></div><div class="house-bar" aria-hidden="true"><div class="house-bar-fill" style="width:${maximum ? Math.max(0, points) / maximum * 100 : 0}%"></div></div></article>`).join('');
  $('#total-points').textContent = loaded ? `${format(standings.reduce((sum, house) => sum + house.points, 0))} points earned together` : '— points earned together';
  $('#race-message').textContent = !loaded ? 'The scoreboard is getting ready.' : entries.length ? `${format(entries.length)} ${entries.length === 1 ? 'contribution' : 'contributions'} shared by our community.` : 'Share your next activity with the community.';
  renderActivity();
}

function renderActivity() {
  const house = $('#house-filter').value;
  const filtered = entries.filter(entry => house === 'all' || entry.house === house);
  $('#activity-list').innerHTML = filtered.length ? filtered.slice(0, visibleCount).map(entry => {
    const date = new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',year:'numeric'}).format(new Date(entry.date));
    return `<article class="activity-row"><span class="activity-badge ${entry.house.toLowerCase()}">${entry.house}</span><div class="activity-details"><p class="activity-reason">${escape(entry.reason)}</p><p class="activity-meta">${escape(entry.student)} · House ${entry.house} · ${escape(date)}</p></div><div class="activity-points ${entry.points < 0 ? 'negative' : ''}">${entry.points > 0 ? '+' : '−'}${format(Math.abs(entry.points))}<span>points</span></div></article>`;
  }).join('') : `<div class="empty-state"><div class="empty-symbol" aria-hidden="true">+</div><h3>${!loaded ? 'Getting the latest points' : house !== 'all' ? `Share a moment with House ${house}.` : 'Share your next experience.'}</h3><p>${!loaded ? 'Connecting to the shared scoreboard.' : 'Record an activity, event, or moment you shared with your classmates.'}</p></div>`;
  $('#show-more').hidden = filtered.length <= visibleCount;
}

async function refresh() {
  if (busy || saving) return;
  const revision=dataRevision;
  busy = true; $('#refresh').disabled = true; $('#sync-status').textContent = 'Checking shared points…';
  try {
    const current=await fetchStudentEntries();
    if (revision!==dataRevision) return;
    entries = [...current,...legacyEntries].sort((a,b)=>new Date(b.date)-new Date(a.date)); loaded = true; lastLoad = Date.now();
    render(); $('#load-notice').hidden = true;
    $('#sync-status').textContent = `Updated ${new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(new Date())}`;
  } catch (error) {
    $('#sync-status').textContent = loaded ? 'Saved scoreboard' : 'Updates unavailable';
    $('#load-notice').textContent = `${error.message} ${loaded ? 'Showing the last loaded scoreboard. Recent submissions may be missing.' : 'Use Refresh to try again.'}`;
    $('#load-notice').hidden = false;
    if (!loaded) { $('#race-message').textContent = 'The shared scoreboard is temporarily unavailable.'; $('#activity-list').innerHTML = '<div class="empty-state"><h3>Points are temporarily unavailable.</h3><p>Refresh to try again. Your saved point entries are still in shared storage.</p></div>'; }
  } finally {busy = false; $('#refresh').disabled = false;}
}

function openEntry(scroll = true) {
  $('#entry-panel').hidden = false; $('#entry-toggle').setAttribute('aria-expanded','true');
  if (scroll) {$('#entry-panel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'start'}); $('#points-form [name=student]').focus({preventScroll:true});}
}
$('#entry-toggle').addEventListener('click', () => {
  if ($('#entry-panel').hidden) openEntry(); else {$('#entry-panel').hidden = true; $('#entry-toggle').setAttribute('aria-expanded','false');}
});
$('#bottom-add').addEventListener('click', () => openEntry());
$('#refresh').addEventListener('click', refresh);
$('#house-filter').addEventListener('change', () => {visibleCount = 12; renderActivity();});
$('#show-more').addEventListener('click', () => {visibleCount += 12; renderActivity();});
async function submitEntry(input) {
  if(saving) throw new Error('Your entry is being saved.');
  const valid=validateStudentEntry(input);
  if (!pendingEntry || JSON.stringify(pendingEntry.input)!==JSON.stringify(valid)) pendingEntry={id:crypto.randomUUID(),input:valid};
  saving=true;
  const button=$('#points-form [type=submit]');button.disabled=true;button.textContent='Saving…';
  $('#form-status').textContent='Saving your points…';
  try {
    const result=await saveStudentEntry({id:pendingEntry.id,...valid});
    if(!result.entry) throw new Error('The save could not be confirmed. Please try again.');
    dataRevision++;
    entries=[result.entry,...entries.filter(entry=>entry.id!==result.entry.id)];
    loaded=true;lastLoad=Date.now();pendingEntry=null;render();$('#load-notice').hidden=true;
    $('#sync-status').textContent='Points saved';
    $('#form-status').textContent=`Saved! +${format(valid.points)} points for House ${valid.house}. Thanks, ${valid.student}.`;
    $('#points-form [name=points]').value='';$('#points-form [name=reason]').value='';
    return {status:'saved',entry:result.entry,standings:getStandings(entries)};
  } catch(error) {$('#form-status').textContent=error.message+' Your entry is still here; you can retry.';throw error;}
  finally {saving=false;button.disabled=false;button.textContent='Submit points';}
}
$('#points-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const form = new FormData(event.currentTarget);
    await submitEntry({student:form.get('student'),house:form.get('house'),points:Number(form.get('points')),reason:form.get('reason')});
  } catch (error) {$('#form-status').textContent = error.message;}
});
window.addEventListener('focus', () => {if (Date.now() - lastLoad > 30000) void refresh();});

render();
try {
  const response = await fetch('./snapshot.json', {cache:'no-cache'});
  if (response.ok) {
    const snapshot = await response.json();
    if (Array.isArray(snapshot.entries)) {
      legacyEntries = snapshot.entries.filter(entry => HOUSES.includes(entry.house) && Number.isSafeInteger(entry.points) && Math.abs(entry.points) <= 10000 && Number.isFinite(Date.parse(entry.date)) && entry.url === `https://github.com/alisaayz/msba-housepoints/issues/${entry.id}`);
      entries=[...legacyEntries];
      loaded = true; render();
    }
  }
} catch {}
void refresh();

if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), {once:true});
  for (const tool of [
    {name:'read_house_scoreboard',description:'Read the displayed shared MSBA house standings and point entries.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:() => ({loaded,standings:loaded ? getStandings(entries) : [],entries,sync:$('#sync-status').textContent})},
    {name:'stage_house_point_entry',description:'Fill the visible student point form with name, house, points, and activity. Does not save; use Submit points to save.',inputSchema:{type:'object',properties:{student:{type:'string',minLength:1,maxLength:40},house:{type:'string',enum:HOUSES},points:{type:'integer',minimum:1,maximum:10000},reason:{type:'string',minLength:1,maxLength:300}},required:['student','house','points','reason'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input => {const valid=validateStudentEntry(input);openEntry(false);for(const field of ['student','house','points','reason']) $('#points-form [name='+field+']').value=valid[field];$('#form-status').textContent='Entry prepared. Submit points to save.';return {status:'staged',...valid};}},
    {name:'submit_house_point_entry',description:'Save a student’s name, house, points, and activity to the public shared scoreboard. No login required; completes a submission.',inputSchema:{type:'object',properties:{student:{type:'string',minLength:1,maxLength:40},house:{type:'string',enum:HOUSES},points:{type:'integer',minimum:1,maximum:10000},reason:{type:'string',minLength:1,maxLength:300}},required:['student','house','points','reason'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async input => {const valid=validateStudentEntry(input);openEntry(false);for(const field of ['student','house','points','reason']) $('#points-form [name='+field+']').value=valid[field];return submitEntry(valid);}},
  ]) {try {Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(() => {});} catch {}}
}
