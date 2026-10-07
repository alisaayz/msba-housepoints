import {writeFile} from 'node:fs/promises';
import {fetchEntries} from '../dist/ledger.mjs';

const headers = process.env.GITHUB_TOKEN ? {Authorization: `Bearer ${process.env.GITHUB_TOKEN}`} : {};
const entries = await fetchEntries(fetch, headers);
await writeFile(new URL('../dist/snapshot.json', import.meta.url), `${JSON.stringify({updatedAt:new Date().toISOString(),entries},null,2)}\n`);
console.log(`Published snapshot: ${entries.length} house point entries.`);
