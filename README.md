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
- Compose from the floating **Post** button (bottom-right) or the sidebar's Post button — the
  feed itself stays clean with no inline "what's happening" box
- Opening a post lays it out the way X does: text and media, then the date and view count in
  small dim text on the same left edge as the icons, the action bar (which already carries the
  reply / repost / like counts), and a small **Relevant ▾ / View quotes ›** row underneath
- The **reply box sits right there** under the post with "Post your reply" and a Reply button —
  the reply icon in the action bar just drops your cursor into it
- Replies can be ordered **Relevant / Latest / Liked**, and **View quotes** lists every post that
  quotes this one
- Text, up to 4 images, replies, threads, quotes, reposts
- **Any timestamp you want** — post as "now", or backdate it to 3 April 2019 at 4:12 PM
- Edit the text, the time, and even the engagement numbers of a post after the fact
- Pin a post to a profile
- Draft-proof composer with a live character ring (it warns past 280 but lets you write long
  posts, because fic)
- The clock button next to the composer only appears while you're actually writing, so an
  idle page stays clean

**Images**
- Upload from your device anywhere: posts, chat messages, avatars and banners
- Every upload goes through a **cropper** first — drag to reposition, slide to zoom, and pick a
  preset shape: **Post** (16:9, 1280×720), **Square** (512×512, used for avatars) or
  **Header** (3:1, 1500×500, used for banners). "Use original" skips the crop
- Tap "Upload avatar" / "Upload banner" in the profile editor, or paste a URL instead
- Photos in chats tap open full-screen
- Uploaded files live in `data/uploads` and are only served to signed-in visitors
- If a file ever goes missing, the post quietly drops the image instead of leaving an empty
  frame, and `/uploads/...` answers a real 404 rather than handing back the app shell

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
- Replies and comments never appear in a feed or on a profile's Posts tab — they live on the
  post itself and under that profile's **Replies** tab. Search still finds them, and your Likes
  and Bookmarks still show whatever you saved
- Infinite scroll with a "show N new posts" pill when the other writer posts while you're
  scrolled down

**The status bar**
- One slim, phone-shaped strip across the very top of the app, in place of a chunky header
- **Tap it** to choose what it carries. Options: the acting character (tap to swap who you are
  posting as), the shared clock (tap for the time machine), the section name, a Following /
  Everything switcher, search, notifications and messages with their unread counts, a screenshot
  mode toggle, and decorative signal / Wi-Fi / battery icons
- Also toggles 24-hour time, and the arrangement is remembered per browser — you and your co-writer
  can each set your own
- A small dot next to the clock tells you at a glance whether the timeline is live (green),
  shifted (amber) or frozen (blue)

**Notifications**
- Generated automatically for likes, reposts, follows, replies, quotes, mentions and DMs
- 100% editable: change who it's from, the type, the text, the timestamp, or invent brand-new
  ones from Admin → Notifications
- Tabs for All / Mentions / Verified, unread badges in the sidebar

**Direct messages**
- 1:1 chats and group chats, laid out like the real thing: a profile card at the top of the
  conversation, centred "Today 9:38 PM" date separators, plain text lines (no chat bubbles)
  with the sender's avatar once at the top of each run of messages, and "Sent" under your
  last one
- Send photos as well as text
- Set the send time of any message, edit text, edit its timestamp, delete it
- Live typing indicators ("Writer 2 is typing…")
- Live delivery — messages appear instantly for the other person
- Only the message list scrolls: the header and the message box are pinned, so the input can
  never drift off-screen — including on Android, where the URL bar sliding away used to push it
  below the fold

**Explore & search**
- Editable "Trending" list (Admin → Trends) shown in Explore and the sidebar
- Search across posts (SQLite full-text) and people
- Who to follow

**Screenshot mode**
- Press **S**, or use the mobile menu, Settings → Screenshots, or a post's ⋯ menu
- Hides only what isn't Twitter — the time machine (it closes itself and can't be reopened
  until you leave the mode), "who's here", the Admin link, the composer's clock button and the
  app-only badges — so what's left looks like a real page
- Three extra toggles: **Sidebar** (also hides the left nav, the right column and the status bar,
  leaving just the posts), **Header** (hides the column title and tabs), **Stats** (hides the
  reply/repost/like/bookmark row)
- The little control bar only appears when you move the mouse to the bottom of the window, and
  fades on its own, so it never lands in the shot

**Admin**
- Full account CRUD, act as anyone, delete anyone
- Manual notification factory. Its **Clear all** button wipes notifications for *every* account,
  not just the one selected in the dropdown
- Trends CRUD
- The time machine, plus resets: delete all messages / delete all posts / **wipe everything**
- **Wipe everything** leaves a genuinely empty world — zero accounts, posts, DMs, notifications
  and trends. Nothing is recreated afterwards, so the next visit asks you to make a new account.
  (A brand-new install still seeds two starter characters once.)
- Export the entire world to JSON, import it back

**On phones**
- The sidebar collapses into a slide-in drawer: tap the ☰ in the status bar for Bookmarks,
  Profile, Settings and Admin
- Bottom bar for Home / Explore / Notifications / Messages, and the character switcher lives in
  the status bar
- Everything else is the same — composer, time picker, DMs, notifications

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

### Updating without losing your media

Your whole world — `chirper.db` and every uploaded image in `uploads/` — lives in the single
host folder `./data`, which `docker-compose.yml` mounts into the container as `/data`. Rebuilding
the image replaces **code only**; that folder is never touched. Same for `git pull`: `data/` is
in `.gitignore`, so git cannot overwrite or delete it.

```bash
cd chirper
cp -r data data.bak          # cheap insurance, takes a second
git pull
docker compose up -d --build
docker compose logs --tail 20 chirper
```

That last line is the important one. The boot banner tells you where your data actually is:

```
   data dir    /data  (mounted - safe to rebuild)
   uploads     /data/uploads · 12 files · 34.2MB
```

If `data dir` says **(in the container!)** instead, or the log prints a `!! DANGER` block, stop —
the folder is not mounted and the next rebuild would take the database and all images with it.
Fix the `volumes:` line in `docker-compose.yml` (`- ./data:/data`) before going further. Watching
the `uploads` file count is a good habit: if it drops to 0 after an update, the mount moved.

Two ways people accidentally lose media, both avoidable:

- **`docker compose down -v`** — the `-v` deletes volumes. Harmless with the bind mount, fatal if
  you ever switch the volume to a named one.
- **Starting a container without the volume** (`docker run chirper:latest` with no `-v ./data:/data`)
  — it gets a brand-new empty `/data` and looks wiped. Always go through `docker compose`.

To check the result from anywhere: **Admin → Data → Stored images** reports how many files are in
`uploads/`, how much space they take, and — the part that matters — any image the database
references but that is not on disk, plus any file nothing uses any more. "Every referenced image
is present" after an update means your media came through untouched.

To move a world between machines, copy **both** the database and the uploads — one without the
other is exactly what makes every image on the site break:

```bash
tar czf chirper-world.tgz -C chirper data
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
