// QuickNotes API client
// Talks to the JSONPlaceholder practice API using fetch, async / await and try / catch.

// ----- Select elements -----
const loadBtn = document.querySelector("#load-btn");
const statusMessage = document.querySelector("#status");
const notesList = document.querySelector("#notes-list");
const noteForm = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");
const submitBtn = document.querySelector("#submit-btn");

// ----- Constants and state -----
const API_URL = "https://jsonplaceholder.typicode.com/posts";
const MAX_TITLE_LENGTH = 100;

// true while a request is running (used so new cards start with the right button state)
let busy = false;

// ----- Page helpers -----

// Show a message in #status. type is "loading", "success" or "error" (it controls the colour).
function setStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = type;
}

// Disable the buttons while a request is running, enable them again afterwards
function setBusy(isBusy) {
  busy = isBusy;
  loadBtn.disabled = isBusy;
  submitBtn.disabled = isBusy;
}

// Empty state: shown when there are no notes to display
function showEmptyMessage() {
  const message = document.createElement("li");
  message.className = "empty-message";
  message.textContent = "No notes to show yet.";
  notesList.appendChild(message);
}

function removeEmptyMessage() {
  const message = notesList.querySelector(".empty-message");
  if (message) {
    message.remove();
  }
}

// Build one note card. All user and server text is inserted with textContent only.
function createNoteCard(note) {
  const card = document.createElement("li");
  card.className = "note-card";

  const title = document.createElement("h3");
  title.textContent = note.title;
  card.appendChild(title);

  if (note.body) {
    const body = document.createElement("p");
    body.className = "note-body";
    body.textContent = note.body;
    card.appendChild(body);
  }

  const meta = document.createElement("div");
  meta.className = "note-meta";

  const idLabel = document.createElement("span");
  idLabel.textContent = `Note #${note.id}`;
  meta.appendChild(idLabel);

  card.appendChild(meta);
  return card;
}

// Rebuild the list from an array of notes
function renderNotes(notes) {
  notesList.textContent = "";

  if (notes.length === 0) {
    showEmptyMessage();
    return;
  }

  for (const note of notes) {
    notesList.appendChild(createNoteCard(note));
  }
}

// ----- The reusable request function -----

// Calls fetch, throws if the server answers with an error status, and
// returns { status, data } when everything is fine.
// A network failure makes fetch itself throw, so callers only need one try / catch.
async function request(url, options = {}) {
  const config = { ...options, headers: { ...(options.headers || {}) } };

  // Only requests that send JSON need this header (keeps GET and DELETE simple)
  if (config.body) {
    config.headers["Content-Type"] = "application/json; charset=UTF-8";
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  // Some successful responses have no body (for example 204), so check before parsing
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  return { status: response.status, data };
}

// ----- GET: load 10 notes -----
async function loadNotes() {
  setBusy(true);
  setStatus("Loading notes...", "loading");

  try {
    const { data } = await request(`${API_URL}?_limit=10`);

    if (!Array.isArray(data)) {
      throw new Error("The server did not send a list of notes.");
    }

    renderNotes(data);

    if (data.length === 0) {
      setStatus("The server has no notes to show.", "success");
    } else {
      const word = data.length === 1 ? "note" : "notes";
      setStatus(`Loaded ${data.length} ${word} from the server.`, "success");
    }
  } catch (error) {
    console.error("Could not load notes:", error);
    setStatus("Sorry, we could not load your notes. Please check your connection and try again.", "error");
  } finally {
    setBusy(false);
  }
}

// ----- Validation -----
// Returns an error message, or "" if the title is fine
function validateTitle(title) {
  if (title === "") {
    return "Please enter a title for your note.";
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return `The title must be ${MAX_TITLE_LENGTH} characters or fewer (it is ${title.length}).`;
  }
  return "";
}

// ----- POST: create a note -----
async function createNote(title, body) {
  setBusy(true);
  setStatus("Creating note...", "loading");

  try {
    const { status, data } = await request(API_URL, {
      method: "POST",
      body: JSON.stringify({ title, body, userId: 1 }),
    });

    removeEmptyMessage();
    notesList.prepend(createNoteCard(data));
    noteForm.reset();
    titleInput.removeAttribute("aria-invalid");
    setStatus(`Note created (status ${status}, id ${data.id}).`, "success");
  } catch (error) {
    console.error("Could not create the note:", error);
    setStatus("Sorry, we could not create your note. Please try again.", "error");
  } finally {
    setBusy(false);
  }
}

// ----- Events -----
loadBtn.addEventListener("click", loadNotes);

noteForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (busy) {
    return;
  }

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  const problem = validateTitle(title);
  if (problem) {
    setStatus(problem, "error");
    titleInput.setAttribute("aria-invalid", "true");
    titleInput.focus();
    return;
  }

  createNote(title, body);
});
