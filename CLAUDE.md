# CLAUDE.md

Context for working in this repo. Single-user, offline-first Python practice
site — a tiny "LeetCode for one learner." No framework, no database, no build
toolchain beyond one Python script.

## What this is

A static site that shows Python practice problems. Each problem has a
**description**, a **difficulty** badge (`easy`/`medium`/`hard`, rendered in
`app.js` from the `difficulty` field), up to **3 progressive hints**, and one or
more **revealable solutions**. There is intentionally **no in-page code editor** —
the learner codes in their own editor/REPL and uses this to read the prompt, take
hints, and check answers. Progress (solved marks, revealed hint counts, notes) is
stored in `localStorage` under key `py-practice-v1`, and can be moved between
browsers via the sidebar's **export / import** buttons (`exportProgress` /
`importProgressFromText` in `app.js`; import **overwrites** current progress).

## How to run

Two equivalent ways — no server is required:

- **Double-click `index.html`** — works from `file://` because problems load via
  a `<script src="data.js">` tag, never `fetch()`.
- **`python manage.py serve`** — serves on `127.0.0.1:8000` (auto-increments if
  busy) and opens the browser.

There is no install step and no dependencies — standard library Python 3 only.

## Commands (`manage.py`)

```
python manage.py seed       # write starter problems — only acts if problems.json is empty
python manage.py add        # interactively add a problem (prompts for all fields)
python manage.py edit ID    # interactively edit a problem; id stays fixed so progress isn't lost
python manage.py list       # print sections + problems
python manage.py remove ID  # delete a problem by id; prunes now-empty sections
python manage.py build      # regenerate data.js + index_standalone.html from problems.json
python manage.py serve      # serve locally; watches sources and rebuilds on save
```

`add`, `edit`, `remove`, and `seed` all call `build()` automatically via `save()`.
`serve` runs a daemon watcher (`_watch_sources`) that rebuilds whenever
`problems.json`, `index.html`, `style.css`, or `app.js` changes on disk — so the
normal loop is "edit a source, save, refresh the browser"; you rarely run `build`
by hand. `edit` deliberately keeps a problem's `id` so its `localStorage` progress
key stays valid.

## Architecture / data flow

```
problems.json   (source of truth, hand-editable)
      │  manage.py build  (called automatically after any edit)
      ▼
   data.js      ──►  window.PROBLEMS = {...}   (loaded by index.html)
      │
      └──►  index_standalone.html  (index.html + style.css + app.js + data.js inlined)
```

- `problems.json` is the **only** source of truth for content. Edit it directly
  or via `manage.py`, then `build`.
- `data.js` and `index_standalone.html` are **generated** — never hand-edit them;
  they're overwritten on every build.
- `build()` makes the standalone by string-replacing three exact tags in
  `index.html`:
  - `<link rel="stylesheet" href="style.css">`
  - `<script src="data.js"></script>`
  - `<script src="app.js"></script>`
  If you rename these files or change those tags in `index.html`, update the
  replacements in `manage.py:build()` to match, or the standalone won't inline.

## File map

| File | Role | Edit by hand? |
|------|------|---------------|
| `problems.json` | Content, source of truth | Yes |
| `manage.py` | CLI: seed/add/edit/list/remove/build/serve (serve auto-rebuilds); holds the `SAMPLE` seed data | Yes |
| `index.html` | App shell (sidebar + main mount points) | Yes (rarely) |
| `style.css` | All styling and design tokens | Yes |
| `app.js` | All runtime logic (render, hints, solutions, progress, export/import, markdown, highlighter) | Yes |
| `data.js` | Generated `window.PROBLEMS` | **No — generated** |
| `index_standalone.html` | Generated single-file build | **No — generated** |
| `README.md` | End-user instructions | Yes |

## Data schema (`problems.json`)

