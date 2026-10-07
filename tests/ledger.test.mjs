import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEntry,getStandings,entryUrl,fetchEntries,STARTING_POINTS} from '../dist/ledger.mjs';
const issue = overrides => ({number:1,state:'open',title:'[house-points] M +25',body:'Case competition',author_association:'OWNER',created_at:'2026-10-07T18:00:00Z',user:{login:'alisaayz'},...overrides});

test('students without repository access can add earned points', () => {
  assert.equal(parseEntry(issue()).points,25);
  for (const author_association of ['COLLABORATOR','MEMBER']) assert.ok(parseEntry(issue({author_association})));
  for (const author_association of ['NONE','CONTRIBUTOR','FIRST_TIMER','FIRST_TIME_CONTRIBUTOR']) assert.equal(parseEntry(issue({author_association})).points,25);
  for (const override of [{state:'closed'},{pull_request:{}},{title:'[house-points] Z +25'},{title:'[house-points] M +0'},{title:'[house-points] M +10001'},{title:'[house-points] M +2.5'},{title:'unrelated issue'},{created_at:'bad date'}]) assert.equal(parseEntry(issue(override)),null);
});
test('student deductions are excluded but organizer corrections count', () => {
  assert.equal(parseEntry(issue({title:'[house-points] M -5',author_association:'NONE'})),null);
  assert.equal(parseEntry(issue({title:'[house-points] M -5'})).points,-5);
});
test('reset starts every house at zero and new entries still add correctly', () => {
  assert.deepEqual(getStandings([]),[{house:'M',points:0,rank:1},{house:'S',points:0,rank:1},{house:'B',points:0,rank:1},{house:'A',points:0,rank:1}]);
  const standings=getStandings([parseEntry(issue({title:'[house-points] M +25',author_association:'NONE'}))]);
  assert.equal(standings.find(h=>h.house==='M').points,25);
  assert.equal(standings.reduce((sum,h)=>sum+h.points,0),25);
  assert.deepEqual(STARTING_POINTS,{M:0,S:0,B:0,A:0});
});
test('totals handle deductions and tied ranks', () => {
  const entries=[parseEntry(issue()),parseEntry(issue({number:2,title:'[house-points] M -5'})),parseEntry(issue({number:3,title:'[house-points] S +20'}))];
  assert.deepEqual(getStandings(entries,{}),[{house:'M',points:20,rank:1},{house:'S',points:20,rank:1},{house:'B',points:0,rank:3},{house:'A',points:0,rank:3}]);
});
test('prefilled entry URLs preserve reason and validate all fields', () => {
  const url=new URL(entryUrl({house:'A',points:5,reason:'Teamwork & community + spirit'}));
  assert.equal(url.searchParams.get('title'),'[house-points] A +5');
  assert.equal(url.searchParams.get('body'),'Teamwork & community + spirit');
  for (const invalid of [{house:'Z',points:5,reason:'win'},{house:'M',points:0,reason:'win'},{house:'M',points:-5,reason:'win'},{house:'M',points:2.5,reason:'win'},{house:'M',points:5,reason:' '}]) assert.throws(()=>entryUrl(invalid));
});
test('pagination includes every student entry', async () => {
  let pages=0;
  const entries=await fetchEntries(async url => {
    pages++;
    const values=url.endsWith('page=1') ? Array.from({length:100},(_,i)=>issue({number:i+1})) : [issue({number:101,title:'[house-points] B +30'}),issue({number:102,author_association:'NONE'})];
    return {ok:true,json:async()=>values};
  });
  assert.equal(pages,2);assert.equal(entries.length,102);assert.equal(getStandings(entries).find(h=>h.house==='B').points,30);
});
test('API failures do not silently publish an empty scoreboard', async () => {
  await assert.rejects(()=>fetchEntries(async()=>({ok:false,status:403})),/limit/);
});
