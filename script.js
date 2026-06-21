function startNightCityNews() {
  const storiesData = document.getElementById("stories-data");
  const feed = document.getElementById("feed");
  const inspector = document.getElementById("inspector");
  const mobileDrawer = document.getElementById("mobile-drawer");

  const showFiltersButton = document.getElementById("show-filters");
  const showSubmitButton = document.getElementById("show-submit");

  const filtersTemplate = document.getElementById("filters-template");
  const submitTemplate = document.getElementById("submit-template");

  if (!storiesData || !feed || !inspector || !mobileDrawer || !showFiltersButton || !showSubmitButton) {
    document.body.insertAdjacentHTML("afterbegin", "<p style='color:red'>Night City News failed to find required HTML elements.</p>");
    return;
  }

  let stories = JSON.parse(storiesData.textContent);

  let selectedStoryId = stories[0]?.id || null;
  let expandedStoryId = null;
  let inspectorMode = "story";
  let currentSearch = "";
  let currentTimeFilter = "Now";

  let selectedCategories = new Set(["Corporate", "Gang", "Crime", "Politics", "Infrastructure"]);
  let selectedAreas = new Set(["Citywide", "Downtown", "Waterfront", "University", "Combat Zone"]);
  let selectedPriorities = new Set(["Critical", "Major", "Significant", "Noteworthy", "Routine"]);
  let selectedSourceTypes = new Set(["Broadcast", "Community Bulletin", "Corporate Release", "Anonymous Leak", "Police Scanner", "Pirate Broadcast", "Witness Report", "Rumour", "Public Notice"]);

  function isDesktop() {
    return window.matchMedia("(min-width: 901px)").matches;
  }

  function priorityClass(priority) {
    return `priority-${priority.toLowerCase()}`;
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
    ) return false;

    const searchable = `${story.headline} ${story.body} ${story.category} ${story.area} ${story.priority} ${story.source} ${story.sourceType}`.toLowerCase();

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

    inspector.innerHTML = renderStoryDetail(getSelectedStory());
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
      article.className = "story";

      if (story.id === selectedStoryId) article.classList.add("selected");
      if (!isDesktop() && story.id === expandedStoryId) article.classList.add("open");

      article.innerHTML = `
        <div class="story-header">
          <div class="story-topline">
            <span class="story-time">${story.time}</span>
            <span class="priority-badge ${priorityClass(story.priority)}">${story.priority}</span>
          </div>

          <h2>${story.headline}</h2>

          <div class="meta">
            ${story.category} • ${story.area} • ${story.source}
          </div>
        </div>

        <div class="story-detail">
          ${renderStoryDetail(story)}
        </div>
      `;

      article.querySelector(".story-header").addEventListener("click", () => {
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

    searchInput.value = currentSearch;

    const sets = {
      category: selectedCategories,
      area: selectedAreas,
      priority: selectedPriorities,
      sourceType: selectedSourceTypes
    };

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
        if (isDesktop()) renderFiltersInto(inspector);
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
        if (isDesktop()) renderFiltersInto(inspector);
      });
    });

    timeButtons.forEach(button => {
      button.addEventListener("click", () => {
        currentTimeFilter = button.dataset.time;
        renderFeed();
        if (isDesktop()) renderFiltersInto(inspector);
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

  window.addEventListener("resize", () => {
    mobileDrawer.innerHTML = "";
    clearCommandButtons();
    inspectorMode = "story";
    expandedStoryId = null;
    renderFeed();
  });

  renderFeed();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startNightCityNews);
} else {
  startNightCityNews();
}