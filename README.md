# Python Practice

A personal, single-user Python practice site — like a tiny LeetCode for one
learner. Each problem shows a **description**, a **difficulty** label, up to
**3 progressive hints**, and one or more **revealable solutions**. Your solved
marks, revealed hints, and notes are saved in your browser. There's no in-page
code editor by design — you practice in your own editor or the Python shell,
then reveal hints/answers here.

There are **50 problems** across five sections (Getting Started, Loops & Logic,
Loops Over Data, While Loops & Limits, Lists & Strings). The loop sections are
built around *recognizing which loop pattern a task needs* — running totals,
counters, filters, transforms, tallies, find-the-extreme, drain-to-zero — framed
with small logistics / data-analysis examples.

## Running it

You have two ways to open the site — pick whichever you like:

**A. Just double-click** `index.html`
It works straight from disk because the problems are loaded via `data.js`
(a plain script, not a network request). No server needed.

**B. Run the local server** (opens your browser automatically):
```
python manage.py serve
```
While `serve` is running it **watches your source files and rebuilds
automatically** — edit `problems.json` (or `app.js`/`style.css`/`index.html`),
save, and just refresh the browser. No manual `build` step needed.

## Saving & moving your progress

Your progress lives in the browser (`localStorage`), so it's tied to that one
browser on that one machine. To back it up or move it elsewhere, use the buttons
at the bottom of the sidebar:

- **⇪ export** — downloads a `python-practice-progress.json` file with your
  solved marks, revealed hints, and notes.
- **⇩ import** — load that file back (on another browser/machine, or after a
  reset). **Importing replaces your current progress** with the file's contents.

## Adding & editing problems over time

Everything lives in `problems.json`. The manager keeps it in sync with the site.

```
python manage.py add        # add a problem, answering prompts
python manage.py edit ID    # edit an existing problem (keeps its id)
python manage.py list       # see everything you have
python manage.py remove ID  # delete a problem by its id
python manage.py build      # rebuild data.js after hand-editing problems.json
python manage.py seed       # write the starter problems (only if empty)
```

When adding or editing a problem you'll be asked for a title, difficulty
(`easy`/`medium`/`hard`), a description, up to 3 hints, and one or more
solutions. For multi-line text (description and code) just type your lines and
end with a single `.` on its own line. `edit` keeps the problem's `id` unchanged
so your saved progress for it isn't lost.

### Description formatting

Descriptions accept light markdown:

- `**bold**`
- `` `inline code` ``
- `- ` bullet lists
- fenced code blocks with triple backticks (use ` ```python ` for highlighting)
- `### Heading` for small section headers

## Files

| File | What it is |
|------|------------|
| `problems.json` | Your content — the single source of truth |
| `manage.py` | Add / edit / list / remove / build / serve (serve auto-rebuilds) |
| `index.html`, `style.css`, `app.js` | The site itself |
| `data.js` | Generated from `problems.json` — don't edit by hand |
| `index_standalone.html` | A single-file copy of the whole site, handy for sharing |

Edit `problems.json` directly if you prefer, then run `python manage.py build`.