```json
{
  "sections": [
    {
      "id": "getting-started",        // slug, unique across file
      "title": "Getting Started",
      "problems": [
        {
          "id": "greet-by-name",      // slug, unique across ALL sections
          "title": "Greet by Name",
          "difficulty": "easy",       // "easy" | "medium" | "hard"
          "description": "markdown string",
          "hints": ["...", "...", "..."],   // app shows at most the first 3
          "solutions": [
            {
              "label": "f-string",    // shown as a tab when >1 solution
              "code": "name = \"Ada\"\nprint(f\"Hello, {name}!\")",
              "explanation": "optional one-liner shown under the code"
            }
          ]
        }
      ]
    }
  ]
}
```

Invariants the code assumes:
- Problem `id`s are unique across the whole file (used as the localStorage key
  and for nav lookup). `manage.py` enforces this via `unique_id()`.
- `difficulty` is one of `easy`/`medium`/`hard` (maps to CSS `.diff-*`); unknown
  values fall back to `easy` styling.
- `hints` may be empty or absent; only the first 3 are ever shown.
- `solutions` may be empty; each needs `code`, with optional `label` and
  `explanation`.

## Description markdown (subset, rendered in `app.js`)

Supported: blank-line paragraphs, `### headings`, `- ` bullet lists, ` ``` `
fenced code blocks (use ` ```python ` for syntax highlighting), `` `inline code` ``,
and `**bold**`. Everything is HTML-escaped first. Hints and solution
explanations support only the inline subset (`` `code` ``, `**bold**`).

## Frontend conventions / gotchas

- **No external resources.** No CDNs, no web fonts, no libraries — must run
  offline. Fonts are system stacks (`--mono`, `--sans`); Python highlighting and
  the markdown renderer are hand-rolled in `app.js`. Keep it that way.
- **Never use `fetch()` or ES modules for local data** — both break under
  `file://`. Content must arrive via the classic `data.js` script tag.
- **`localStorage` is wrapped in try/catch** (`loadState`/`saveState`) so the app
  still runs in sandboxes/private mode (in-memory only). Don't remove the guards.
- **Export/import progress** lives entirely in `app.js` (Blob download +
  `FileReader`, both `file://`-safe — no `fetch`). The full `state` object is the
  export payload; `defaultState()` is the canonical shape. Import replaces `state`
  wholesale then re-renders. The hidden file `<input>` is created once in JS and
  appended to `body`, so `index.html`'s three inlined-build tags stay untouched.
- **No `localStorage` in any preview-rendered context** assumptions — it degrades
  silently rather than throwing.
- **Solutions intentionally re-hide on reload** (`solutionShown` is in-memory, not
  persisted) to nudge re-attempting. Revealed *hint counts* and notes *do*
  persist. If asked to keep solutions open, persist `solutionShown` in `state`.
- Design identity is an "editor/terminal notebook": light page, monospace
  structural labels, dark terminal-style solution panels, indigo accent
  (`--accent`), green for solved (`--success`). Tokens live at the top of
  `style.css`.
- Accessibility floor to preserve: visible `:focus-visible` outlines, mobile
  slide-over sidebar, and `prefers-reduced-motion` handling.

## Adding content (typical task)

Prefer `python manage.py add` (new) or `python manage.py edit ID` (change an
existing one) for one-offs. For bulk edits, edit `problems.json` directly — if
`serve` is running it rebuilds on save, otherwise run `python manage.py build`.
To change the starter set, edit the `SAMPLE` dict in `manage.py` (only used by
`seed` when `problems.json` is empty); note `SAMPLE` is the original 9-problem
starter and is **not** kept in sync with the full 50-problem `problems.json`.
After any content change, confirm with `python manage.py list`.

The five sections each hold 10 problems. The loop sections (`loops-and-logic`,
`loops-over-data`, `while-loops-and-limits`) are intentionally pattern-driven —
each problem teaches a named loop shape (running total, conditional counter,
filter, transform, find-the-extreme, tally/group, drain-to-zero, repeat-until,
search-with-break) via a logistics / data-analysis example, with a 3-hint ladder
(name the pattern → mechanics → the one tricky line). Match that style when
adding loop content, and **run every new solution** to confirm its output matches
the description's stated example before committing.
