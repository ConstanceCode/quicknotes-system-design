# QuickNotes API Design

This document describes the real QuickNotes API that the backend team should build. It is **not** the JSONPlaceholder practice API used by the client in this project. The API lets signed-in users create, read, update and delete their own notes and organise them with tags.

## Design rules

- **Base URL:** `https://api.quicknotes.example/v1` (the `v1` lets us change the API later without breaking old clients)
- **Resources are nouns in the plural:** `/notes`, `/tags`, `/users`. The HTTP method says what to do.
- **Format:** requests and responses are JSON. Dates use ISO 8601 in UTC (for example `2026-11-07T09:30:00Z`).
- **Authentication:** after logging in, the client sends `Authorization: Bearer <token>` with every request except register and login.
- **Ownership:** a user can only see and change their own notes and tags.
- **Pagination:** list endpoints accept `?page=1&limit=10` (default limit 10, maximum 50).

## Endpoints

| # | Method | Path | Description | Success status |
|---|--------|------|-------------|----------------|
| 1 | `POST` | `/users` | Register a new account | `201 Created` |
| 2 | `POST` | `/auth/login` | Log in and receive an access token | `200 OK` |
| 3 | `GET` | `/notes` | List my notes, newest first (optional `?tag=work`, `?page`, `?limit`) | `200 OK` |
| 4 | `GET` | `/notes/{id}` | Get one of my notes | `200 OK` |
| 5 | `POST` | `/notes` | Create a note | `201 Created` |
| 6 | `PUT` | `/notes/{id}` | Replace a note's title, body and tags | `200 OK` |
| 7 | `DELETE` | `/notes/{id}` | Delete a note | `204 No Content` |
| 8 | `GET` | `/tags` | List my tags | `200 OK` |
| 9 | `POST` | `/tags` | Create a tag | `201 Created` |
| 10 | `PUT` | `/notes/{id}/tags/{tagId}` | Attach a tag to a note | `204 No Content` |
| 11 | `DELETE` | `/notes/{id}/tags/{tagId}` | Remove a tag from a note | `204 No Content` |

Notes on the table:

- `POST /notes` also returns a `Location: /v1/notes/{id}` header pointing to the new note.
- `PUT` and `DELETE` can be repeated safely: sending the same request twice leaves the data in the same state (they are *idempotent*).
- `POST /notes` is not idempotent: sending it twice creates two notes.

## The note object

- `id` (number): set by the server
- `title` (string): required, 1 to 100 characters
- `body` (string): optional, can be empty
- `tags` (array): the tags attached to the note, each with an `id` and a `name`
- `created_at` and `updated_at` (string): set by the server

## Example: create a note

**Request**

```http
POST /v1/notes
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json
```

```json
{
  "title": "Buy milk",
  "body": "2 litres, and bread",
  "tag_ids": [3]
}
```

**Response: `201 Created`**

```http
Location: /v1/notes/481
```

```json
{
  "id": 481,
  "title": "Buy milk",
  "body": "2 litres, and bread",
  "tags": [{ "id": 3, "name": "personal" }],
  "created_at": "2026-11-07T09:30:00Z",
  "updated_at": "2026-11-07T09:30:00Z"
}
```

## Example: list notes

**Request**

```http
GET /v1/notes?page=1&limit=2
Authorization: Bearer eyJhbGciOi...
```

**Response: `200 OK`**

```json
{
  "data": [
    {
      "id": 481,
      "title": "Buy milk",
      "body": "2 litres, and bread",
      "tags": [{ "id": 3, "name": "personal" }],
      "created_at": "2026-11-07T09:30:00Z",
      "updated_at": "2026-11-07T09:30:00Z"
    },
    {
      "id": 475,
      "title": "Revise SQL joins",
      "body": "",
      "tags": [{ "id": 5, "name": "study" }],
      "created_at": "2026-11-06T18:05:00Z",
      "updated_at": "2026-11-06T18:05:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 2, "total": 37 }
}
```

An empty list is not an error. It returns `200 OK` with `"data": []` and `"total": 0`.

## Error responses

Every error uses the same JSON shape, so the client can handle them in one place:

```json
{
  "error": {
    "code": "SHORT_MACHINE_READABLE_CODE",
    "message": "A human-friendly explanation.",
    "details": []
  }
}
```

| Status | Name | When it happens |
|--------|------|-----------------|
| `400` | Bad Request | The request is invalid, for example `POST /notes` with no title or a title over 100 characters |
| `401` | Unauthorized | The token is missing, invalid or expired, or the login password is wrong |
| `403` | Forbidden | The user is logged in but not allowed to do this, for example deleting another user's note |
| `404` | Not Found | The note, tag or URL does not exist, for example `GET /notes/99999` |
| `409` | Conflict | The request clashes with existing data, for example registering with an email that is already used |
| `429` | Too Many Requests | The client sent too many requests in a short time (rate limiting) |
| `500` | Internal Server Error | Something unexpected broke on the server, such as the database being unreachable |

### Example error bodies

**400 Bad Request** (`POST /notes` with an empty title)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The note could not be created.",
    "details": [{ "field": "title", "issue": "Title is required and must be 100 characters or fewer." }]
  }
}
```

**401 Unauthorized** (expired token)

```json
{
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "Your session has expired. Please log in again.",
    "details": []
  }
}
```

**403 Forbidden** (`DELETE /notes/12` where note 12 belongs to someone else)

```json
{
  "error": {
    "code": "NOT_ALLOWED",
    "message": "You do not have permission to delete this note.",
    "details": []
  }
}
```

**404 Not Found** (`GET /notes/99999`)

```json
{
  "error": {
    "code": "NOTE_NOT_FOUND",
    "message": "No note exists with id 99999.",
    "details": []
  }
}
```

**500 Internal Server Error**

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Something went wrong on our side. Please try again later.",
    "details": []
  }
}
```

Server errors never reveal internal details such as stack traces or SQL. Those go to the server logs only.
