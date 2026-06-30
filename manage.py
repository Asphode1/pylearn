#!/usr/bin/env python3
"""
Python Practice — content manager.

A tiny, single-user authoring tool for your personal Python practice site.
No web framework, no database: problems live in problems.json, and the site
reads them through a generated data.js so it works by double-clicking
index.html (no server required).

Usage:
    python manage.py seed       Create starter problems (only if none exist).
    python manage.py add        Add a new problem, interactively.
    python manage.py edit ID    Edit an existing problem, interactively.
    python manage.py list       List sections and problems.
    python manage.py remove ID  Remove a problem by its id.
    python manage.py build      Regenerate data.js + index_standalone.html.
    python manage.py serve      Serve locally (auto-rebuilds on edits) and open the browser.
"""

import json
import os
import re
import sys
import threading
import http.server
import socketserver
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROBLEMS = ROOT / "problems.json"
DATA_JS = ROOT / "data.js"
INDEX = ROOT / "index.html"
CSS = ROOT / "style.css"
APP = ROOT / "app.js"
STANDALONE = ROOT / "index_standalone.html"


# --------------------------------------------------------------------------- #
#  data helpers
# --------------------------------------------------------------------------- #
def slugify(text):
    s = re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")
    return s or "item"


def load():
    if PROBLEMS.exists():
        with open(PROBLEMS, encoding="utf-8") as f:
            return json.load(f)
    return {"sections": []}


