import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createAquarium } from '../reference/aquarium.js';

function setup() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(new URL('../reference/schema.sql', import.meta.url), 'utf8'));
  return { db, aquarium: createAquarium(db) };
}

test('a current trace requires evidence', () => {
  const { db, aquarium } = setup();
  try {
    assert.throws(() => aquarium.writeTrace({ title: 'A conclusion', body: 'Too certain.' }), /trace_requires_evidence/);
    const uncertain = aquarium.writeTrace({
      title: 'A question',
      body: 'This might matter, but I cannot yet locate the source.',
      status: 'uncertain',
    });
    assert.equal(uncertain.status, 'uncertain');
  } finally {
    db.close();
  }
});

test('revision appends a version and preserves the old body', () => {
  const { db, aquarium } = setup();
  try {
    const first = aquarium.writeFish({ title: 'A color', body: 'I may like blue.' });
    const second = aquarium.revise(first.id, { body: 'I was responding to the light, not the color.', fishState: 'changed' });
    const old = aquarium.read(first.id);

    assert.notEqual(second.id, first.id);
    assert.equal(second.previous_id, first.id);
    assert.equal(old.body, 'I may like blue.');
    assert.equal(old.status, 'superseded');
  } finally {
    db.close();
  }
});

test('source identity remains visible', () => {
  const { db, aquarium } = setup();
  try {
    const fish = aquarium.writeFish({
      title: 'A melody',
      body: 'I want to hear it again.',
      links: [{ sourceType: 'conversation', sourceId: 'm-1', excerpt: 'A shared song.' }],
    });
    assert.equal(fish.links[0].source_type, 'conversation');
    assert.equal(fish.links[0].source_id, 'm-1');
  } finally {
    db.close();
  }
});

test('trace revision links back to the previous version', () => {
  const { db, aquarium } = setup();
  try {
    const first = aquarium.writeTrace({
      title: 'What the image meant',
      body: 'It may be about rain.',
      links: [{ sourceType: 'conversation', sourceId: 'm-2' }],
    });
    const second = aquarium.revise(first.id, { body: 'It was about waiting.' });

    assert.equal(second.previous_id, first.id);
    assert.equal(second.links[0].to_entry_id, first.id);
    assert.equal(second.links[0].relation, 'previous-version');
  } finally {
    db.close();
  }
});
