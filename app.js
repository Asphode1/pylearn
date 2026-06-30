/* ============================================================
   Python Practice — app logic (no dependencies, offline-friendly)
   Reads window.PROBLEMS (from data.js).
   ============================================================ */

(function () {
  "use strict";

  var SECTIONS = (window.PROBLEMS && window.PROBLEMS.sections) || [];

  /* flatten problems for navigation + lookup */
  var FLAT = [];
  SECTIONS.forEach(function (sec) {
    (sec.problems || []).forEach(function (p) {
      FLAT.push({ section: sec, problem: p });
    });
  });

  /* -------------------------------------------------- storage (guarded) */
  var STORE_KEY = "py-practice-v1";
  function defaultState() {
    return { solved: {}, hints: {}, notes: {}, collapsed: {}, current: null };
  }
  function loadState() {
    var base = defaultState();
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        return Object.assign(base, parsed);
      }
    } catch (e) { /* sandbox / private mode: run in-memory */ }
    return base;
  }
  function saveState() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { /* ignore — memory only */ }
  }
  var state = loadState();

  /* session-only reveal flags (reset each load to encourage re-attempting) */
  var solutionShown = {};
  var activeSol = {};

  /* -------------------------------------------------- helpers */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function findIndexById(id) {
    for (var i = 0; i < FLAT.length; i++) if (FLAT[i].problem.id === id) return i;
    return -1;
  }

  /* -------------------------------------------------- python highlighter */
  var PY_KW = ["def","return","if","elif","else","for","while","in","import","from","as",
    "class","try","except","finally","with","lambda","pass","break","continue","global",
    "nonlocal","yield","raise","assert","del","is","and","or","not","True","False","None"];
  var PY_BI = ["print","len","range","int","str","float","list","dict","set","tuple","sum",
    "min","max","abs","sorted","enumerate","zip","map","filter","input","type","bool",
    "round","reversed","any","all","ord","chr","format"];
  var KWSET = {}, BISET = {};
  PY_KW.forEach(function (k) { KWSET[k] = 1; });
  PY_BI.forEach(function (k) { BISET[k] = 1; });

  function highlightPython(code) {
    var re = /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d+\.?\d*\b)|([A-Za-z_]\w*)|(\s+)|([^\sA-Za-z_0-9]+)/g;
    var out = "", m, prevName = "";
    while ((m = re.exec(code)) !== null) {
      if (m[1] != null) { out += '<span class="tok-com">' + esc(m[1]) + "</span>"; }
      else if (m[2] != null) { out += '<span class="tok-str">' + esc(m[2]) + "</span>"; }
      else if (m[3] != null) { out += '<span class="tok-num">' + esc(m[3]) + "</span>"; }
      else if (m[4] != null) {
        var w = m[4];
        if (KWSET[w]) out += '<span class="tok-kw">' + esc(w) + "</span>";
        else if (BISET[w]) out += '<span class="tok-bi">' + esc(w) + "</span>";
        else if (prevName === "def") out += '<span class="tok-fn">' + esc(w) + "</span>";
        else out += esc(w);
        prevName = w;
      }
      else if (m[5] != null) { out += esc(m[5]); }
      else { out += esc(m[6]); }
      if (m[4] == null) prevName = "";
    }
    return out;
  }

  function codePanel(code, fname, highlight) {
    var body = highlight === false ? esc(code) : highlightPython(code);
    var panel = el("div", "code");
    panel.innerHTML =
      '<div class="code-bar">' +
        '<span class="lights"><i class="l1"></i><i class="l2"></i><i class="l3"></i></span>' +
        '<span class="fname">' + esc(fname || "solution.py") + '</span>' +
        '<button class="copy" type="button">copy</button>' +
      '</div>' +
      '<pre><code>' + body + '</code></pre>';
    var btn = panel.querySelector(".copy");
    btn.addEventListener("click", function () {
      copyText(code, btn);
    });
    return panel;
  }

  function copyText(text, btn) {
    function done() { var o = btn.textContent; btn.textContent = "copied"; setTimeout(function () { btn.textContent = o; }, 1200); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else { fallback(); }
    function fallback() {
      var ta = el("textarea"); ta.value = text;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  /* -------------------------------------------------- mini markdown */
  /* Supports: blank-line paragraphs, ### headings, - lists,
     ```fenced code```, `inline code`, **bold**.  HTML-escaped. */
  function renderProse(md) {
    var container = el("div", "prose");
    var lines = String(md == null ? "" : md).replace(/\r\n/g, "\n").split("\n");
    var i = 0, buf = [], listBuf = null;

    function flushPara() {
      if (buf.length) {
        var txt = buf.join(" ").trim();
        if (txt) container.appendChild(el("p", null, inline(txt)));
        buf = [];
      }
    }
    function flushList() {
      if (listBuf) {
        var ul = el("ul");
        listBuf.forEach(function (item) { ul.appendChild(el("li", null, inline(item))); });
        container.appendChild(ul);
        listBuf = null;
      }
    }
    function inline(t) {
      t = esc(t);
      t = t.replace(/`([^`]+)`/g, function (_, c) { return '<code class="inline">' + c + "</code>"; });
      t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      return t;
    }

    while (i < lines.length) {
      var line = lines[i];
      var fence = line.match(/^```(\w*)\s*$/);
      if (fence) {
        flushPara(); flushList();
        var code = [], lang = fence[1];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) { code.push(lines[i]); i++; }
        i++; /* skip closing fence */
        container.appendChild(codePanel(code.join("\n"), lang ? "example." + (lang === "python" ? "py" : "txt") : "example.txt", lang === "python"));
        continue;
      }
      if (/^\s*$/.test(line)) { flushPara(); flushList(); i++; continue; }
      var h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) { flushPara(); flushList(); container.appendChild(el("h3", null, inline(h[2]))); i++; continue; }
      var li = line.match(/^\s*-\s+(.*)$/);
      if (li) { flushPara(); if (!listBuf) listBuf = []; listBuf.push(li[1]); i++; continue; }
      flushList(); buf.push(line); i++;
    }
    flushPara(); flushList();
    return container;
  }

  /* small inline markdown for hints / explanations (no blocks) */
  function inlineMd(t) {
    t = esc(t == null ? "" : t);
    t = t.replace(/`([^`]+)`/g, function (_, c) { return "<code>" + c + "</code>"; });
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return t;
  }

  /* -------------------------------------------------- progress */
  function solvedCount() {
    var n = 0;
    FLAT.forEach(function (e) { if (state.solved[e.problem.id]) n++; });
    return n;
  }

  /* -------------------------------------------------- export / import progress */
  function exportProgress() {
    try {
      var payload = {
        app: "python-practice",
        version: 1,
        exportedAt: new Date().toISOString(),
        state: state
      };
      var text = JSON.stringify(payload, null, 2);
      var blob = new Blob([text], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = el("a");
      a.href = url;
      a.download = "python-practice-progress.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) {
      window.alert("Export failed: " + (e && e.message ? e.message : e));
    }
  }

  function importProgressFromText(text) {
    var parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { window.alert("That file isn't valid JSON — import cancelled."); return; }
    /* accept either the exported envelope {app, state} or a bare state object */
    var incoming = (parsed && typeof parsed.state === "object" && parsed.state) ? parsed.state : parsed;
    if (!incoming || typeof incoming !== "object") {
      window.alert("That file doesn't look like a progress export — import cancelled.");
      return;
    }
    if (!window.confirm("Import will REPLACE your current progress (solved marks, revealed hints, and notes). Continue?")) {
      return;
    }
    state = Object.assign(defaultState(), incoming);
    saveState();
    renderSidebar("");
    var go = (state.current && findIndexById(state.current) > -1) ? state.current : (FLAT[0] && FLAT[0].problem.id);
    if (go) selectProblem(go, false);
  }

  /* one hidden file input, reused for every import */
  var importInput = el("input");
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.style.display = "none";
  importInput.addEventListener("change", function () {
    var f = this.files && this.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () { importProgressFromText(String(reader.result)); };
    reader.onerror = function () { window.alert("Couldn't read that file."); };
    reader.readAsText(f);
    this.value = "";  /* let the same file be picked again later */
  });
  document.body.appendChild(importInput);

  /* -------------------------------------------------- sidebar */
  var sidebar = document.getElementById("sidebar");

  function renderSidebar(filter) {
    filter = (filter || "").trim().toLowerCase();
    sidebar.innerHTML = "";

    /* brand + progress */
    var brand = el("div", "brand");
    var total = FLAT.length, done = solvedCount();
    var pct = total ? Math.round((done / total) * 100) : 0;
    brand.innerHTML =
      '<div class="brand-name"><span class="dot"></span><span class="tilde">~/</span>python-practice</div>' +
      '<div class="progress-line"><span>progress</span><span>' + done + " / " + total + '</span></div>' +
      '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>';
    sidebar.appendChild(brand);

    /* search */
    var sw = el("div", "search-wrap");
    var input = el("input", "search");
    input.type = "search";
    input.placeholder = "filter problems…";
    input.value = filter;
    input.addEventListener("input", function () { renderNav(this.value); refocusSearch = true; });
    sw.appendChild(input);
    sidebar.appendChild(sw);

    var nav = el("nav", "nav");
    nav.id = "nav";
    sidebar.appendChild(nav);

    /* footer */
    var foot = el("div", "sidebar-foot");

    var io = el("div", "io-row");
    var exportBtn = el("button", "io-btn", "⇪ export");
    exportBtn.type = "button";
    exportBtn.title = "Download your progress as a file";
    exportBtn.addEventListener("click", exportProgress);
    var importBtn = el("button", "io-btn", "⇩ import");
    importBtn.type = "button";
    importBtn.title = "Load progress from a file (overwrites current)";
    importBtn.addEventListener("click", function () { importInput.click(); });
    io.appendChild(exportBtn);
    io.appendChild(importBtn);
    foot.appendChild(io);

    var reset = el("button", "reset-btn", "↺ reset all progress");
    reset.type = "button";
    reset.addEventListener("click", function () {
      if (window.confirm("Clear solved marks, revealed hints, and notes? This cannot be undone.")) {
        state = { solved: {}, hints: {}, notes: {}, collapsed: {}, current: state.current };
        saveState();
        renderSidebar("");
        if (state.current) selectProblem(state.current, false);
      }
    });
    foot.appendChild(reset);
    sidebar.appendChild(foot);

    renderNav(filter);

    if (refocusSearch) {
      var s = sidebar.querySelector(".search");
      if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
      refocusSearch = false;
    }
  }

  var refocusSearch = false;

  function renderNav(filter) {
    filter = (filter || "").trim().toLowerCase();
    var nav = document.getElementById("nav");
    if (!nav) return;
    nav.innerHTML = "";

    SECTIONS.forEach(function (sec) {
      var matches = (sec.problems || []).filter(function (p) {
        if (!filter) return true;
        return (p.title + " " + sec.title).toLowerCase().indexOf(filter) !== -1;
      });
      if (!matches.length) return;

      var collapsed = !filter && !!state.collapsed[sec.id];

      var head = el("button", "section-head" + (collapsed ? " collapsed" : ""));
      head.type = "button";
      head.innerHTML =
        '<span class="caret">▾</span>' +
        '<span>' + esc(sec.title) + '</span>' +
        '<span class="count">' + matches.length + "</span>";
      head.addEventListener("click", function () {
        state.collapsed[sec.id] = !state.collapsed[sec.id];
        saveState();
        renderNav(filter);
      });
      nav.appendChild(head);

      var body = el("div", "section-body" + (collapsed ? " collapsed" : ""));
      matches.forEach(function (p) {
        var idx = findIndexById(p.id);
        var num = String(idx + 1).padStart(2, "0");
        var isSolved = !!state.solved[p.id];
        var row = el("button", "prob-row" + (isSolved ? " solved" : "") + (state.current === p.id ? " active" : ""));
        row.type = "button";
        row.innerHTML =
          '<span class="prob-check">✓</span>' +
          '<span class="prob-id">' + num + "</span>" +
          '<span class="prob-title">' + esc(p.title) + "</span>";
        row.addEventListener("click", function () { selectProblem(p.id, true); });
        body.appendChild(row);
      });
      nav.appendChild(body);
    });

    if (!nav.children.length) {
      nav.appendChild(el("div", "hint-empty", "&nbsp;&nbsp;No problems match that filter."));
    }
  }

  /* -------------------------------------------------- main view */
  var main = document.getElementById("main");

  function renderEmpty() {
    main.innerHTML = "";
    var e = el("div", "empty");
    e.innerHTML = '<div class="big">No problem selected</div><div>Pick one from the list to begin.</div>';
    main.appendChild(e);
  }

  function selectProblem(id, closeNav) {
    var idx = findIndexById(id);
    if (idx === -1) { renderEmpty(); return; }
    state.current = id;
    saveState();
    if (closeNav) document.body.classList.remove("nav-open");
    renderMain(FLAT[idx], idx);
    renderNav(currentFilter());
    main.scrollTop = 0;
  }

  function currentFilter() {
    var s = sidebar.querySelector(".search");
    return s ? s.value : "";
  }

  function renderMain(entry, idx) {
    var p = entry.problem, sec = entry.section;
    main.innerHTML = "";
    var wrap = el("div", "reading");

    /* breadcrumb / terminal path */
    var diff = (p.difficulty || "easy").toLowerCase();
    var fileName = (p.id || "problem").replace(/-/g, "_") + ".py";
    var crumb = el("div", "crumb");
    crumb.innerHTML =
      '<span class="prompt">❯</span>' +
      '<span class="seg-dim">~/python-practice/</span>' +
      '<span class="seg-dim">' + esc(slug(sec.title)) + "/</span>" +
      '<span class="file">' + esc(fileName) + "</span>";
    wrap.appendChild(crumb);

    /* head */
    var head = el("div", "prob-head");
    head.appendChild(el("h1", "prob-h1", esc(p.title)));
    head.appendChild(el("span", "badge diff-" + diff, esc(diff)));
    wrap.appendChild(head);

    /* description */
    wrap.appendChild(renderProse(p.description || ""));

    /* hints */
    var hints = (p.hints || []).slice(0, 3);
    var hintBlock = el("div", "block");
    hintBlock.appendChild(blockLabel("Hints"));
    if (!hints.length) {
      hintBlock.appendChild(el("div", "hint-empty", "No hints for this one — trust yourself."));
    } else {
      var revealed = Math.min(state.hints[p.id] || 0, hints.length);
      var list = el("div");
      hintBlock.appendChild(list);

      function paintHints() {
        list.innerHTML = "";
        for (var k = 0; k < revealed; k++) {
          var hn = el("div", "hint");
          hn.innerHTML = '<span class="h-num">' + (k + 1) + "/" + hints.length + '</span>' +
                         '<span class="h-text">' + inlineMd(hints[k]) + "</span>";
          list.appendChild(hn);
        }
        if (revealed < hints.length) {
          var btn = el("button", "reveal-btn");
          btn.type = "button";
          btn.innerHTML = (revealed === 0 ? "💡 Show a hint" : "💡 Next hint") +
                          ' <span class="cnt">[' + revealed + "/" + hints.length + "]</span>";
          btn.addEventListener("click", function () {
            revealed++;
            state.hints[p.id] = revealed;
            saveState();
            paintHints();
          });
          list.appendChild(btn);
        }
      }
      paintHints();
    }
    wrap.appendChild(hintBlock);

    /* solutions */
    var sols = p.solutions || [];
    var solBlock = el("div", "block");
    solBlock.appendChild(blockLabel("Solution" + (sols.length > 1 ? "s" : "")));
    if (!sols.length) {
      solBlock.appendChild(el("div", "hint-empty", "No solution recorded yet."));
    } else if (!solutionShown[p.id]) {
      var rb = el("button", "reveal-btn", "🔓 Reveal solution" + (sols.length > 1 ? ' <span class="cnt">[' + sols.length + " approaches]</span>" : ""));
      rb.type = "button";
      rb.addEventListener("click", function () {
        solutionShown[p.id] = true;
        renderSolutions(solBlock, p, sols);
      });
      solBlock.appendChild(rb);
    } else {
      renderSolutions(solBlock, p, sols);
    }
    wrap.appendChild(solBlock);

    /* notes */
    var noteBlock = el("div", "block");
    noteBlock.appendChild(blockLabel("Your notes"));
    var ta = el("textarea", "notes");
    ta.placeholder = "# jot your attempt, questions, or what clicked…";
    ta.value = state.notes[p.id] || "";
    ta.addEventListener("input", function () {
      state.notes[p.id] = this.value;
      saveState();
    });
    noteBlock.appendChild(ta);
    wrap.appendChild(noteBlock);

    /* mark solved */
    var solveWrap = el("div", "block");
    var on = !!state.solved[p.id];
    var toggle = el("button", "solve-toggle" + (on ? " on" : ""));
    toggle.type = "button";
    toggle.innerHTML = '<span class="box">✓</span><span class="lbl">' + (on ? "Solved" : "Mark as solved") + "</span>";
    toggle.addEventListener("click", function () {
      if (state.solved[p.id]) delete state.solved[p.id]; else state.solved[p.id] = true;
      saveState();
      var nowOn = !!state.solved[p.id];
      toggle.classList.toggle("on", nowOn);
      toggle.querySelector(".lbl").textContent = nowOn ? "Solved" : "Mark as solved";
      updateProgress();
      renderNav(currentFilter());
    });
    solveWrap.appendChild(toggle);
    wrap.appendChild(solveWrap);

    /* prev / next */
    var foot = el("div", "foot-nav");
    var prev = FLAT[idx - 1], next = FLAT[idx + 1];
    var pb = el("button", "foot-btn prev");
    pb.type = "button";
    pb.disabled = !prev;
    pb.innerHTML = '<span class="dir">← previous</span><span class="ttl">' + (prev ? esc(prev.problem.title) : "—") + "</span>";
    if (prev) pb.addEventListener("click", function () { selectProblem(prev.problem.id, false); });
    var nb = el("button", "foot-btn next");
    nb.type = "button";
    nb.disabled = !next;
    nb.innerHTML = '<span class="dir">next →</span><span class="ttl">' + (next ? esc(next.problem.title) : "—") + "</span>";
    if (next) nb.addEventListener("click", function () { selectProblem(next.problem.id, false); });
    foot.appendChild(pb); foot.appendChild(nb);
    wrap.appendChild(foot);

    main.appendChild(wrap);
  }

  function renderSolutions(block, p, sols) {
    /* clear everything after the label */
    var label = block.querySelector(".block-label");
    block.innerHTML = "";
    block.appendChild(label);

    var current = activeSol[p.id] || 0;
    if (current >= sols.length) current = 0;

    if (sols.length > 1) {
      var tabs = el("div", "sol-tabs");
      sols.forEach(function (s, i) {
        var t = el("button", "sol-tab" + (i === current ? " active" : ""));
        t.type = "button";
        t.textContent = s.label || ("Approach " + (i + 1));
        t.addEventListener("click", function () {
          activeSol[p.id] = i;
          renderSolutions(block, p, sols);
        });
        tabs.appendChild(t);
      });
      block.appendChild(tabs);
    }

    var sol = sols[current];
    block.appendChild(codePanel(sol.code || "", (p.id || "solution").replace(/-/g, "_") + ".py", true));
    if (sol.explanation) {
      block.appendChild(el("div", "sol-explain", inlineMd(sol.explanation)));
    }
  }

  function blockLabel(text) {
    var l = el("div", "block-label");
    l.innerHTML = "<span>" + esc(text) + '</span><span class="rule"></span>';
    return l;
  }

  function updateProgress() {
    var fill = sidebar.querySelector(".progress-fill");
    var line = sidebar.querySelector(".progress-line span:last-child");
    var total = FLAT.length, done = solvedCount();
    if (fill) fill.style.width = (total ? Math.round((done / total) * 100) : 0) + "%";
    if (line) line.textContent = done + " / " + total;
  }

  function slug(t) {
    return String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  /* -------------------------------------------------- mobile + keys */
  document.getElementById("menuToggle").addEventListener("click", function () {
    document.body.classList.toggle("nav-open");
  });
  document.getElementById("scrim").addEventListener("click", function () {
    document.body.classList.remove("nav-open");
  });
  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "input") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var idx = findIndexById(state.current);
    if (e.key === "ArrowRight" && idx > -1 && FLAT[idx + 1]) selectProblem(FLAT[idx + 1].problem.id, false);
    if (e.key === "ArrowLeft" && idx > -1 && FLAT[idx - 1]) selectProblem(FLAT[idx - 1].problem.id, false);
  });

  /* -------------------------------------------------- boot */
  if (!FLAT.length) {
    renderSidebar("");
    main.innerHTML = "";
    var e = el("div", "empty");
    e.innerHTML = '<div class="big">No problems yet</div><div>Run <code>python manage.py seed</code> or <code>add</code> to create some.</div>';
    main.appendChild(e);
    return;
  }

  renderSidebar("");
  var start = (state.current && findIndexById(state.current) > -1) ? state.current : FLAT[0].problem.id;
  selectProblem(start, false);
})();
