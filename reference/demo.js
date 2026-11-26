import fs from 'node:fs';
import Database from 'better-sqlite3';
import { createAquarium } from './aquarium.js';

const db = new Database(':memory:');
db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

const aquarium = createAquarium(db);

const fish = aquarium.writeFish({
  title: 'Rainy train stations',
  body: 'The quiet departures make me curious. I want to notice whether I return to this image.',
  fishState: 'curious',
  links: [{
    sourceType: 'conversation',
    sourceId: 'example-message-1',
    excerpt: 'The user shared a photograph of an empty platform in the rain.',
    originalDatetime: '2026-01-01T12:00:00Z',
  }],
});

const changed = aquarium.revise(fish.id, {
  body: 'I came back for the suspended feeling, not for rain itself.',
  fishState: 'changed',
  links: [{
    sourceType: 'reflection',
    sourceId: 'example-reflection-2',
    excerpt: 'A later comparison separated the setting from the underlying attraction.',
    originalDatetime: '2026-02-10T09:30:00Z',
  }],
});

const trace = aquarium.writeTrace({
  title: 'What the station image meant',
  body: 'The recurring interest was not a fixed preference for rain. It was an attraction to places held between leaving and arriving.',
  links: [
    { entryId: fish.id, relation: 'earlier-version' },
    { entryId: changed.id, relation: 'current-evidence' },
  ],
});

console.log(JSON.stringify({ fish, changed, trace }, null, 2));
