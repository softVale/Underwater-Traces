import crypto from 'node:crypto';

const FISH_STATES = new Set(['curious', 'exploring', 'resting', 'changed']);
const STATUSES = new Set(['current', 'superseded', 'uncertain', 'contradicted']);

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const now = () => new Date().toISOString();

function normalizeLinks(links = []) {
  if (!Array.isArray(links) || links.length > 10) throw new Error('invalid_links');

  const seen = new Set();
  return links.map((link) => {
    const normalized = link?.entryId
      ? { entryId: clean(link.entryId, 120), relation: clean(link.relation || 'evidence', 40) }
      : {
          sourceType: clean(link?.sourceType, 60),
          sourceId: clean(link?.sourceId, 120),
          excerpt: clean(link?.excerpt, 500),
          originalDatetime: clean(link?.originalDatetime, 50),
          relation: clean(link?.relation || 'evidence', 40),
        };

    const key = normalized.entryId
      ? `entry:${normalized.entryId}`
      : `source:${normalized.sourceType}:${normalized.sourceId}`;
    if ((!normalized.entryId && (!normalized.sourceType || !normalized.sourceId)) || seen.has(key)) {
      throw new Error('invalid_link');
    }
    seen.add(key);
    return normalized;
  });
}

export function createAquarium(db) {
  const insertEntry = db.prepare(`
    INSERT INTO entries
      (id, kind, author, title, body, fish_state, status, previous_id, created_at, updated_at)
    VALUES
      (@id, @kind, @author, @title, @body, @fishState, @status, @previousId, @createdAt, @updatedAt)
  `);
  const insertLink = db.prepare(`
    INSERT INTO links
      (id, entry_id, to_entry_id, source_type, source_id, excerpt, original_datetime, relation, created_at)
    VALUES
      (@id, @entryId, @toEntryId, @sourceType, @sourceId, @excerpt, @originalDatetime, @relation, @createdAt)
  `);

  const write = db.transaction((input) => {
    const kind = input.kind;
    const title = clean(input.title, 80);
    const body = clean(input.body, 6000);
    const author = clean(input.author || 'self', 80);
    const status = input.status || 'current';
    const fishState = kind === 'fish' ? input.fishState || 'curious' : null;
    const links = normalizeLinks(input.links);

    if (!['fish', 'trace'].includes(kind) || !title || !body || !author) throw new Error('invalid_entry');
    if (!STATUSES.has(status)) throw new Error('invalid_status');
    if (kind === 'fish' && !FISH_STATES.has(fishState)) throw new Error('invalid_fish_state');
    if (kind === 'trace' && status !== 'uncertain' && links.length === 0) {
      throw new Error('trace_requires_evidence');
    }

    if (input.previousId) {
      const previous = db.prepare('SELECT * FROM entries WHERE id = ?').get(input.previousId);
      if (!previous || previous.kind !== kind || previous.status !== 'current') {
        throw new Error('invalid_previous_entry');
      }
      db.prepare("UPDATE entries SET status = 'superseded', updated_at = ? WHERE id = ?")
        .run(now(), previous.id);
    }

    const id = `ut_${crypto.randomUUID()}`;
    const timestamp = now();
    insertEntry.run({
      id,
      kind,
      author,
      title,
      body,
      fishState,
      status,
      previousId: input.previousId || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    for (const link of links) {
      insertLink.run({
        id: `ul_${crypto.randomUUID()}`,
        entryId: id,
        toEntryId: link.entryId || null,
        sourceType: link.sourceType || null,
        sourceId: link.sourceId || null,
        excerpt: link.excerpt || null,
        originalDatetime: link.originalDatetime || null,
        relation: link.relation,
        createdAt: timestamp,
      });
    }

    return read(id);
  });

  function read(id) {
    const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
    if (!entry) return null;
    const links = db.prepare('SELECT * FROM links WHERE entry_id = ? ORDER BY created_at, id').all(id);
    return { ...entry, links };
  }

  function search(query = '', { kind = null, limit = 30 } = {}) {
    const q = clean(query, 120).toLowerCase();
    const cap = Math.max(1, Math.min(100, Number(limit) || 30));
    const clauses = ['1 = 1'];
    const params = [];
    if (kind) {
      clauses.push('kind = ?');
      params.push(kind);
    }
    if (q) {
      clauses.push('(instr(lower(title), ?) > 0 OR instr(lower(body), ?) > 0)');
      params.push(q, q);
    }
    params.push(cap);
    return db.prepare(`
      SELECT * FROM entries
      WHERE ${clauses.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(...params);
  }

  return {
    writeFish(input) {
      return write({ ...input, kind: 'fish' });
    },
    writeTrace(input) {
      return write({ ...input, kind: 'trace' });
    },
    revise(id, changes) {
      const previous = read(id);
      if (!previous) throw new Error('entry_not_found');
      const links = changes.links || (previous.kind === 'trace'
        ? [{ entryId: previous.id, relation: 'previous-version' }]
        : []);
      return write({
        kind: previous.kind,
        author: changes.author || previous.author,
        title: changes.title || previous.title,
        body: changes.body || previous.body,
        fishState: changes.fishState || previous.fish_state,
        status: changes.status || 'current',
        links,
        previousId: previous.id,
      });
    },
    read,
    search,
  };
}
