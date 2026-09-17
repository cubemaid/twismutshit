# Chirper

A self-hosted, fully editable Twitter clone for two people writing fanfiction together.

You make as many accounts as you want, post as any of them, put any timestamp on a post
(including years in the past), and drag a shared "current moment" around so old posts read
as *just now*. Everything updates live for both of you at the same time.

---

## What's in it

**Accounts**
- Unlimited characters: display name, handle, bio, avatar, banner, location, website, join date
- Verified badges (blue / gold / grey)
- Optional "extra followers" number so a character can be famous on day one
- Switch who you're posting as at any time from the bottom-left account button
- The right column shows who else is connected and which character they're using

**Posts**
- Text, up to 4 images, replies, threads, quotes, reposts
- **Any timestamp you want** — post as "now", or backdate it to 3 April 2019 at 4:12 PM
- Edit the text, the time, and even the engagement numbers of a post after the fact
- Pin a post to a profile
- Draft-proof composer with a live character ring (it warns past 280 but lets you write long
  posts, because fic)

**The time machine**
- One clock shared by both of you — it lives in the right column (and in the ☁/clock modal)
- Jump −1y / −1mo / −1w / −1d / −1h / −10m, or type an exact date and time
- Freeze time so the world stands still while you write
- Every relative timestamp ("now", "3m", "2h", "Apr 3, 2019") is computed from that clock,
  so dragging the clock back makes April feel like seconds ago
- Posts dated *after* the current moment show a small "⏱ future" badge, or can be hidden
  entirely in Settings

**Feeds**
- **Following** — only who you follow (plus you)
- **Everything** — every account on the server
- Filters: all / no replies / with media / verified
- Infinite scroll with a "show N new posts" pill when the other writer posts while you're
  scrolled down

**Notifications**
- Generated automatically for likes, reposts, follows, replies, quotes, mentions and DMs
- 100% editable: change who it's from, the type, the text, the timestamp, or invent brand-new
  ones from Admin → Notifications
- Tabs for All / Mentions / Verified, unread badges in the sidebar

**Direct messages**
- 1:1 chats and group chats
- Set the send time of any message, edit text, edit its timestamp, delete it
- Live typing indicators ("Writer 2 is typing…")
- Live delivery — messages appear instantly for the other person

**Explore & search**
- Editable "Trending" list (Admin → Trends) shown in Explore and the sidebar
- Search across posts (SQLite full-text) and people
- Who to follow

**Screenshot mode**
- Press **S** (or the camera button in the bottom-right, or Settings → Screenshots)
- Hides the sidebar, right column, tabs, composer and every app-only badge so a post looks
  like a genuine screenshot
- Extra toggles: hide the column header, hide the like/repost/bookmark row
- The little control bar fades out on its own so it never lands in the shot

**Admin**
- Full account CRUD, act as anyone, delete anyone
- Manual notification factory
- Trends CRUD
- The time machine, plus resets (wipe posts / DMs / everything)
- Export the entire world to JSON, import it back

---

## Running it

### On your VPS with Docker (recommended)

```bash
git clone <your repo> chirper   # or just copy this folder up to the server
cd chirper
cp .env.example .env
nano .env                       # set SITE_PASSWORD and SESSION_SECRET
docker compose up -d --build
```

It listens on port 3000. Everything persistent (the SQLite database and uploaded images)
lives in `./data`, so back that folder up and you have the whole world.

To put it behind a domain with HTTPS, point nginx/Caddy at `127.0.0.1:3000`:

```nginx
server {
  server_name your-domain.tld;
  client_max_body_size 20M;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

The `Upgrade`/`Connection` headers matter — they're what makes the live sync work.

Updating:

```bash
git pull && docker compose up -d --build
```

### Without Docker

Needs Node.js 20 or newer.

```bash
npm install
cp .env.example .env      # edit it
npm start                 # or: npm run dev   (auto-restarts on changes)
```

Then open http://localhost:3000 and type the password from `.env`.

---

## Settings you'll care about

`.env`:

| Variable | What it does |
| --- | --- |
| `SITE_PASSWORD` | The single shared password. Change it. |
| `SESSION_SECRET` | Random string that signs login cookies. Change it. |
| `PORT` | Port to listen on (default 3000). |
| `DATA_DIR` | Where the database + uploads live (default `./data`). |

In the app:

- **Settings** — show/hide future-dated posts, site name, accent colour, welcome message
- **Admin → World** — the time machine and the resets
- **Admin → Data** — export/import the entire world as one JSON file

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `n` | New post |
| `s` | Toggle screenshot mode |
| `/` | Focus search |
| `t` | Open the time machine |
| `Esc` | Close menus / modals, leave screenshot mode |

Right-click a composer's clock chip to snap it back to "now".
Shift-click the repost button to repost without opening the menu.

---

## How it's built

```
server/
  index.js      express app, static hosting, socket.io wiring
  db.js         sqlite schema, settings, first-run seed
  model.js      queries + the API shapes the client sees
  routes.js     the whole REST API
  realtime.js   socket.io rooms, presence, live events
  clock.js      the shared, movable "now"
  auth.js       the single shared password + signed cookie
public/
  index.html
  css/style.css
  js/
    app.js         router + boot
    shell.js       sidebar, right rail, time machine widget
    composer.js    composer + the time picker
    post-card.js   post rendering, actions, drama tools
    screenshot.js  clean view
    socket.js      live sync
    views/*.js     one file per screen
data/
  chirper.db    sqlite database
  uploads/      uploaded images
```

Stack: Node + Express + better-sqlite3 + Socket.IO on the server, and plain ES modules with
no build step on the client. That means you can edit `public/css/style.css` or any view file
and just refresh the page — no bundler, no compilation.

---

## Notes

- Two people editing at once is fine: posts, likes, DMs, notifications, accounts, trends and
  the clock all broadcast over websockets and patch into the page you already have open.
- The password is shared, so treat the URL like a diary. Anyone with the password can edit
  anything — that's the point.
- SQLite in WAL mode handles two writers comfortably. If you ever invite a third, it'll still
  be fine.
