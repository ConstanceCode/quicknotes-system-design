# QuickNotes Data Model

The database stores the people who use QuickNotes, their notes, and the tags they use to organise those notes. It has four tables: `users`, `notes`, `tags` and `note_tags`. The SQL below is standard SQL that runs in SQLite (PostgreSQL would use `GENERATED ... AS IDENTITY` instead of `INTEGER PRIMARY KEY`).

## Entities

### `users`

| Column | Type | Keys and rules |
|--------|------|----------------|
| `id` | INTEGER | **Primary key** |
| `name` | TEXT | NOT NULL |
| `email` | TEXT | NOT NULL, UNIQUE |
| `password_hash` | TEXT | NOT NULL (never store the real password) |
| `created_at` | TEXT | NOT NULL, defaults to the current time |

### `notes`

| Column | Type | Keys and rules |
|--------|------|----------------|
| `id` | INTEGER | **Primary key** |
| `user_id` | INTEGER | **Foreign key** to `users(id)`, NOT NULL |
| `title` | TEXT | NOT NULL, 1 to 100 characters |
| `body` | TEXT | NOT NULL, defaults to an empty string |
| `created_at` | TEXT | NOT NULL, defaults to the current time |
| `updated_at` | TEXT | NOT NULL, defaults to the current time |

### `tags`

| Column | Type | Keys and rules |
|--------|------|----------------|
| `id` | INTEGER | **Primary key** |
| `user_id` | INTEGER | **Foreign key** to `users(id)`, NOT NULL |
| `name` | TEXT | NOT NULL, UNIQUE per user |

### `note_tags` (join table)

| Column | Type | Keys and rules |
|--------|------|----------------|
| `note_id` | INTEGER | **Foreign key** to `notes(id)`, part of the primary key |
| `tag_id` | INTEGER | **Foreign key** to `tags(id)`, part of the primary key |

The primary key is the pair `(note_id, tag_id)`, so a note cannot get the same tag twice.

## Relationships

- **One user has many notes (one-to-many):** each note belongs to exactly one user, stored in `notes.user_id`.
- **One user has many tags (one-to-many):** each tag belongs to one user, stored in `tags.user_id`. Two users can both have a tag called "work".
- **Notes and tags (many-to-many):** one note can have many tags (for example "work" and "urgent"), and one tag can be on many notes. A column cannot hold a list of foreign keys, so the join table `note_tags` stores one row for every note-and-tag pair.

Rule to enforce in the app: a note may only be given tags that belong to the same user. (The database keys alone do not check this.)

## CREATE TABLE statements

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  body       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE tags (
  id      INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name    TEXT NOT NULL,
  UNIQUE (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE note_tags (
  note_id INTEGER NOT NULL,
  tag_id  INTEGER NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)  REFERENCES tags (id)  ON DELETE CASCADE
);
```

`ON DELETE CASCADE` means that deleting a note also removes its rows in `note_tags`, and deleting a user removes that user's notes and tags, so no orphan rows are left behind.

## Indexes

```sql
CREATE INDEX idx_notes_user_created ON notes (user_id, created_at DESC);
CREATE INDEX idx_note_tags_tag_id ON note_tags (tag_id);
```

- **`idx_notes_user_created`:** the most common request is `GET /notes`, which asks for one user's notes, newest first. This index lets the database jump straight to that user's notes already in date order, instead of scanning every note in the table. Without it, the query gets slower as the table grows to hundreds of millions of rows.
- **`idx_note_tags_tag_id`:** the primary key of `note_tags` already makes "which tags does this note have?" fast. This second index makes the opposite question fast: "which notes have this tag?" (used by `GET /notes?tag=work`).
- `users.email` and `tags (user_id, name)` get indexes automatically from their `UNIQUE` rules, so logging in by email is already fast.

## Sample data (to try the queries)

```sql
INSERT INTO users (id, name, email, password_hash) VALUES
  (1, 'Amina Hassan', 'amina@example.com', 'hash1'),
  (2, 'Brian Otieno', 'brian@example.com', 'hash2');

INSERT INTO tags (id, user_id, name) VALUES
  (1, 1, 'work'), (2, 1, 'personal'), (3, 1, 'study'), (4, 2, 'work');

INSERT INTO notes (id, user_id, title, body, created_at) VALUES
  (1, 1, 'Buy milk',          '2 litres',          '2026-11-05 08:00:00'),
  (2, 1, 'Send report',       'Email Grace',       '2026-11-06 09:15:00'),
  (3, 1, 'Revise SQL joins',  '',                  '2026-11-07 18:05:00'),
  (4, 2, 'Plan the sprint',   'Monday 9am',        '2026-11-07 07:30:00');

INSERT INTO note_tags (note_id, tag_id) VALUES
  (1, 2), (2, 1), (3, 3), (3, 1), (4, 4);
```

## Example queries

**1. The 10 newest notes for one user** (what `GET /notes` runs; uses `idx_notes_user_created`)

```sql
SELECT id, title, created_at
FROM notes
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 10 OFFSET 0;
```

**2. Each note with its tags (a JOIN across three tables)**

```sql
SELECT n.title, t.name AS tag
FROM notes AS n
JOIN note_tags AS nt ON nt.note_id = n.id
JOIN tags      AS t  ON t.id = nt.tag_id
WHERE n.user_id = 1
ORDER BY n.created_at DESC, t.name;
```

**3. All of a user's notes that have the tag "work"** (what `GET /notes?tag=work` runs)

```sql
SELECT n.id, n.title
FROM notes AS n
JOIN note_tags AS nt ON nt.note_id = n.id
JOIN tags      AS t  ON t.id = nt.tag_id
WHERE n.user_id = 1 AND t.name = 'work';
```

**4. How many notes each tag has (LEFT JOIN keeps tags with zero notes)**

```sql
SELECT t.name, COUNT(nt.note_id) AS note_count
FROM tags AS t
LEFT JOIN note_tags AS nt ON nt.tag_id = t.id
WHERE t.user_id = 1
GROUP BY t.id, t.name
ORDER BY note_count DESC;
```

**5. Delete a note** (its `note_tags` rows disappear automatically)

```sql
DELETE FROM notes WHERE id = 1 AND user_id = 1;
```

## SQL or NoSQL?

I would choose **SQL** (for example PostgreSQL). QuickNotes data is clearly structured and connected: users own notes, and notes and tags have a many-to-many relationship that is queried in both directions ("tags on this note" and "notes with this tag"). Relational databases handle that naturally with joins, and they enforce our rules in the database itself: unique emails, valid owners, titles of 1 to 100 characters, and no duplicate tags on a note. Writes such as "create a note and attach its tags" can be wrapped in a transaction, so they either fully succeed or fully fail. The size is also comfortable for SQL: even with 1 million users, the data grows by under 1 TB a year, which one primary database with a read replica can handle. A NoSQL document database would suit notes with a very flexible shape or a need for huge write scaling across many machines, but here we would have to duplicate tags inside notes and keep them in sync by hand. If we later need full-text search, we can add a search engine next to the SQL database instead of replacing it.
