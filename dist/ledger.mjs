export const REPOSITORY = 'alisaayz/msba-housepoints';
export const HOUSES = ['M', 'S', 'B', 'A'];
export const STARTING_POINTS = Object.freeze({M: 95, S: 83, B: 115, A: 134});
const ORGANIZERS = new Set(['OWNER', 'COLLABORATOR', 'MEMBER']);

export function parseEntry(issue) {
  if (!issue || issue.pull_request || issue.state !== 'open') return null;
  const match = /^\[house-points\] ([MSBA]) ([+-]\d{1,5})$/.exec(issue.title || '');
  if (!match) return null;
  const points = Number(match[2]);
  if (!Number.isSafeInteger(points) || points === 0 || Math.abs(points) > 10000) return null;
  // Students may report earned points; deductions remain organizer corrections.
  if (points < 0 && !ORGANIZERS.has(issue.author_association)) return null;
  if (!Number.isSafeInteger(issue.number) || issue.number < 1 || !Number.isFinite(Date.parse(issue.created_at))) return null;
  return {
    id: issue.number,
    house: match[1],
    points,
    reason: String(issue.body || '').trim().slice(0, 300) || 'House points',
    student: String(issue.user?.login || 'Student').slice(0, 39),
    date: issue.created_at,
    url: `https://github.com/${REPOSITORY}/issues/${issue.number}`,
  };
}

export function getStandings(entries, startingPoints = STARTING_POINTS) {
  const totals = Object.fromEntries(HOUSES.map(house => [house, startingPoints[house] || 0]));
  for (const entry of entries) totals[entry.house] += entry.points;
  const sorted = [...HOUSES].sort((a, b) => totals[b] - totals[a]);
  return HOUSES.map(house => ({house, points: totals[house], rank: 1 + sorted.filter(other => totals[other] > totals[house]).length}));
}

export function entryUrl({house, points, reason}) {
  if (!HOUSES.includes(house) || !Number.isSafeInteger(points) || points < 1 || points > 10000 || !String(reason).trim() || String(reason).length > 300) throw new Error('Choose your house, enter whole points between 1 and 10,000, and add a reason.');
  const params = new URLSearchParams({title: `[house-points] ${house} ${points > 0 ? '+' : ''}${points}`, body: String(reason).trim()});
  return `https://github.com/${REPOSITORY}/issues/new?${params}`;
}

export async function fetchEntries(fetcher = fetch, headers = {}) {
  const all = [];
  for (let page = 1; page <= 100; page++) {
    const response = await fetcher(`https://api.github.com/repos/${REPOSITORY}/issues?state=open&per_page=100&page=${page}`, {headers: {Accept: 'application/vnd.github+json', ...headers}, cache: 'no-store'});
    if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub’s live update limit was reached. Try again later.' : 'The live scoreboard could not be reached.');
    const issues = await response.json();
    if (!Array.isArray(issues)) throw new Error('The live scoreboard returned an unexpected response.');
    all.push(...issues.map(parseEntry).filter(Boolean));
    if (issues.length < 100) return all.sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
  }
  throw new Error('The point ledger is too large to load completely.');
}
