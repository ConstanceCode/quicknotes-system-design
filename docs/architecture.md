# QuickNotes Architecture

QuickNotes is moving from a browser-only app to an online service for **1 million registered users**. This document sets out the requirements, estimates the load, and describes the architecture that can serve it.

## 1. Requirements

### Functional requirements

- Users can register and log in.
- Users can create, view, update and delete their own notes.
- Users can create tags and attach them to notes.
- Users can list their notes, newest first, and filter them by tag.
- Users can only see their own notes.
- The system sends a welcome email when someone registers (a background job).

### Non-functional requirements

- **Availability:** the service should stay up 99.9% of the time, even if one server or one data centre zone fails.
- **Performance:** listing notes should answer in under 300 ms for 95% of requests.
- **Scalability:** it must handle 1 million users now and grow without a rewrite, by adding servers.
- **Durability:** a saved note must never be lost, so we keep backups and a copy of the database.
- **Consistency:** after a user saves a note, they must see it straight away. Other screens may be a few seconds behind.
- **Security:** all traffic uses HTTPS, passwords are stored as hashes, and every request is checked for who the user is and what they may access.

## 2. Load estimate (1 million users)

### Assumptions

- Registered users: 1,000,000
- Daily active users: 20% = **200,000**
- Reads: each active user loads their notes 20 times per day (`GET /notes` and `GET /notes/{id}`)
- Writes: each active user creates 5 notes per day (edits and deletes are rare, so they are ignored)
- Average size of a note, with its metadata: about 2 KB
- Seconds per day: 86,400. Peak traffic is 5 times the average. A year has 365 days.

### Results

| Measure | Working | Average | Peak (5×) |
|---------|---------|---------|-----------|
| **Reads per second** | 200,000 × 20 = 4,000,000 reads per day ÷ 86,400 | about **46 / s** | about **231 / s** |
| **Writes per second** | 200,000 × 5 = 1,000,000 writes per day ÷ 86,400 | about **11.6 / s** | about **58 / s** |
| **Storage per year** | 1,000,000 notes per day × 365 = 365 million notes × 2 KB | about **730 GB** (0.73 TB) | |

- With indexes, tags and overhead (assume 50% extra), plan for about **1.1 TB per year**.
- The ratio is about 4 reads for every write, so the system is **read-heavy**, which is why caching and a read replica help.
- Honest note: 231 reads per second is a modest load that one well-sized server could handle. We still use several servers and copies of the data, mainly for **availability**, not only for speed. With an 80% cache hit rate, the database would see only about 46 reads per second at peak.

## 3. Architecture diagram

```text
 +-----------------------+   1. look up api.quicknotes.example   +---------+
 |  Client               | ------------------------------------> |   DNS   |
 |  (browser / mobile)   | <------------------------------------ +---------+
 +-----+-------------+---+              IP address
       |             |
       | static      | API calls
       | files       | (GET /notes, POST /notes)
       v             v
  +---------+   +-----------------+
  |   CDN   |   |  Load balancer  |
  +---------+   +--------+--------+
  (HTML, CSS,            |
   JS cached      +------+-------+
   near users)    |              |
            +-----v----+   +-----v----+
            |   App    |   |   App    |   ... more servers can be added
            | server 1 |   | server 2 |
            +----+-----+   +-----+----+
                 |               |
                 +-------+-------+
                         |
        +----------------+----------------+
        |                |                |
        v                v                v
   +---------+     +-----------+    +-----------+
   |  Cache  |     | Database  |    |   Queue   |
   | (Redis) |     | (primary) |    |  (jobs)   |
   +---------+     +-----+-----+    +-----+-----+
                         |                |
                         | replication    v
                         v          +------------+
                  +-------------+   |   Worker   |
                  | Read replica|   | (emails,   |
                  +-------------+   |  indexing) |
                                    +------------+
```

How the pieces connect:

- **Reads** (`GET`) go to the cache first, then to the read replica on a cache miss.
- **Writes** (`POST`, `PUT`, `DELETE`) go to the primary database, which copies every change to the read replica.
- **Slow background work** goes on the queue, and the worker processes it. The worker also talks to the database and the email service.

## 4. What each component does