def save(data):
    with open(PROBLEMS, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    build()


def all_problem_ids(data):
    return {p["id"] for sec in data["sections"] for p in sec["problems"]}


def unique_id(base, taken):
    pid, n = base, 2
    while pid in taken:
        pid, n = f"{base}-{n}", n + 1
    return pid


# --------------------------------------------------------------------------- #
#  build:  problems.json  ->  data.js  (+ standalone single file)
# --------------------------------------------------------------------------- #
def build():
    data = load()
    payload = json.dumps(data, ensure_ascii=False)
    DATA_JS.write_text("window.PROBLEMS = " + payload + ";\n", encoding="utf-8")

    # Build a single-file version for easy sharing / previewing.
    if INDEX.exists() and CSS.exists() and APP.exists():
        html = INDEX.read_text(encoding="utf-8")
        html = html.replace(
            '<link rel="stylesheet" href="style.css">',
            "<style>\n" + CSS.read_text(encoding="utf-8") + "\n</style>",
        )
        html = html.replace(
            '<script src="data.js"></script>',
            "<script>\n" + DATA_JS.read_text(encoding="utf-8") + "\n</script>",
        )
        html = html.replace(
            '<script src="app.js"></script>',
            "<script>\n" + APP.read_text(encoding="utf-8") + "\n</script>",
        )
        STANDALONE.write_text(html, encoding="utf-8")

    n = sum(len(s["problems"]) for s in data["sections"])
    print(f"Built data.js — {len(data['sections'])} section(s), {n} problem(s).")


# --------------------------------------------------------------------------- #
#  interactive input helpers
# --------------------------------------------------------------------------- #
def ask(prompt, default=None):
    suffix = f" [{default}]" if default else ""
    val = input(f"{prompt}{suffix}: ").strip()
    return val or (default or "")


def ask_block(prompt):
    print(f"{prompt}")
    print("  (type your text across as many lines as you like; end with a single '.')")
    lines = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if line.strip() == ".":
            break
        lines.append(line)
    return "\n".join(lines).strip()


def choose_section(data):
    sections = data["sections"]
    if sections:
        print("\nPick a section:")
        for i, s in enumerate(sections, 1):
            print(f"  {i}. {s['title']}  ({len(s['problems'])} problems)")
        print(f"  {len(sections) + 1}. + new section")
        raw = ask("Choice", "1")
        try:
            idx = int(raw)
        except ValueError:
            idx = 1
        if 1 <= idx <= len(sections):
            return sections[idx - 1]
    title = ask("New section title", "Python Basics")
    sec = {"id": unique_id(slugify(title), {s["id"] for s in sections}), "title": title, "problems": []}
    data["sections"].append(sec)
    return sec


# --------------------------------------------------------------------------- #
#  commands
# --------------------------------------------------------------------------- #
def cmd_add():
    data = load()
    sec = choose_section(data)

    print(f"\nAdding to section: {sec['title']}\n" + "-" * 40)
    title = ask("Problem title")
    if not title:
        print("Cancelled — a title is required.")
        return
    difficulty = ask("Difficulty (easy/medium/hard)", "easy").lower()
    if difficulty not in ("easy", "medium", "hard"):
        difficulty = "easy"

    print("\nDescription (markdown ok: **bold**, `code`, - lists, ``` fenced code ```):")
    description = ask_block("")

    hints = []
    print("\nHints (up to 3). Leave blank to stop.")
    for i in range(3):
        h = ask(f"  Hint {i + 1}")
        if not h:
            break
        hints.append(h)

    solutions = []
    print("\nSolutions (at least 1). After each, you can add another.")
    while True:
        label = ask(f"  Solution {len(solutions) + 1} label", "Solution" if not solutions else f"Approach {len(solutions) + 1}")
        print("  Code:")
        code = ask_block("")
        explanation = ask("  One-line explanation (optional)")
        sol = {"label": label, "code": code}
        if explanation:
            sol["explanation"] = explanation
        solutions.append(sol)
        if ask("  Add another solution? (y/N)", "n").lower() != "y":
            break

    pid = unique_id(slugify(title), all_problem_ids(data))
    sec["problems"].append({
        "id": pid,
        "title": title,
        "difficulty": difficulty,
        "description": description,
        "hints": hints,
        "solutions": solutions,
    })
    save(data)
    print(f"\nAdded '{title}' (id: {pid}) to '{sec['title']}'.")


def cmd_edit(args):
    if not args:
        print("Usage: python manage.py edit <problem-id>   (run 'list' to see ids)")
        return
    pid = args[0]
    data = load()
    target = None
    for sec in data["sections"]:
        for p in sec["problems"]:
            if p["id"] == pid:
                target = p
                break
        if target:
            break
    if target is None:
        print(f"No problem with id '{pid}'. Run 'list' to see ids.")
        return

    print(f"Editing '{target['title']}'  (id: {pid} — stays the same so progress isn't lost)")
    print("Press Enter to keep the current value.\n" + "-" * 40)

    target["title"] = ask("Title", target.get("title", "")) or target.get("title", "")
    diff = ask("Difficulty (easy/medium/hard)", target.get("difficulty", "easy")).lower()
    target["difficulty"] = diff if diff in ("easy", "medium", "hard") else target.get("difficulty", "easy")

    print("\nCurrent description:\n" + (target.get("description", "") or "(none)") + "\n")
    if ask("Replace description? (y/N)", "n").lower() == "y":
        target["description"] = ask_block("New description (markdown ok):")

    if ask("\nReplace all hints? (y/N)", "n").lower() == "y":
        hints = []
        print("Hints (up to 3). Leave blank to stop.")
        for i in range(3):
            h = ask(f"  Hint {i + 1}")
            if not h:
                break
            hints.append(h)
        target["hints"] = hints

    if ask("\nReplace all solutions? (y/N)", "n").lower() == "y":
        solutions = []
        print("Solutions (at least 1). After each, you can add another.")
        while True:
            label = ask(f"  Solution {len(solutions) + 1} label", "Solution" if not solutions else f"Approach {len(solutions) + 1}")
            print("  Code:")
            code = ask_block("")
            explanation = ask("  One-line explanation (optional)")
            sol = {"label": label, "code": code}
            if explanation:
                sol["explanation"] = explanation
            solutions.append(sol)
            if ask("  Add another solution? (y/N)", "n").lower() != "y":
                break
        target["solutions"] = solutions

    save(data)
    print(f"\nUpdated '{pid}'.")


def cmd_list():
    data = load()
    if not data["sections"]:
        print("No problems yet. Run:  python manage.py seed")
        return
    for sec in data["sections"]:
        print(f"\n{sec['title']}  ({sec['id']})")
        for p in sec["problems"]:
            print(f"   - [{p.get('difficulty', 'easy'):6}] {p['title']}   ({p['id']})")
    total = sum(len(s["problems"]) for s in data["sections"])
    print(f"\n{total} problem(s) total.")


def cmd_remove(args):
    if not args:
        print("Usage: python manage.py remove <problem-id>")
        return
    pid = args[0]
    data = load()
    found = False
    for sec in data["sections"]:
        before = len(sec["problems"])
        sec["problems"] = [p for p in sec["problems"] if p["id"] != pid]
        if len(sec["problems"]) != before:
            found = True
    data["sections"] = [s for s in data["sections"] if s["problems"]]
    if found:
        save(data)
        print(f"Removed '{pid}'.")
    else:
        print(f"No problem with id '{pid}'.")


def _watch_sources(stop):
    """Rebuild data.js + standalone whenever a source file changes on disk.

    Watches the hand-edited sources (not the generated outputs), so editing
    problems.json/app.js/style.css/index.html and saving is enough — no manual
    `build` needed; just refresh the browser.
    """
    watched = [PROBLEMS, INDEX, CSS, APP]

    def snapshot():
        return {f: (f.stat().st_mtime if f.exists() else 0) for f in watched}

    last = snapshot()
    while not stop.wait(1.0):
        current = snapshot()
        if current != last:
            last = current
            try:
                build()
                print("↻ rebuilt data.js + standalone — refresh your browser.")
            except Exception as e:
                print(f"⚠ rebuild failed ({e}); fix the source and save again.")


def cmd_serve():
    if not DATA_JS.exists():
        build()
    os.chdir(ROOT)
    port = 8000
    handler = http.server.SimpleHTTPRequestHandler
    while True:
        try:
            httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
            break
        except OSError:
            port += 1
            if port > 8010:
                raise
    url = f"http://127.0.0.1:{port}/index.html"

    stop = threading.Event()
    watcher = threading.Thread(target=_watch_sources, args=(stop,), daemon=True)
    watcher.start()

    print(f"Serving at {url}  (Ctrl+C to stop)")
    print("Watching problems.json, index.html, style.css, app.js — edits rebuild automatically.")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        stop.set()


def cmd_seed():
    data = load()
    if data["sections"]:
        print("problems.json already has content — leaving it untouched.")
        print("(Delete problems.json first if you want to reseed from scratch.)")
        return
    save(SAMPLE)
    print("Seeded starter problems. Open index.html or run:  python manage.py serve")


# --------------------------------------------------------------------------- #
#  starter content
# --------------------------------------------------------------------------- #
SAMPLE = {
  "sections": [
    {
      "id": "getting-started",
      "title": "Getting Started",
      "problems": [
        {
          "id": "greet-by-name",
          "title": "Greet by Name",
          "difficulty": "easy",
          "description": "Print a friendly greeting for a given name.\n\nGiven a name stored in the variable `name`, print `Hello, <name>!` on its own line.\n\n### Example\n```python\nname = \"Ada\"\n# expected output:\nHello, Ada!\n```",
          "hints": [
            "An f-string lets you drop a variable straight into text: `f\"...\"`.",
            "Inside an f-string, wrap the variable in curly braces: `f\"Hello, {name}\"`.",
            "The exclamation mark goes *inside* the quotes, right after the closing brace."
          ],
          "solutions": [
            {
              "label": "f-string",
              "code": "name = \"Ada\"\nprint(f\"Hello, {name}!\")",
              "explanation": "An f-string (the `f` before the quotes) substitutes anything inside `{}` with its value."
            },
            {
              "label": "Joining with +",
              "code": "name = \"Ada\"\nprint(\"Hello, \" + name + \"!\")",
              "explanation": "You can also build the string by joining pieces with `+`. Every piece has to be a string."
            }
          ]
        },
        {
          "id": "add-two-numbers",
          "title": "Add Two Numbers",
          "difficulty": "easy",
          "description": "Given two numbers `a` and `b`, print their sum.\n\n### Example\n```python\na = 7\nb = 5\n# expected output:\n12\n```",
          "hints": [
            "The `+` operator adds two numbers together.",
            "Store the result in a variable, then `print` that variable.",
            "`print(a + b)` works directly too — no temporary variable needed."
          ],
          "solutions": [
            {
              "label": "Solution",
              "code": "a = 7\nb = 5\ntotal = a + b\nprint(total)",
              "explanation": "Add the two values, keep the result in `total`, then print it."
            }
          ]
        },
        {
          "id": "even-or-odd",
          "title": "Even or Odd",
          "difficulty": "easy",
          "description": "Given a whole number `n`, print `even` if it is even and `odd` if it is odd.\n\n### Example\n```python\nn = 10   ->  even\nn = 7    ->  odd\n```\n\n### Hint to think about\nA number is even when dividing it by 2 leaves **no remainder**.",
          "hints": [
            "The remainder operator `%` gives what's left after division: `10 % 2` is `0`.",
            "If `n % 2 == 0`, the number is even; otherwise it's odd.",
            "Use an `if` / `else` block to print the right word."
          ],
          "solutions": [
            {
              "label": "if / else",
              "code": "n = 10\nif n % 2 == 0:\n    print(\"even\")\nelse:\n    print(\"odd\")",
              "explanation": "`%` is the modulo operator. An even number divided by 2 has remainder 0."
            },
            {
              "label": "One-liner",
              "code": "n = 10\nprint(\"even\" if n % 2 == 0 else \"odd\")",
              "explanation": "A conditional expression (`A if condition else B`) chooses a value inline."
            }
          ]
        }
      ]
    },
    {
      "id": "loops-and-logic",
      "title": "Loops & Logic",
      "problems": [
        {
          "id": "fizzbuzz",
          "title": "FizzBuzz",
          "difficulty": "easy",
          "description": "Print the numbers from 1 to `n`, one per line, with two twists:\n\n- For multiples of **3**, print `Fizz` instead of the number.\n- For multiples of **5**, print `Buzz` instead of the number.\n- For multiples of **both 3 and 5**, print `FizzBuzz`.\n\n### Example (n = 5)\n```\n1\n2\nFizz\n4\nBuzz\n```",
          "hints": [
            "Loop over the numbers with `for i in range(1, n + 1):` — `range` stops *before* the second value.",
            "Check the both-case first: `if i % 3 == 0 and i % 5 == 0:` before checking 3 or 5 alone.",
            "Order matters — if you check `% 3` first, 15 would print `Fizz` and never reach the combined case."
          ],
          "solutions": [
            {
              "label": "Classic",
              "code": "n = 15\nfor i in range(1, n + 1):\n    if i % 3 == 0 and i % 5 == 0:\n        print(\"FizzBuzz\")\n    elif i % 3 == 0:\n        print(\"Fizz\")\n    elif i % 5 == 0:\n        print(\"Buzz\")\n    else:\n        print(i)",
              "explanation": "Check the combined 3-and-5 case first, then the single cases, then fall back to the number."
            },
            {
              "label": "Build a word",
              "code": "n = 15\nfor i in range(1, n + 1):\n    word = \"\"\n    if i % 3 == 0:\n        word += \"Fizz\"\n    if i % 5 == 0:\n        word += \"Buzz\"\n    print(word or i)",
              "explanation": "Build up the word in pieces; `word or i` prints the number when `word` is still empty."
            }
          ]
        },
        {
          "id": "sum-from-1-to-n",
          "title": "Sum from 1 to N",
          "difficulty": "easy",
          "description": "Given a number `n`, print the sum of every whole number from 1 up to and including `n`.\n\n### Example\n```python\nn = 5   ->  15      # because 1 + 2 + 3 + 4 + 5\n```",
          "hints": [
            "Keep a running `total` that starts at 0, and add each number to it in a loop.",
            "`for i in range(1, n + 1):` walks through 1, 2, ... up to n.",
            "Python's built-in `sum()` can add up a whole range at once."
          ],
          "solutions": [
            {
              "label": "Loop",
              "code": "n = 5\ntotal = 0\nfor i in range(1, n + 1):\n    total += i\nprint(total)",
              "explanation": "`total += i` is shorthand for `total = total + i`, applied once per number."
            },
            {
              "label": "Built-in sum",
              "code": "n = 5\nprint(sum(range(1, n + 1)))",
              "explanation": "`sum()` adds every value produced by the range — no manual loop needed."
            }
          ]
        },
        {
          "id": "count-the-vowels",
          "title": "Count the Vowels",
          "difficulty": "medium",
          "description": "Given a lowercase word stored in `word`, print how many vowels (`a e i o u`) it contains.\n\n### Example\n```python\nword = \"python\"  ->  1\nword = \"banana\"  ->  3\n```",
          "hints": [
            "You can loop over a string letter by letter: `for letter in word:`.",
            "Keep a `count` variable and add 1 whenever the letter is a vowel.",
            "Check membership with `in`: `if letter in \"aeiou\":`."
          ],
          "solutions": [
            {
              "label": "Loop and count",
              "code": "word = \"banana\"\ncount = 0\nfor letter in word:\n    if letter in \"aeiou\":\n        count += 1\nprint(count)",
              "explanation": "`letter in \"aeiou\"` is True when the letter is one of those five characters."
            },
            {
              "label": "Sum a comprehension",
              "code": "word = \"banana\"\nprint(sum(1 for letter in word if letter in \"aeiou\"))",
              "explanation": "The generator yields a 1 for each vowel; `sum` adds them up. A compact pattern once you're comfortable with loops."
            }
          ]
        }
      ]
    },
    {
      "id": "lists-and-strings",
      "title": "Lists & Strings",
      "problems": [
        {
          "id": "reverse-a-list",
          "title": "Reverse a List",
          "difficulty": "easy",
          "description": "Given a list of numbers `nums`, print the list reversed.\n\n### Example\n```python\nnums = [1, 2, 3, 4]  ->  [4, 3, 2, 1]\n```",
          "hints": [
            "Slicing with a step of -1 reverses a sequence: `nums[::-1]`.",
            "There's also a `.reverse()` method that flips the list in place.",
            "And `reversed(nums)` gives you the items back-to-front (wrap it in `list(...)` to see them)."
          ],
          "solutions": [
            {
              "label": "Slice trick",
              "code": "nums = [1, 2, 3, 4]\nprint(nums[::-1])",
              "explanation": "`[::-1]` means: take the whole list, stepping backwards one at a time."
            },
            {
              "label": "In place",
              "code": "nums = [1, 2, 3, 4]\nnums.reverse()\nprint(nums)",
              "explanation": "`.reverse()` changes the original list rather than making a new one."
            }
          ]
        },
        {
          "id": "find-the-largest-number",
          "title": "Find the Largest Number",
          "difficulty": "medium",
          "description": "Given a non-empty list `nums`, print the largest value **without using the built-in `max()`**.\n\n### Example\n```python\nnums = [4, 9, 2, 7]  ->  9\n```\n\nDoing it by hand first is the point — then compare with `max()`.",
          "hints": [
            "Start by assuming the first item is the biggest: `biggest = nums[0]`.",
            "Walk through the rest and update `biggest` whenever you find something larger.",
            "`if n > biggest: biggest = n` is the comparison you need inside the loop."
          ],
          "solutions": [
            {
              "label": "Track the biggest",
              "code": "nums = [4, 9, 2, 7]\nbiggest = nums[0]\nfor n in nums:\n    if n > biggest:\n        biggest = n\nprint(biggest)",
              "explanation": "Hold onto the largest value seen so far and replace it whenever a bigger one shows up."
            },
            {
              "label": "With max() (compare)",
              "code": "nums = [4, 9, 2, 7]\nprint(max(nums))",
              "explanation": "`max()` does exactly the same scan internally — handy once you understand what it's doing."
            }
          ]
        },
        {
          "id": "remove-duplicates",
          "title": "Remove Duplicates",
          "difficulty": "medium",
          "description": "Given a list `items`, print a new list with duplicates removed, **keeping the original order** of first appearance.\n\n### Example\n```python\nitems = [3, 1, 3, 2, 1]  ->  [3, 1, 2]\n```",
          "hints": [
            "A `set` automatically drops duplicates — but it does **not** preserve order, so it's only half the answer.",
            "Keep a `seen` set and a `result` list; add each item to `result` only the first time you see it.",
            "`if item not in seen:` then append it and record it in `seen`."
          ],
          "solutions": [
            {
              "label": "Order-preserving",
              "code": "items = [3, 1, 3, 2, 1]\nseen = set()\nresult = []\nfor item in items:\n    if item not in seen:\n        seen.add(item)\n        result.append(item)\nprint(result)",
              "explanation": "The `seen` set makes the 'have I met this before?' check fast, while `result` preserves order."
            },
            {
              "label": "dict.fromkeys",
              "code": "items = [3, 1, 3, 2, 1]\nprint(list(dict.fromkeys(items)))",
              "explanation": "Dictionary keys are unique and (since Python 3.7) keep insertion order — a neat one-line trick."
            }
          ]
        }
      ]
    }
  ]
}


# --------------------------------------------------------------------------- #
#  entry point
# --------------------------------------------------------------------------- #
def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    args = sys.argv[2:]
    if cmd == "add":
        cmd_add()
    elif cmd == "edit":
        cmd_edit(args)
    elif cmd == "list":
        cmd_list()
    elif cmd == "remove":
        cmd_remove(args)
    elif cmd == "build":
        build()
    elif cmd == "serve":
        cmd_serve()
    elif cmd == "seed":
        cmd_seed()
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
