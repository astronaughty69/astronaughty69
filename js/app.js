(function () {
  const STORAGE_KEY = "vcs_state_v1";
  const app = document.getElementById("app");
  let toastTimer = null;

  function freshState() {
    return {
      cards: DEFAULT_CARDS.slice(),
      order: DEFAULT_CARDS.map((c) => c.id),
      assignments: {},
      lastAction: null,
      ranking: [],
      reflections: {},
      screen: "welcome",
    };
  }

  let state = freshState();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* storage unavailable; ignore */
    }
  }

  function hasSavedProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return parsed && parsed.screen && parsed.screen !== "welcome";
    } catch (e) {
      return false;
    }
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state = JSON.parse(raw);
    } catch (e) {
      state = freshState();
    }
  }

  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
    state = freshState();
    render();
  }

  function cardById(id) {
    return state.cards.find((c) => c.id === id);
  }

  function unsortedIds() {
    return state.order.filter((id) => !(id in state.assignments));
  }

  function idsInBucket(bucket) {
    return state.order.filter((id) => state.assignments[id] === bucket);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function showToast(msg) {
    let toast = document.getElementById("toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function confirmModal(message, onConfirm) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn ghost" id="modal-cancel">Cancel</button>
          <button class="btn" id="modal-confirm">Yes, continue</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector("#modal-cancel").addEventListener("click", () => backdrop.remove());
    backdrop.querySelector("#modal-confirm").addEventListener("click", () => {
      backdrop.remove();
      onConfirm();
    });
  }

  // ---------- Screens ----------

  function renderWelcome() {
    const resumeAvailable = hasSavedProgress();
    app.innerHTML = `
      <div class="screen">
        <div class="welcome-card">
          <h1>What matters to you at work?</h1>
          <p>You don't need to know what jobs exist to know how you want to work and live. Sort these cards into what you must have, what you'd like, and what you don't need. At the end you'll have a ranked top 5, and a sentence for what each one actually looks like in practice.</p>
          <div class="welcome-actions">
            ${resumeAvailable ? '<button class="btn" id="resume-btn">Resume</button>' : ""}
            <button class="btn ${resumeAvailable ? "secondary" : ""}" id="start-btn">${resumeAvailable ? "Start Over" : "Start"}</button>
          </div>
        </div>
      </div>`;

    if (resumeAvailable) {
      document.getElementById("resume-btn").addEventListener("click", () => {
        loadSaved();
        render();
      });
      document.getElementById("start-btn").addEventListener("click", () => {
        confirmModal("This will clear your saved progress and start fresh. Continue?", () => {
          clearAll();
          state.screen = "sort";
          save();
          render();
        });
      });
    } else {
      document.getElementById("start-btn").addEventListener("click", () => {
        state.screen = "sort";
        save();
        render();
      });
    }
  }

  const BUCKET_LABELS = { must: "Must Have", like: "Would Like", no: "Don't Need" };

  function assignCard(cardId, bucket) {
    const prevBucket = state.assignments[cardId] || null;
    state.assignments[cardId] = bucket;
    state.lastAction = { cardId, prevBucket };
    save();
  }

  function undoLast() {
    if (!state.lastAction) return;
    const { cardId, prevBucket } = state.lastAction;
    if (prevBucket) {
      state.assignments[cardId] = prevBucket;
    } else {
      delete state.assignments[cardId];
    }
    state.lastAction = null;
    save();
    render();
  }

  function renderColumns(activeBucketOnly) {
    const buckets = ["must", "like", "no"];
    return `<div class="columns">
      ${buckets
        .map((b) => {
          const ids = idsInBucket(b);
          return `<div class="column">
            <h3><span><span class="column-header-dot dot-${b}"></span>${BUCKET_LABELS[b]}</span><span class="count">${ids.length}</span></h3>
            <div class="chip-list">
              ${
                ids.length
                  ? ids
                      .map((id) => {
                        const c = cardById(id);
                        return `<button class="chip" data-reassign="${id}"><span class="chip-name">${escapeHtml(c.name)}</span><span class="chip-move">move ▾</span></button>`;
                      })
                      .join("")
                  : '<div class="empty-hint">Nothing here yet</div>'
              }
            </div>
          </div>`;
        })
        .join("")}
    </div>`;
  }

  function openReassignMenu(cardId, anchorEl) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const c = cardById(cardId);
    backdrop.innerHTML = `
      <div class="modal">
        <h3>${escapeHtml(c.name)}</h3>
        <p class="muted">Move to:</p>
        <div class="welcome-actions">
          <button class="btn ${state.assignments[cardId] === "must" ? "" : "secondary"}" data-move="must">Must Have</button>
          <button class="btn ${state.assignments[cardId] === "like" ? "" : "secondary"}" data-move="like">Would Like</button>
          <button class="btn ${state.assignments[cardId] === "no" ? "" : "secondary"}" data-move="no">Don't Need</button>
          <button class="btn ghost" id="modal-close">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelectorAll("[data-move]").forEach((btn) => {
      btn.addEventListener("click", () => {
        assignCard(cardId, btn.getAttribute("data-move"));
        backdrop.remove();
        render();
      });
    });
    backdrop.querySelector("#modal-close").addEventListener("click", () => backdrop.remove());
  }

  function renderAddForm(container) {
    container.innerHTML = `
      <div class="add-form">
        <label for="new-card-name"><strong>Value name</strong></label>
        <input id="new-card-name" type="text" placeholder="e.g. Deep focus time" maxlength="60" />
        <label for="new-card-desc"><strong>Short description (optional)</strong></label>
        <textarea id="new-card-desc" placeholder="One line about what this means to you" maxlength="140"></textarea>
        <div class="add-form-actions">
          <button class="btn" id="add-card-save">Add card</button>
          <button class="btn ghost" id="add-card-cancel">Cancel</button>
        </div>
      </div>`;
    container.querySelector("#add-card-cancel").addEventListener("click", () => {
      container.innerHTML = "";
    });
    container.querySelector("#add-card-save").addEventListener("click", () => {
      const nameInput = container.querySelector("#new-card-name");
      const descInput = container.querySelector("#new-card-desc");
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      const id = "custom-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      state.cards.push({ id, name, description: descInput.value.trim() });
      state.order.push(id);
      save();
      render();
      showToast(`Added "${name}" to the deck`);
    });
  }

  function renderSort() {
    const unsorted = unsortedIds();
    const total = state.order.length;
    const done = total - unsorted.length;

    if (unsorted.length === 0) {
      state.screen = "narrow";
      save();
      return renderNarrow();
    }

    const currentId = unsorted[0];
    const card = cardById(currentId);

    app.innerHTML = `
      <div class="screen">
        <div class="sort-header">
          <h2>Sort the cards</h2>
        </div>
        <div class="progress-wrap">
          <div class="progress-track"><div class="progress-fill" style="width:${(done / total) * 100}%"></div></div>
          <div class="progress-label">${done} of ${total}</div>
        </div>

        <div class="current-card">
          <h2>${escapeHtml(card.name)}</h2>
          <p>${escapeHtml(card.description)}</p>
        </div>

        <div class="bucket-buttons">
          <button class="bucket-btn must" data-assign="must">Must Have</button>
          <button class="bucket-btn like" data-assign="like">Would Like</button>
          <button class="bucket-btn no" data-assign="no">Don't Need</button>
        </div>

        <div class="sort-actions">
          <button class="btn ghost small" id="undo-btn" ${state.lastAction ? "" : "disabled"}>Undo last</button>
          <button class="btn secondary small" id="add-value-btn">+ Add your own value</button>
        </div>

        <div id="add-form-container"></div>

        ${renderColumns()}
      </div>`;

    app.querySelectorAll("[data-assign]").forEach((btn) => {
      btn.addEventListener("click", () => {
        assignCard(currentId, btn.getAttribute("data-assign"));
        render();
      });
    });
    document.getElementById("undo-btn").addEventListener("click", undoLast);
    document.getElementById("add-value-btn").addEventListener("click", () => {
      renderAddForm(document.getElementById("add-form-container"));
    });
    app.querySelectorAll("[data-reassign]").forEach((btn) => {
      btn.addEventListener("click", () => openReassignMenu(btn.getAttribute("data-reassign"), btn));
    });
  }

  function renderNarrow() {
    const mustIds = idsInBucket("must");
    const overLimit = mustIds.length > 10;

    app.innerHTML = `
      <div class="screen">
        <h2>Your Must Have pile</h2>
        ${
          overLimit
            ? `<p>Your Must Have pile has <strong>${mustIds.length}</strong> cards. Try narrowing to your top 10 &mdash; you can move some to Would Like.</p>`
            : `<p>You have <strong>${mustIds.length}</strong> cards in Must Have. Ready to rank them.</p>`
        }
        <div class="narrow-list">
          ${
            mustIds.length
              ? mustIds
                  .map((id) => {
                    const c = cardById(id);
                    return `<div class="narrow-item">
                      <div><div class="chip-name">${escapeHtml(c.name)}</div><div class="muted" style="font-size:0.85rem">${escapeHtml(c.description)}</div></div>
                      <button class="btn ghost small" data-move-like="${id}">Move to Would Like</button>
                    </div>`;
                  })
                  .join("")
              : '<div class="empty-hint">No cards in Must Have.</div>'
          }
        </div>
        <div class="footer-nav">
          <button class="btn ghost" id="back-to-sort">Back to sorting</button>
          <button class="btn" id="continue-to-rank">Continue to ranking</button>
        </div>
      </div>`;

    app.querySelectorAll("[data-move-like]").forEach((btn) => {
      btn.addEventListener("click", () => {
        assignCard(btn.getAttribute("data-move-like"), "like");
        render();
      });
    });
    document.getElementById("back-to-sort").addEventListener("click", () => {
      state.screen = "sort";
      save();
      render();
    });
    document.getElementById("continue-to-rank").addEventListener("click", () => {
      state.ranking = idsInBucket("must").slice();
      state.screen = "rank";
      save();
      render();
    });
  }

  function moveRank(index, delta) {
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= state.ranking.length) return;
    const arr = state.ranking;
    [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
    save();
    render();
  }

  function renderRank() {
    if (state.ranking.length === 0) {
      state.ranking = idsInBucket("must").slice();
    }
    app.innerHTML = `
      <div class="screen">
        <h2>Put these in order</h2>
        <p class="muted">Most important at the top. Use the arrows to reorder.</p>
        <div class="rank-list">
          ${state.ranking
            .map((id, i) => {
              const c = cardById(id);
              return `<div class="rank-item">
                <div class="rank-position">${i + 1}</div>
                <div class="rank-info"><div class="name">${escapeHtml(c.name)}</div><div class="desc">${escapeHtml(c.description)}</div></div>
                <div class="rank-arrows">
                  <button class="arrow-btn" data-up="${i}" ${i === 0 ? "disabled" : ""}>▲</button>
                  <button class="arrow-btn" data-down="${i}" ${i === state.ranking.length - 1 ? "disabled" : ""}>▼</button>
                </div>
              </div>`;
            })
            .join("")}
        </div>
        <div class="footer-nav">
          <button class="btn ghost" id="back-to-narrow">Back</button>
          <button class="btn" id="continue-to-reflect">Continue</button>
        </div>
      </div>`;

    app.querySelectorAll("[data-up]").forEach((btn) => btn.addEventListener("click", () => moveRank(parseInt(btn.getAttribute("data-up"), 10), -1)));
    app.querySelectorAll("[data-down]").forEach((btn) => btn.addEventListener("click", () => moveRank(parseInt(btn.getAttribute("data-down"), 10), 1)));
    document.getElementById("back-to-narrow").addEventListener("click", () => {
      state.screen = "narrow";
      save();
      render();
    });
    document.getElementById("continue-to-reflect").addEventListener("click", () => {
      state.screen = "reflect";
      save();
      render();
    });
  }

  function renderReflect() {
    const top5 = state.ranking.slice(0, 5);
    app.innerHTML = `
      <div class="screen">
        <h2>What would this look like in real life?</h2>
        <p class="muted">Free text, one sentence is enough. Optional but encouraged.</p>
        <div class="reflect-list">
          ${top5
            .map((id, i) => {
              const c = cardById(id);
              const text = state.reflections[id] || "";
              return `<div class="reflect-item">
                <div><span class="rank-badge">${i + 1}</span><span class="name" style="font-weight:700">${escapeHtml(c.name)}</span></div>
                <p class="muted" style="margin:6px 0 0">${escapeHtml(c.description)}</p>
                <textarea data-reflect="${id}" placeholder="One sentence is enough.">${escapeHtml(text)}</textarea>
              </div>`;
            })
            .join("")}
        </div>
        <div class="footer-nav">
          <button class="btn ghost" id="back-to-rank">Back</button>
          <button class="btn" id="continue-to-summary">See summary</button>
        </div>
      </div>`;

    app.querySelectorAll("[data-reflect]").forEach((ta) => {
      ta.addEventListener("input", () => {
        state.reflections[ta.getAttribute("data-reflect")] = ta.value;
        save();
      });
    });
    document.getElementById("back-to-rank").addEventListener("click", () => {
      state.screen = "rank";
      save();
      render();
    });
    document.getElementById("continue-to-summary").addEventListener("click", () => {
      state.screen = "summary";
      save();
      render();
    });
  }

  function buildSummaryText() {
    const top5 = state.ranking.slice(0, 5);
    const lines = ["My Top 5 Values", ""];
    top5.forEach((id, i) => {
      const c = cardById(id);
      lines.push(`${i + 1}. ${c.name} — ${c.description}`);
      const reflection = state.reflections[id];
      if (reflection && reflection.trim()) {
        lines.push(`   In real life: ${reflection.trim()}`);
      }
      lines.push("");
    });
    return lines.join("\n").trim();
  }

  function renderSummary() {
    const top5 = state.ranking.slice(0, 5);
    app.innerHTML = `
      <div class="screen">
        <h2>Your Top 5</h2>
        <div class="summary-list">
          ${top5
            .map((id, i) => {
              const c = cardById(id);
              const reflection = state.reflections[id];
              return `<div class="summary-item">
                <div class="name">${i + 1}. ${escapeHtml(c.name)}</div>
                <div class="desc">${escapeHtml(c.description)}</div>
                ${reflection && reflection.trim() ? `<div class="reflection">"${escapeHtml(reflection.trim())}"</div>` : ""}
              </div>`;
            })
            .join("")}
        </div>
        <div class="summary-actions">
          <button class="btn" id="copy-summary">Copy summary as text</button>
          <button class="btn secondary" id="share-summary">Share</button>
        </div>
        <div class="footer-nav">
          <button class="btn ghost" id="back-to-reflect">Back</button>
          <button class="btn ghost" id="start-over-btn">Start Over</button>
        </div>
      </div>`;

    document.getElementById("copy-summary").addEventListener("click", async () => {
      const text = buildSummaryText();
      try {
        await navigator.clipboard.writeText(text);
        showToast("Copied to clipboard");
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        showToast("Copied to clipboard");
      }
    });

    const shareBtn = document.getElementById("share-summary");
    if (navigator.share) {
      shareBtn.addEventListener("click", () => {
        navigator.share({ title: "My Top 5 Values", text: buildSummaryText() }).catch(() => {});
      });
    } else {
      shareBtn.style.display = "none";
    }

    document.getElementById("back-to-reflect").addEventListener("click", () => {
      state.screen = "reflect";
      save();
      render();
    });
    document.getElementById("start-over-btn").addEventListener("click", () => {
      confirmModal("This will clear your results and start over. Continue?", () => {
        clearAll();
      });
    });
  }

  function render() {
    switch (state.screen) {
      case "sort":
        return renderSort();
      case "narrow":
        return renderNarrow();
      case "rank":
        return renderRank();
      case "reflect":
        return renderReflect();
      case "summary":
        return renderSummary();
      default:
        return renderWelcome();
    }
  }

  // Init: show welcome by default; if there's saved progress mid-flow, welcome screen offers Resume.
  render();
})();
