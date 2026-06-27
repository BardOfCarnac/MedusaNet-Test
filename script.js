const SUPABASE_URL = "https://qfylqdpcbfyzijsgofjp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gTnZUIn-1ed99MSh1E3ryg__9V2ZxE6";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function startNightCityNews() {
  /* =========================================================
     ELEMENTS
  ========================================================= */

  const storiesData = document.getElementById("stories-data");
  const feed = document.getElementById("feed");
  const inspector = document.getElementById("inspector");
  const mobileDrawer = document.getElementById("mobile-drawer");

  const showFiltersButton = document.getElementById("show-filters");
  const showSubmitButton = document.getElementById("show-submit");

  const filtersTemplate = document.getElementById("filters-template");
  const submitTemplate = document.getElementById("submit-template");

  if (
    !storiesData ||
    !feed ||
    !inspector ||
    !mobileDrawer ||
    !showFiltersButton ||
    !showSubmitButton ||
    !filtersTemplate ||
    !submitTemplate
  ) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      "<p style='color:red'>Night City News failed to find required HTML elements.</p>"
    );
    return;
  }

  /* =========================================================
     STATE
  ========================================================= */

  let stories = JSON.parse(storiesData.textContent);
  let selectedStoryId = stories[0]?.id || null;
  let expandedStoryId = null;
  let inspectorMode = "story";
  let currentSearch = "";
  let currentTimeFilter = "Now";

  let selectedCategories = new Set([
    "Business",
    "Community",
    "Crime",
    "Infrastructure",
    "Politics",
    "Culture"
  ]);

  let selectedAreas = new Set([
    "City Core",
    "Urban Sprawl",
    "Industrial Fringe",
    "Private Enclave",
    "Frontier Zone"
  ]);

  let selectedPriorities = new Set([
    "Bulletin",
    "Advisory",
    "Alert",
    "Warning",
    "Emergency"
  ]);

  let selectedSourceTypes = new Set([
    "Corporate",
    "Civic Notice",
    "Press Report",
    "Eyewitness",
    "Scanner Traffic",
    "Anonymous Leak",
    "Underground"
  ]);

  /* =========================================================
     HELPERS
  ========================================================= */

  function isDesktop() {
    return window.matchMedia("(min-width: 601px)").matches;
  }

  function priorityClass(priority) {
    return `priority-${String(priority).toLowerCase()}`;
  }

  function storyRailClass(story) {
    return `story-${priorityClass(story.priority)}`;
  }

  function getVisibleStories() {
    return stories.filter(storyMatchesFilters);
  }

  function getSelectedStory() {
    return stories.find(story => story.id === selectedStoryId);
  }

  function resetElementAnimation(element) {
    if (!element) return;
    element.style.animation = "none";
    element.offsetHeight;
    element.style.animation = "";
  }

  /* =========================================================
     PROJECTION ANIMATION HELPERS
  ========================================================= */

  function coolThenProject(element, update, delay = 520) {
    if (!element) {
      update();
      return;
    }

    element.classList.add("ov-cooling");

    setTimeout(() => {
      update();

      element.classList.remove("ov-cooling");
      element.classList.add("ov-acquiring");

      resetElementAnimation(element);

      setTimeout(() => {
        element.classList.remove("ov-acquiring");
      }, 760);
    }, delay);
  }

  function animateStoryReflow(update) {
    const firstPositions = new Map();

    document.querySelectorAll(".story").forEach(story => {
      if (story.dataset.storyId) {
        firstPositions.set(story.dataset.storyId, story.getBoundingClientRect());
      }
    });

    update();

    requestAnimationFrame(() => {
      document.querySelectorAll(".story").forEach(story => {
        const before = firstPositions.get(story.dataset.storyId);
        const after = story.getBoundingClientRect();

        if (!before || !after) return;

        const deltaY = before.top - after.top;

        if (Math.abs(deltaY) > 1) {
          story.animate(
            [
              { transform: `translateY(${deltaY}px)` },
              { transform: "translateY(0)" }
            ],
            {
              duration: 420,
              easing: "cubic-bezier(0.16, 1, 0.3, 1)"
            }
          );
        }
      });
    });
  }

  /* =========================================================
     SUPABASE
  ========================================================= */

  async function loadStoriesFromSupabase() {
    const { data, error } = await supabaseClient
      .from("stories")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase load failed:", error);
      return;
    }

    if (!data || !data.length) return;

    stories = data.map(row => ({
      id: String(row.id),
      headline: row.headline,
      body: row.body,
      category: row.category,
      area: row.area,
      source: row.source,
      sourceType: row.source_type || "Press Report",
      priority: row.priority,
      timeScope: row.time_scope || "Now",
      date: row.story_date,
      time: row.story_time
    }));

    selectedStoryId = stories[0]?.id || null;
    renderFeed();
  }

  /* =========================================================
     FILTERING
  ========================================================= */

  function storyMatchesFilters(story) {
    if (!selectedCategories.has(story.category)) return false;
    if (!selectedAreas.has(story.area)) return false;
    if (!selectedPriorities.has(story.priority)) return false;
    if (!selectedSourceTypes.has(story.sourceType)) return false;

    if (currentTimeFilter === "Now" && story.timeScope !== "Now") return false;

    if (
      currentTimeFilter === "Last Day" &&
      story.timeScope !== "Now" &&
      story.timeScope !== "Last Day"
    ) {
      return false;
    }

    const searchable = `
      ${story.headline}
      ${story.body}
      ${story.category}
      ${story.area}
      ${story.priority}
      ${story.source}
      ${story.sourceType}
    `.toLowerCase();

    return searchable.includes(currentSearch.toLowerCase());
  }

  /* =========================================================
     STORY DETAIL HTML
  ========================================================= */

  function renderStoryDetail(story) {
    if (!story) return `<div class="empty">No transmission selected.</div>`;

    return `
      <h2>${story.headline}</h2>
      <p>${story.body || "No further details available."}</p>

      <div class="detail-grid">
        <div class="detail-label">Category</div><div>${story.category}</div>
        <div class="detail-label">Area</div><div>${story.area}</div>
        <div class="detail-label">Source</div><div>${story.source}</div>
        <div class="detail-label">Source Type</div><div>${story.sourceType}</div>
        <div class="detail-label">Priority</div><div class="${priorityClass(story.priority)}">${story.priority}</div>
        <div class="detail-label">Date</div><div>${story.date}</div>
        <div class="detail-label">Time</div><div>${story.time}</div>
      </div>
    `;
  }

  /* =========================================================
     INSPECTOR
  ========================================================= */

  function renderInspectorContent() {
    inspector.className = "inspector";

    if (!isDesktop()) {
      inspector.innerHTML = "";
      return;
    }

    if (inspectorMode === "filters") {
      renderFiltersInto(inspector);
      return;
    }

    if (inspectorMode === "submit") {
      renderSubmitInto(inspector);
      return;
    }

    const selectedStory = getSelectedStory();

    inspector.innerHTML = `
      <div class="inspector-rail ${selectedStory ? priorityClass(selectedStory.priority) : ""}"></div>
      <div class="inspector-content">
        ${renderStoryDetail(selectedStory)}
      </div>
    `;
  }

  function renderInspector({ animate = false } = {}) {
    if (animate && isDesktop()) {
      coolThenProject(inspector, renderInspectorContent);
    } else {
      renderInspectorContent();
    }
  }

  /* =========================================================
     FEED
  ========================================================= */

  function renderFeed({ animateInspector = false } = {}) {
    const visibleStories = getVisibleStories();

    if (visibleStories.length && !visibleStories.some(story => story.id === selectedStoryId)) {
      selectedStoryId = visibleStories[0].id;
    }

    feed.innerHTML = "";

    if (!visibleStories.length) {
      feed.innerHTML = `<div class="empty">No transmissions found.</div>`;
      renderInspector({ animate: animateInspector });
      return;
    }

    visibleStories.forEach(story => {
      const article = document.createElement("article");
      article.className = `story ${storyRailClass(story)}`;
      article.dataset.storyId = story.id;

      if (story.id === selectedStoryId) article.classList.add("selected");
      if (story.id === expandedStoryId) article.classList.add("open");

      article.innerHTML = `
        <div class="story-header">
          <h2>${story.headline}</h2>
          <div class="meta">
            ${story.category} • ${story.area} • ${story.source}
          </div>
        </div>

        <div class="story-detail">
          ${renderStoryDetail(story)}
        </div>
      `;

      article.addEventListener("click", () => {
        if (isDesktop()) {
          if (selectedStoryId === story.id && inspectorMode === "story") return;

          selectedStoryId = story.id;
          inspectorMode = "story";
          clearCommandButtons();

          renderFeed({ animateInspector: true });
          return;
        }

        animateStoryReflow(() => {
          expandedStoryId = expandedStoryId === story.id ? null : story.id;
          renderFeed();
        });
      });

      feed.appendChild(article);
    });

    renderInspector({ animate: animateInspector });
  }

  /* =========================================================
     COMMAND BUTTONS
  ========================================================= */

  function clearCommandButtons() {
    showFiltersButton.classList.remove("active");
    showSubmitButton.classList.remove("active");
  }

  function setMode(mode, button) {
    const currentlyActive = button.classList.contains("active");

    clearCommandButtons();

    if (currentlyActive) {
      inspectorMode = "story";
      mobileDrawer.innerHTML = "";

      if (isDesktop()) {
        renderInspector({ animate: true });
      }

      return;
    }

    inspectorMode = mode;
    button.classList.add("active");

    if (isDesktop()) {
      renderInspector({ animate: true });
      return;
    }

    coolThenProject(mobileDrawer, () => {
      mobileDrawer.innerHTML = "";

      if (mode === "filters") renderFiltersInto(mobileDrawer);
      if (mode === "submit") renderSubmitInto(mobileDrawer);
    });
  }

  showFiltersButton.addEventListener("click", () => {
    setMode("filters", showFiltersButton);
  });

  showSubmitButton.addEventListener("click", () => {
    setMode("submit", showSubmitButton);
  });

  /* =========================================================
     FILTERS
  ========================================================= */

  function renderFiltersInto(target) {
    target.innerHTML = "";
    target.appendChild(filtersTemplate.content.cloneNode(true));

    const filterTabs = target.querySelectorAll(".filter-tab");
    const filterPanels = target.querySelectorAll(".filter-panel");
    const filterOptions = target.querySelectorAll(".filter-option");
    const utilityButtons = target.querySelectorAll(".utility-btn");
    const timeButtons = target.querySelectorAll(".time-option");
    const searchInput = target.querySelector("#search");

    const sets = {
      category: selectedCategories,
      area: selectedAreas,
      priority: selectedPriorities,
      sourceType: selectedSourceTypes
    };

    searchInput.value = currentSearch;

    filterOptions.forEach(button => {
      button.classList.toggle("active", sets[button.dataset.group].has(button.dataset.value));
    });

    timeButtons.forEach(button => {
      button.classList.toggle("active", button.dataset.time === currentTimeFilter);
    });

    filterTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        const panel = target.querySelector(`#${tab.dataset.panel}`);
        const alreadyOpen = panel.classList.contains("open");

        filterTabs.forEach(t => t.classList.remove("active"));
        filterPanels.forEach(p => p.classList.remove("open"));

        if (!alreadyOpen) {
          tab.classList.add("active");
          panel.classList.add("open");
        }
      });
    });

    filterOptions.forEach(button => {
      button.addEventListener("click", () => {
        const set = sets[button.dataset.group];
        const value = button.dataset.value;

        if (set.has(value)) set.delete(value);
        else set.add(value);

        renderFeed();
        renderFiltersInto(target);
      });
    });

    utilityButtons.forEach(button => {
      button.addEventListener("click", () => {
        const group = button.dataset.group;
        const set = sets[group];
        const matchingButtons = target.querySelectorAll(`.filter-option[data-group="${group}"]`);

        set.clear();

        if (button.dataset.action === "select-all") {
          matchingButtons.forEach(btn => set.add(btn.dataset.value));
        }

        renderFeed();
        renderFiltersInto(target);
      });
    });

    timeButtons.forEach(button => {
      button.addEventListener("click", () => {
        currentTimeFilter = button.dataset.time;
        renderFeed();
        renderFiltersInto(target);
      });
    });

    searchInput.addEventListener("input", () => {
      currentSearch = searchInput.value;
      renderFeed();
    });
  }

  /* =========================================================
     SUBMIT
  ========================================================= */

  function renderSubmitInto(target) {
    target.innerHTML = "";
    target.appendChild(submitTemplate.content.cloneNode(true));

    const submitForm = target.querySelector(".submit-form");
    const submitMessage = target.querySelector(".submit-message");

    if (!submitForm) return;

    submitForm.addEventListener("submit", async event => {
      event.preventDefault();

      const newStory = {
        headline: target.querySelector("#submit-headline").value,
        body: target.querySelector("#submit-body").value,
        category: target.querySelector("#submit-category").value,
        area: target.querySelector("#submit-area").value,
        source: target.querySelector("#submit-source").value || "Anonymous Source",
        source_type: target.querySelector("#submit-source-type").value,
        priority: target.querySelector("#submit-priority").value,
        time_scope: "Now",
        story_date: new Date().toDateString(),
        story_time: new Date().toTimeString().slice(0, 5),
        approved: true
      };

      const { error } = await supabaseClient
        .from("stories")
        .insert([newStory]);

      if (error) {
        if (submitMessage) submitMessage.textContent = "Transmission failed.";
        console.error(error);
        return;
      }

      if (submitMessage) submitMessage.textContent = "Transmission received.";
      submitForm.reset();
      loadStoriesFromSupabase();
    });
  }

  /* =========================================================
     DEPTH
  ========================================================= */

  function updateDepthFromPointer(event) {
    const y = (event.clientY / window.innerHeight - 0.5) * 14;
    const scale = 1 + Math.abs(y) * 0.001;

    document.documentElement.style.setProperty("--ov-depth-y", `${y.toFixed(2)}px`);
    document.documentElement.style.setProperty("--ov-depth-scale", scale.toFixed(4));
  }

  window.addEventListener("mousemove", updateDepthFromPointer);

  /* =========================================================
     RARE OPTICAL EVENTS
     Loud while testing. Reduce thresholds later.
  ========================================================= */

  function triggerOpticalEvent(className, duration, afterClass) {
    document.body.classList.add(className);

    setTimeout(() => {
      document.body.classList.remove(className);

      if (afterClass) {
        document.body.classList.add(afterClass);
        setTimeout(() => document.body.classList.remove(afterClass), 1200);
      }
    }, duration);
  }

  function rollOpticalEvent() {
    const roll = Math.random();

    if (roll < 0.0006) triggerOpticalEvent("ov-hard-fault", 700, "ov-recovering");
    else if (roll < 0.002) triggerOpticalEvent("ov-calibration", 2800);
    else if (roll < 0.006) triggerOpticalEvent("ov-signal-drop", 1100);
    else if (roll < 0.014) triggerOpticalEvent("ov-focus-loss", 850);
    else if (roll < 0.028) triggerOpticalEvent("ov-slip", 220);
    else if (roll < 0.055) triggerOpticalEvent("ov-flare", 520);
  }

  setInterval(rollOpticalEvent, 1000);

  /* =========================================================
     RESIZE
  ========================================================= */

  let wasDesktop = isDesktop();

  window.addEventListener("resize", () => {
    const nowDesktop = isDesktop();

    if (nowDesktop === wasDesktop) return;

    wasDesktop = nowDesktop;
    mobileDrawer.innerHTML = "";
    clearCommandButtons();
    inspectorMode = "story";
    expandedStoryId = null;
    renderFeed();
  });

  /* =========================================================
     BOOT
  ========================================================= */

  renderFeed();
  loadStoriesFromSupabase();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startNightCityNews);
} else {
  startNightCityNews();
      }
