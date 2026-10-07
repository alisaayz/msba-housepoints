import {readFile} from 'node:fs/promises';
const snapshot=JSON.parse(await readFile(new URL('../dist/snapshot.json',import.meta.url),'utf8'));
if(!Array.isArray(snapshot.entries)) throw new Error('Legacy snapshot must contain an entries array.');
console.log(`Static site ready. ${snapshot.entries.length} legacy entries retained; new points use shared storage.`);