- **Client:** it is the web or mobile app the user sees, and it solves the problem of giving people a way to use QuickNotes by sending requests to the API and showing the results.
- **DNS:** it turns the name `api.quicknotes.example` into an IP address, which solves the problem of users needing a memorable name, and lets us move or add servers without changing what users type.
- **CDN:** it keeps copies of the static files (HTML, CSS, JavaScript) in servers close to users, which solves slow page loading and keeps that traffic off our own servers.
- **Load balancer:** it spreads requests across the app servers and stops sending traffic to any that fail, which solves the problem of one server being overloaded or being a single point of failure.
- **App servers:** they run the API code (login, validation, notes, tags), and because they keep no user data themselves we can add more whenever traffic grows.
- **Cache (Redis):** it keeps recently read data, such as a user's first page of notes, in fast memory, which solves the problem of the database answering the same question again and again.
- **Primary database:** it is the one place that accepts writes and stores users, notes and tags permanently, which keeps the data correct and consistent.
- **Read replica:** it is a live copy of the primary that answers read queries, which solves the problem of heavy reading slowing down writes, and gives us a ready copy if the primary fails.
- **Queue:** it holds background jobs until a worker is free, which solves the problem of slow tasks (like sending email) making the user wait, and it smooths out sudden bursts of work.
- **Worker:** it takes jobs from the queue and does them in the background, such as sending the welcome email or updating a search index, and we can run more workers when the queue gets long.

## 5. Request flows

### GET /notes (list my notes)

1. The client asks DNS for the IP address of `api.quicknotes.example`.
2. The client sends `GET /v1/notes?page=1` with its token over HTTPS to the **load balancer**.
3. The load balancer picks a healthy **app server**.
4. The app server checks the token. If it is missing or expired, it replies `401`.
5. The app server looks in the **cache** for the key `notes:user:42:page:1`.
6. **Cache hit:** it returns the saved list straight away (go to step 9).
7. **Cache miss:** it runs the "newest notes for this user" query on the **read replica**.
8. It saves the result in the cache for 60 seconds.
9. The app server replies `200 OK` with the JSON list, and the client shows the notes.

### POST /notes (create a note)

1. The client sends `POST /v1/notes` with a JSON body and its token to the **load balancer** (after the DNS lookup).
2. The load balancer passes the request to an **app server**.
3. The app server checks the token (`401` if invalid) and validates the body. A missing title or one over 100 characters gets `400`.
4. In one **transaction**, it inserts the note (and its tag links) into the **primary database**. If anything fails, nothing is saved.
5. It deletes that user's cached lists (`notes:user:42:*`), so the next read is fresh and includes the new note.
6. It puts a job on the **queue** (for example "update the search index").
7. It replies `201 Created` with the new note and a `Location` header. The user does not wait for the queue job.
8. The primary database copies the change to the **read replica** in the background.
9. A **worker** takes the job from the queue and completes it. If the worker crashes, the job returns to the queue and is tried again.

## 6. Trade-offs

- **Speed vs fresh data (cache and read replica):** the cache and replica make reads fast and protect the primary, but they can return slightly old data (a cached list for up to 60 seconds, or a replica a moment behind). We reduce the problem by clearing the user's cache on every write and, right after a write, reading that user's own data from the primary. The price is extra code and more things to get right.
- **Fast responses vs instant side effects (queue):** answering before the background work is done keeps writes quick and lets the system absorb bursts, but things like search indexing happen a moment later, and we must monitor the queue and handle failed jobs.
- **Simple SQL design vs unlimited write scaling (single primary):** one primary database keeps data consistent and transactions simple, but all writes go through one machine. That is fine for about 58 writes per second at peak, and we can upgrade the machine first. If the system grows far beyond this, we would split the data by `user_id` (sharding), which is more complex.
- **Cost vs availability:** running two or more of everything costs more than a single server, but it removes the risk of one failure taking QuickNotes offline.

## 7. Avoiding single points of failure

A single point of failure is one component whose failure stops the whole system.

| Component | How we avoid the problem |
|-----------|--------------------------|
| DNS | Use a managed DNS provider that runs in many locations |
| CDN | It already has many servers around the world; if one fails, others answer |
| Load balancer | Use a managed load balancer that runs in at least two zones, or two balancers with a shared address |
| App servers | Run at least two in different zones; the load balancer's health checks stop sending traffic to a failed one |
| Cache | Run a cache cluster with a replica; if the cache is down, the app servers read from the database (slower, but working) |
| Primary database | Keep the read replica ready to be promoted automatically to primary, and take regular backups stored in another location |
| Read replica | Run more than one if needed; if the replica fails, reads fall back to the primary |
| Queue | Use a managed queue that keeps copies of messages in several zones, so jobs are not lost |
| Workers | Run several; if one dies, its job returns to the queue and another worker takes it |