/* =========================================================
   NCN PROJECTION ENGINE v1
   energy / depth / focus controller
========================================================= */

(function () {
  const root = document.documentElement;

  const ROLE_SETTINGS = {
    masthead: { energy: 88, depth: 150, focus: 1 },
    command: { energy: 72, depth: 130, focus: 0.96 },
    plate: { energy: 28, depth: 70, focus: 0.86 },
    story: { energy: 42, depth: 95, focus: 0.9 },
    headline: { energy: 86, depth: 135, focus: 1 },
    meta: { energy: 56, depth: 122, focus: 0.94 },
    body: { energy: 64, depth: 118, focus: 0.94 },
    rail: { energy: 70, depth: 120, focus: 1 },
    control: { energy: 62, depth: 138, focus: 0.96 }
  };

  let globalEnergyShift = 0;
  let depthInput = 0;
  let depthCurrent = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function register(el, role, offset = 0) {
    if (!el || el.dataset.projected === "true") return;

    const settings = ROLE_SETTINGS[role] || ROLE_SETTINGS.plate;

    el.dataset.projected = "true";
    el.dataset.role = role;
    el.dataset.energy = String(settings.energy + offset);
    el.dataset.targetEnergy = String(settings.energy + offset);
    el.dataset.depth = String(settings.depth);
    el.dataset.focus = String(settings.focus);

    el.style.setProperty("--energy", el.dataset.energy);
    el.style.setProperty("--depth", el.dataset.depth);
    el.style.setProperty("--focus", el.dataset.focus);
  }

  function registerAll() {
    register(document.querySelector(".masthead"), "masthead");
    register(document.querySelector(".command-bar"), "command");

    document.querySelectorAll(".feed, .inspector, .mobile-drawer, .filter-panels, .submit-form")
      .forEach(el => register(el, "plate"));

    document.querySelectorAll(".command-button, .filter-tab, .filter-option, .utility-btn, .time-option, .submit-form button")
      .forEach(el => register(el, "control"));

    document.querySelectorAll(".story").forEach((story, index) => {
      let priorityBoost = 0;

      if (story.classList.contains("story-priority-bulletin")) priorityBoost = -8;
      if (story.classList.contains("story-priority-advisory")) priorityBoost = -3;
      if (story.classList.contains("story-priority-alert")) priorityBoost = 3;
      if (story.classList.contains("story-priority-warning")) priorityBoost = 8;
      if (story.classList.contains("story-priority-emergency")) priorityBoost = 14;

      register(story, "story", priorityBoost + (index % 3) * 2);

      const rail = story.querySelector("::before");
      story.style.setProperty("--priority-energy", String(65 + priorityBoost));

      register(story.querySelector("h2"), "headline", priorityBoost * 0.3);
      register(story.querySelector(".meta"), "meta", priorityBoost * 0.2);
      register(story.querySelector(".story-detail"), "plate", 6);

      story.querySelectorAll(".story-detail p").forEach(p => register(p, "body"));
      story.querySelectorAll(".detail-grid, .detail-label").forEach(el => register(el, "meta"));
    });

    document.querySelectorAll(".inspector h2, .story-detail h2")
      .forEach(el => register(el, "headline"));

    document.querySelectorAll(".inspector p, .story-detail p")
      .forEach(el => register(el, "body"));

    document.querySelectorAll(".meta, .detail-label")
      .forEach(el => register(el, "meta"));
  }

  function updateElement(el, time) {
    const target = Number(el.dataset.targetEnergy || 50);
    const current = Number(el.dataset.energy || target);
    const focus = Number(el.dataset.focus || 1);
    const depth = Number(el.dataset.depth || 80);

    const role = el.dataset.role || "plate";

    const flicker =
      Math.sin(time * 0.0017 + depth) * 2.2 +
      Math.sin(time * 0.0041 + target) * 1.1 +
      (Math.random() - 0.5) * 0.7;

    const roleDrift = role === "headline" ? 3.2 :
                      role === "control" ? 2.4 :
                      role === "plate" ? 1.2 :
                      1.8;

    const desired = clamp(target + globalEnergyShift + flicker * roleDrift, 0, 100);
    const next = current + (desired - current) * 0.075;

    el.dataset.energy = String(next);

    el.style.setProperty("--energy", next.toFixed(2));
    el.style.setProperty("--depth", depth.toFixed(2));
    el.style.setProperty("--focus", focus.toFixed(2));
  }

  function engineTick(time) {
    registerAll();

    depthCurrent += (depthInput - depthCurrent) * 0.08;

    const idleDepth = Math.sin(time * 0.0008) * 8;
    const totalDepth = depthCurrent + idleDepth;
    const scale = 1 + Math.abs(totalDepth) * 0.0018;

    root.style.setProperty("--ov-engine-depth", `${totalDepth.toFixed(2)}px`);
    root.style.setProperty("--ov-engine-scale", scale.toFixed(4));

    document.querySelectorAll("[data-projected='true']").forEach(el => {
      updateElement(el, time);
    });

    globalEnergyShift *= 0.985;

    requestAnimationFrame(engineTick);
  }

  function surge(amount, duration = 650) {
    globalEnergyShift += amount;

    setTimeout(() => {
      globalEnergyShift -= amount * 0.65;
    }, duration);
  }

  function randomEvent() {
    const roll = Math.random();

    if (roll < 0.015) surge(18, 500);
    else if (roll < 0.03) surge(-16, 700);
  }

  setInterval(randomEvent, 1800);

  window.addEventListener("mousemove", event => {
    const y = (event.clientY / window.innerHeight - 0.5) * 34;
    depthInput = clamp(y, -24, 24);
  });

  window.addEventListener("touchmove", event => {
    const touch = event.touches[0];
    if (!touch) return;

    const y = (touch.clientY / window.innerHeight - 0.5) * 42;
    depthInput = clamp(y, -28, 28);
  }, { passive: true });

  window.addEventListener("touchend", () => {
    depthInput = 0;
  }, { passive: true });

  window.addEventListener("deviceorientation", event => {
    if (event.beta == null) return;

    const y = (event.beta - 45) * 0.55;
    depthInput = clamp(y, -28, 28);
  });

  requestAnimationFrame(engineTick);
})();
