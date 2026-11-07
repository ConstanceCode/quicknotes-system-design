# QuickNotes: API Client and Design Documents

QuickNotes is moving from a browser-only app to a real online service for 1 million people. This project has two halves. The first is a small web client that proves the front end can talk to an API: it loads, creates and deletes notes using the JSONPlaceholder practice API with `fetch`. The second is a set of design documents that the backend team can build the real QuickNotes service from: the API, the data model and the system architecture.

## Features of the API client

- **Load notes (GET):** loads 10 notes from the server and shows each title and body
- **Create notes (POST):** adds a new note, then shows the status code and id returned by the server
- **Delete notes (DELETE):** each note has a Delete button that removes it after the server says OK
- **Four states:** loading, success, error and empty messages are always shown on the page
- **Validation:** a title is required and can be at most 100 characters; the body is optional
- **Buttons disabled while requests are running**, so nothing is sent twice
- **Safe output:** all text from users and the server is inserted with `textContent`

## How to run the API client

1. Download or clone the project:
   ```bash
   git clone https://github.com/YOUR-USERNAME/YOUR-REPO.git
   cd YOUR-REPO
   ```
2. Open `index.html` in your browser (double-click it). There is nothing to install, but you need an internet connection because the page calls `https://jsonplaceholder.typicode.com/posts`.
3. Optional: serve it from a local server instead:
   ```bash
   python3 -m http.server 8000
   ```
   Then visit `http://localhost:8000`.
4. Click **Load notes**, try the form, and try the **Delete** buttons.

**A note about JSONPlaceholder:** it only pretends to save changes. New notes always come back with the id 101, and deleted notes reappear the next time you load. The client handles this by updating the page only after the server confirms success (see the comment above `deleteNote` in `api.js`).

## Project files

| File | Purpose |
|------|---------|
| `index.html` | Page structure: load button, status message, form and notes list |
| `api.js` | `request()`, GET, POST and DELETE functions, validation and page updates |
| `style.css` | Styling, including distinct success and error messages |
| `docs/` | The three design documents below |

## Design documents

- [API design](docs/api-design.md): the REST endpoints, request and response examples, and error codes
- [Data model](docs/data-model.md): tables, keys, relationships, SQL, indexes and the SQL vs NoSQL decision
- [Architecture](docs/architecture.md): requirements, load estimates, diagram, request flows, trade-offs and single points of failure

## What I learned

- A reusable `request()` function that calls `fetch`, checks `response.ok` and throws on errors means every other function only needs one `try / catch / finally`.
- `fetch` does not reject on a 404 or 500 response, so checking `response.ok` is essential. A `finally` block is the right place to re-enable buttons.
- The four states of a request (loading, success, error and empty) are what make an app feel reliable, and disabling buttons while waiting prevents duplicate requests.
- A practice API can behave differently from a real one: JSONPlaceholder gives every new note the same id, so I removed the exact card that was clicked instead of searching by id.
- A many-to-many relationship (notes and tags) needs a join table, and indexes should match the queries the app runs most often.
- Estimating load (reads and writes per second, storage per year) comes before choosing components, and extra servers are often there for availability, not only for speed.
