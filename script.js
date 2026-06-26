      const SUPABASE_URL = "https://qfylqdpcbfyzijsgofjp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gTnZUIn-1ed99MSh1E3ryg__9V2ZxE6";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function startNightCityNews() {
  const storiesData = document.getElementById("stories-data");
  const feed = document.getElementById("feed");
  const inspector = document.getElementById("inspector");
  const mobileDrawer = document.getElementById("mobile-drawer");

  const showFiltersButton = document.getElementById("show-filters");
  const showSubmitButton = document.getElementById("show-submit");

  const filtersTemplate = document.getElementById("filters-template");
  const submitTemplate = document.getElementById("submit-template");

  if (!storiesData || !feed || !inspector || !mobileDrawer || !showFiltersButton || !showSubmitButton || !filtersTemplate || !submitTemplate) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      "<p style='color:red'>Night City News failed to find required HTML elements.</p>"
    );
    return;
  }

  let stories = JSON.parse(storiesData.textContent);
  let selectedStoryId = stories[0]?.id || null;
  let expandedStoryId = null;
  let inspectorMode = "story";
  let currentSearch = "";
  let currentTimeFilter = "Now";

  let selectedCategories = new Set(["Business", "Community", "Crime", "Infrastructure", "Politics", "Culture"]);
  let selectedAreas = new Set(["City Core", "Urban Sprawl", "Industrial Fringe", "Private Enclave", "Frontier Zone"]);
  let selectedPriorities = new Set(["Bulletin", "Advisory", "Alert", "Warning", "Emergency"]);
  let selectedSourceTypes = new Set(["Corporate", "Civic Notice", "Press Report", "Eyewitness", "Scanner Traffic", "Anonymous Leak", "Underground"]);

  function isDesktop() {
    return window.matchMedia("(min-width: 601px)").matches;
  }

  function priorityClass(priority) {
    return `priority-${String(priority).toLowerCase()}`;
  }

  function storyRailClass(story) {
    return `story-${priorityClass(story.priority)}`;
  }

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

  function getVisibleStories() {
    return stories.filter(storyMatchesFilters);
  }

  function getSelectedStory() {
    return stories.find(story => story.id === selectedStoryId);
  }

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

  function renderInspector() {
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

  function renderFeed() {
    const visibleStories = getVisibleStories();

    if (visibleStories.length && !visibleStories.some(story => story.id === selectedStoryId)) {
      selectedStoryId = visibleStories[0].id;
    }

    feed.innerHTML = "";

    if (!visibleStories.length) {
      feed.innerHTML = `<div class="empty">No transmissions found.</div>`;
      renderInspector();
      return;
    }

    visibleStories.forEach(story => {
      const article = document.createElement("article");
      article.className = `story ${storyRailClass(story)}`;

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
          selectedStoryId = story.id;
          inspectorMode = "story";
          clearCommandButtons();
        } else {
          expandedStoryId = expandedStoryId === story.id ? null : story.id;
        }

        renderFeed();
      });

      feed.appendChild(article);
    });

    renderInspector();
  }

  function clearCommandButtons() {
    showFiltersButton.classList.remove("active");
    showSubmitButton.classList.remove("active");
  }

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

  showFiltersButton.addEventListener("click", () => {
    const active = showFiltersButton.classList.contains("active");

    clearCommandButtons();

    if (active) {
      inspectorMode = "story";
      mobileDrawer.innerHTML = "";
      renderInspector();
      return;
    }

    showFiltersButton.classList.add("active");
    inspectorMode = "filters";

    if (isDesktop()) renderInspector();
    else {
      mobileDrawer.innerHTML = "";
      renderFiltersInto(mobileDrawer);
    }
  });

  showSubmitButton.addEventListener("click", () => {
    const active = showSubmitButton.classList.contains("active");

    clearCommandButtons();

    if (active) {
      inspectorMode = "story";
      mobileDrawer.innerHTML = "";
      renderInspector();
      return;
    }

    showSubmitButton.classList.add("active");
    inspectorMode = "submit";

    if (isDesktop()) renderInspector();
    else {
      mobileDrawer.innerHTML = "";
      renderSubmitInto(mobileDrawer);
    }
  });

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

  renderFeed();
  loadStoriesFromSupabase();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startNightCityNews);
} else {
  startNightCityNews();
}
/* =========================================================
   NCN LIVING OPTICAL SYSTEM
   paste near the end of script.js
========================================================= */

(function () {
  const root = document.documentElement;
  const body = document.body;

  let voltage = 0.35;
  let bloom = 0.16;
  let focus = 1;
  let drift = 0;

  function setVar(name, value) {
    root.style.setProperty(name, value);
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  // Slow voltage breathing
  setInterval(() => {
    voltage = randomBetween(0.08, 0.75);
    bloom = randomBetween(0.06, 0.28);
    focus = randomBetween(0.85, 1.15);

    setVar("--ncn-voltage", voltage.toFixed(2));
    setVar("--ncn-bloom", bloom.toFixed(2));
    setVar("--ncn-focus", focus.toFixed(2));
  }, randomBetween(5000, 12000));

  // Tiny horizontal hold drift
  setInterval(() => {
    drift = randomBetween(-1.2, 1.2);
    setVar("--ncn-drift", `${drift.toFixed(2)}px`);
  }, 900);

  // Occasional bad sync kick
  setInterval(() => {
    if (Math.random() < 0.32) {
      body.classList.add("ncn-bad-sync");
      setTimeout(() => body.classList.remove("ncn-bad-sync"), randomBetween(80, 240));
    }
  }, 7000);

  // Occasional white targeting snap
  setInterval(() => {
    if (Math.random() < 0.42) {
      body.classList.add("ncn-target-snap");
      setTimeout(() => body.classList.remove("ncn-target-snap"), randomBetween(90, 220));
    }
  }, 11000);

  // Amber data stutter
  setInterval(() => {
    if (Math.random() < 0.5) {
      body.classList.add("ncn-data-stutter");
      setTimeout(() => body.classList.remove("ncn-data-stutter"), randomBetween(120, 360));
    }
  }, 5000);

  // Optional phone tilt support
  function addSensorButton() {
    if (!window.DeviceOrientationEvent) return;

    const btn = document.createElement("button");
    btn.id = "ncnSensorButton";
    btn.textContent = "Enable Optics";
    document.body.appendChild(btn);

    btn.addEventListener("click", async () => {
      try {
        if (
          typeof DeviceOrientationEvent.requestPermission === "function"
        ) {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission !== "granted") return;
        }

        window.addEventListener("deviceorientation", handleOrientation);
        btn.textContent = "Optics Live";
        setTimeout(() => btn.remove(), 1600);
      } catch (err) {
        btn.textContent = "Optics Blocked";
      }
    });
  }

  let lastSensorUpdate = 0;

  function handleOrientation(event) {
    const now = Date.now();
    if (now - lastSensorUpdate < 100) return;
    lastSensorUpdate = now;

    const beta = event.beta || 0;   // front/back tilt
    const gamma = event.gamma || 0; // left/right tilt

    const roll = Math.max(-2.5, Math.min(2.5, gamma / 18));
    const pitch = Math.max(-2, Math.min(2, beta / 30));

    setVar("--ncn-roll", `${roll.toFixed(2)}deg`);
    setVar("--ncn-pitch", `${pitch.toFixed(2)}px`);
  }

  addSensorButton();
})();
