// Simple recipe app using localStorage

const STORAGE_KEY = "myRecipeApp.recipes.v1";

let recipes = [];
let activeRecipeId = null;
let activeTagFilter = null;

// DOM elements
const addRecipeBtn = document.getElementById("addRecipeBtn");
const recipeListEl = document.getElementById("recipeList");
const recipeDetailEl = document.getElementById("recipeDetail");
const emptyStateEl = document.getElementById("emptyState");
const searchInputEl = document.getElementById("searchInput");
const tagListEl = document.getElementById("tagList");

// Manual extra fields Cook Notes and Image
const manualNotesEl = document.getElementById("manualNotes");
const manualImageEl = document.getElementById("manualImage");

// URL extra fields Cook Notes and Image
const urlNotesEl = document.getElementById("urlNotes");

// Text extra fields Cook Notes and Image
const textNotesEl = document.getElementById("textNotes");

// Modal / tabs
const modalBackdropEl = document.getElementById("modalBackdrop");
const closeModalBtn = document.getElementById("closeModalBtn");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

// Forms
const manualForm = document.getElementById("manualForm");
const urlForm = document.getElementById("urlForm");
const textForm = document.getElementById("textForm");
const fileForm = document.getElementById("fileForm");

// Manual fields
const manualTitleEl = document.getElementById("manualTitle");
const manualSourceEl = document.getElementById("manualSource");
const manualTagsEl = document.getElementById("manualTags");
const manualIngredientsEl = document.getElementById("manualIngredients");
const manualInstructionsEl = document.getElementById("manualInstructions");

// URL fields
const urlInputEl = document.getElementById("urlInput");
const fetchUrlBtn = document.getElementById("fetchUrlBtn");
const urlTitleEl = document.getElementById("urlTitle");
const urlSourceEl = document.getElementById("urlSource");
const urlTagsEl = document.getElementById("urlTags");
const urlIngredientsEl = document.getElementById("urlIngredients");
const urlInstructionsEl = document.getElementById("urlInstructions");

// Text fields
const textTitleEl = document.getElementById("textTitle");
const textSourceEl = document.getElementById("textSource");
const textTagsEl = document.getElementById("textTags");
const textBodyEl = document.getElementById("textBody");

// File fields
const fileInputEl = document.getElementById("fileInput");

// Load & save helpers
function loadRecipes() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (e) {
    console.error("Error parsing recipes from localStorage", e);
    return [];
  }
}

function saveRecipes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
}

// Utility: generate ID
function generateId() {
  return "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Normalize tags from comma-separated string
function parseTags(tagString) {
  if (!tagString) return [];
  return tagString
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Try to automatically split a big block of text into
 * ingredients and instructions.
 *
 * Works in both English and Spanish, and falls back to a
 * simple heuristic when no explicit headings are found.
 */
function autoSplitRecipeText(text) {
  if (!text) return { ingredients: "", instructions: "" };

  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  const ingredientHeadingPatterns = [
    /^\s*ingredients?\s*[:]?$/i,
    /^\s*ingredientes?\s*[:]?$/i,
  ];

  const instructionHeadingPatterns = [
    /^\s*(instructions?|directions?|method|preparation)\s*[:]?$/i,
    /^\s*(preparación|preparacion|pasos?)\s*[:]?$/i,
  ];

  let ingStart = -1;
  let instStart = -1;

  // 1. Try explicit headings
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (ingStart === -1 && ingredientHeadingPatterns.some((r) => r.test(line))) {
      ingStart = i + 1; // content starts on next line
    }
    if (instructionHeadingPatterns.some((r) => r.test(line))) {
      instStart = i + 1;
    }
  }

  if (ingStart !== -1 && instStart !== -1) {
    const ingLines = lines.slice(ingStart, instStart - 1);
    const instLines = lines.slice(instStart);
    return {
      ingredients: ingLines.join("\n").trim(),
      instructions: instLines.join("\n").trim(),
    };
  }

  // 2. Heuristic: first block of "ingredient-looking" lines,
  // then everything else as instructions.
  const ingredientLines = [];
  const instructionLines = [];

  const measurementRegex =
    /\b(cup|cups|tbsp|tsp|teaspoon|tablespoon|gram|grams|g|kg|ml|l\b|oz|lb|lbs|taza|tazas|cucharada|cucharadita|gramos|litro|litros)\b/i;

  let mode = "maybeIngredients";

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) {
      ingredientLines.push("");
      instructionLines.push("");
      if (mode === "maybeIngredients") {
        mode = "maybeInstructions";
      }
      continue;
    }

    const looksLikeIngredient =
      /^[-*•\d]/.test(line) || measurementRegex.test(line);

    if (looksLikeIngredient && mode !== "instructions") {
      ingredientLines.push(raw);
    } else {
      mode = "instructions";
      instructionLines.push(raw);
    }
  }

  const ingredients = ingredientLines.join("\n").trim();
  const instructions = instructionLines.join("\n").trim();

  // If nothing useful detected, return empty to avoid weird splits.
  if (!ingredients && !instructions) {
    return { ingredients: "", instructions: "" };
  }

  return { ingredients, instructions };
}

// Render functions
function render() {
  renderRecipeList();
  renderTagList();
  renderDetail();
}

function renderRecipeList() {
  const query = searchInputEl.value.trim().toLowerCase();
  const filtered = recipes.filter((r) => {
    const matchesTag =
      !activeTagFilter || (r.tags && r.tags.includes(activeTagFilter));

    if (!matchesTag) return false;

    if (!query) return true;

    const haystack =
      (r.title || "") +
      " " +
      (r.ingredientsText || "") +
      " " +
      (r.instructionsText || "") +
      " " +
      (r.cookNotesText || "") +
      " " +
      (r.body || "");
    return haystack.toLowerCase().includes(query);
  });

  recipeListEl.innerHTML = "";

  if (filtered.length === 0) {
    emptyStateEl.classList.remove("hidden");
  } else {
    emptyStateEl.classList.add("hidden");
  }

  filtered
    .slice()
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
    .forEach((recipe) => {
      const card = document.createElement("div");
      card.className = "recipe-card";
      card.dataset.id = recipe.id;

      const titleEl = document.createElement("div");
      titleEl.className = "recipe-card-title";
      titleEl.textContent = recipe.title || "(Untitled recipe)";

      const metaEl = document.createElement("div");
      metaEl.className = "recipe-card-meta";
      const sourcePart = recipe.source ? `Source: ${recipe.source} · ` : "";
      const date = new Date(recipe.updatedAt || recipe.createdAt);
      metaEl.textContent =
        sourcePart +
        `Saved: ${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`;

      const tagsEl = document.createElement("div");
      tagsEl.className = "recipe-card-tags";
      (recipe.tags || []).forEach((tag) => {
        const span = document.createElement("span");
        span.className = "recipe-card-tag";
        span.textContent = tag;
        tagsEl.appendChild(span);
      });

      card.appendChild(titleEl);
      card.appendChild(metaEl);
      if ((recipe.tags || []).length > 0) {
        card.appendChild(tagsEl);
      }

      card.addEventListener("click", () => {
        activeRecipeId = recipe.id;
        renderDetail();
      });

      recipeListEl.appendChild(card);
    });
}

function renderTagList() {
  const allTags = new Set();
  recipes.forEach((r) => (r.tags || []).forEach((t) => allTags.add(t)));

  tagListEl.innerHTML = "";
  if (allTags.size === 0) return;

  // "All" filter
  const allBtn = document.createElement("button");
  allBtn.className = "tag-pill" + (activeTagFilter ? "" : " active");
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => {
    activeTagFilter = null;
    render();
  });
  tagListEl.appendChild(allBtn);

  Array.from(allTags)
    .sort()
    .forEach((tag) => {
      const btn = document.createElement("button");
      btn.className =
        "tag-pill" + (activeTagFilter === tag ? " active" : "");
      btn.textContent = tag;
      btn.addEventListener("click", () => {
        activeTagFilter = activeTagFilter === tag ? null : tag;
        render();
      });
      tagListEl.appendChild(btn);
    });
}

function renderDetail() {
  if (!activeRecipeId) {
    recipeDetailEl.classList.add("hidden");
    recipeDetailEl.innerHTML = "";
    return;
  }

  const recipe = recipes.find((r) => r.id === activeRecipeId);
  if (!recipe) {
    recipeDetailEl.classList.add("hidden");
    recipeDetailEl.innerHTML = "";
    return;
  }

  recipeDetailEl.classList.remove("hidden");
  recipeDetailEl.innerHTML = "";

  const header = document.createElement("header");

  const titleBlock = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = recipe.title || "(Untitled recipe)";
  titleBlock.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "recipe-detail-meta";
  const lines = [];
  if (recipe.source) lines.push(`Source: ${recipe.source}`);
  const date = new Date(recipe.updatedAt || recipe.createdAt);
  lines.push(
    `Saved: ${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`
  );
  meta.textContent = lines.join(" · ");
  titleBlock.appendChild(meta);

  const tagsDiv = document.createElement("div");
  tagsDiv.className = "recipe-detail-tags";
  (recipe.tags || []).forEach((tag) => {
    const span = document.createElement("span");
    span.className = "recipe-card-tag";
    span.textContent = tag;
    tagsDiv.appendChild(span);
  });
  if ((recipe.tags || []).length > 0) {
    titleBlock.appendChild(tagsDiv);
  }

  const actions = document.createElement("div");
  actions.className = "recipe-actions";
  const editBtn = document.createElement("button");
  editBtn.className = "secondary-btn";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => {
    openModal("manualTab", recipe);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "danger-btn";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    if (confirm("Delete this recipe?")) {
      recipes = recipes.filter((r) => r.id !== recipe.id);
      if (activeRecipeId === recipe.id) activeRecipeId = null;
      saveRecipes();
      render();
    }
  });

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  header.appendChild(titleBlock);
  header.appendChild(actions);

  recipeDetailEl.appendChild(header);

// Image (if any)
if (recipe.image) {
  const img = document.createElement("img");
  img.className = "recipe-image";
  img.src = recipe.image;
  img.alt = recipe.title || "Recipe photo";
  recipeDetailEl.appendChild(img);
}

// Cook notes (if any)
if (recipe.cookNotesText) {
  const notesSection = document.createElement("section");
  notesSection.className = "recipe-detail-section";
  const h3 = document.createElement("h3");
  h3.textContent = "Cook notes";
  const pre = document.createElement("pre");
  pre.textContent = recipe.cookNotesText;
  notesSection.appendChild(h3);
  notesSection.appendChild(pre);
  recipeDetailEl.appendChild(notesSection);
}

  // Ingredients/instructions/body sections
  if (recipe.ingredientsText) {
    const section = document.createElement("section");
    section.className = "recipe-detail-section";
    const h3 = document.createElement("h3");
    h3.textContent = "Ingredients";
    const pre = document.createElement("pre");
    pre.textContent = recipe.ingredientsText;
    section.appendChild(h3);
    section.appendChild(pre);
    recipeDetailEl.appendChild(section);
  }

  if (recipe.instructionsText) {
    const section = document.createElement("section");
    section.className = "recipe-detail-section";
    const h3 = document.createElement("h3");
    h3.textContent = "Instructions";
    const pre = document.createElement("pre");
    pre.textContent = recipe.instructionsText;
    section.appendChild(h3);
    section.appendChild(pre);
    recipeDetailEl.appendChild(section);
  }

  if (recipe.body && !recipe.ingredientsText && !recipe.instructionsText) {
    const section = document.createElement("section");
    section.className = "recipe-detail-section";
    const h3 = document.createElement("h3");
    h3.textContent = "Recipe";
    const pre = document.createElement("pre");
    pre.textContent = recipe.body;
    section.appendChild(h3);
    section.appendChild(pre);
    recipeDetailEl.appendChild(section);
  }
}

// Modal helpers
function openModal(tabId = "manualTab", recipeToEdit = null) {
  modalBackdropEl.classList.remove("hidden");

  // Clear all forms
  manualForm.reset();
  urlForm.reset();
  textForm.reset();
  fileForm.reset();
  fileInputEl.value = "";

  // If editing, prefill manual form
  if (recipeToEdit) {
    document.getElementById("modalTitle").textContent = "Edit Recipe (Manual)";
    manualTitleEl.value = recipeToEdit.title || "";
    manualSourceEl.value = recipeToEdit.source || "";
    manualTagsEl.value = (recipeToEdit.tags || []).join(", ");
    manualIngredientsEl.value =
      recipeToEdit.ingredientsText || recipeToEdit.body || "";
    manualInstructionsEl.value = recipeToEdit.instructionsText || "";
    manualForm.dataset.editId = recipeToEdit.id;
    manualNotesEl.value = recipeToEdit.cookNotesText || "";
    if (manualImageEl) {
      manualImageEl.value = ""; // clear file input (browsers don't allow preset)
    }
  } else {
    document.getElementById("modalTitle").textContent = "Add / Import Recipe";
    delete manualForm.dataset.editId;
  }

  // Activate tab
  setActiveTab(tabId);
}

function closeModal() {
  modalBackdropEl.classList.add("hidden");
}

function setActiveTab(tabId) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  tabContents.forEach((tab) => {
    tab.classList.toggle("active", tab.id === tabId);
  });
}

// URL fetch logic (best effort)
async function handleFetchUrl() {
  const url = urlInputEl.value.trim();
  if (!url) return alert("Please enter a URL.");

  try {
    urlTitleEl.value = "";
    urlSourceEl.value = "";
    urlTagsEl.value = "";
    urlIngredientsEl.value = "";
    urlInstructionsEl.value = "";

    const response = await fetch(url);
    if (!response.ok) throw new Error("Network response not ok");
    const html = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Try document title as a fallback
    const docTitle = doc.querySelector("title");
    if (docTitle && !urlTitleEl.value) {
      urlTitleEl.value = docTitle.textContent.trim();
    }

    // Try to find JSON-LD with @type Recipe
    const ldScripts = Array.from(
      doc.querySelectorAll('script[type="application/ld+json"]')
    );

    let recipeData = null;
    for (const script of ldScripts) {
      try {
        const json = JSON.parse(script.textContent);
        if (Array.isArray(json)) {
          const found = json.find(
            (item) =>
              item &&
              (item["@type"] === "Recipe" ||
                (Array.isArray(item["@type"]) &&
                  item["@type"].includes("Recipe")))
          );
          if (found) {
            recipeData = found;
            break;
          }
        } else if (
          json &&
          (json["@type"] === "Recipe" ||
            (Array.isArray(json["@type"]) &&
              json["@type"].includes("Recipe")))
        ) {
          recipeData = json;
          break;
        }
      } catch (e) {
        // ignore
      }
    }

    if (!recipeData) {
      alert(
        "Could not find structured recipe data on this page. You can still copy/paste into the Text tab."
      );
      return;
    }

    // Fill fields
    if (recipeData.name) urlTitleEl.value = recipeData.name;
    urlSourceEl.value = new URL(url).hostname.replace(/^www\./, "");

    // Ingredients can be string[] or something else
    if (Array.isArray(recipeData.recipeIngredient)) {
      urlIngredientsEl.value = recipeData.recipeIngredient.join("\n");
    }

    // Instructions can be string or array
    if (typeof recipeData.recipeInstructions === "string") {
      urlInstructionsEl.value = recipeData.recipeInstructions;
    } else if (Array.isArray(recipeData.recipeInstructions)) {
      const steps = [];
      recipeData.recipeInstructions.forEach((step) => {
        if (typeof step === "string") {
          steps.push(step);
        } else if (step && step.text) {
          steps.push(step.text);
        }
      });
      urlInstructionsEl.value = steps.join("\n");
    }

    alert("Recipe data fetched. You can edit it before saving.");
  } catch (err) {
    console.error(err);
    alert(
      "Could not fetch or parse the recipe. Some sites block this. Try copy/paste into the Text tab instead."
    );
  }
}

// Event listeners

addRecipeBtn.addEventListener("click", () => openModal("manualTab"));
closeModalBtn.addEventListener("click", closeModal);

modalBackdropEl.addEventListener("click", (e) => {
  if (e.target === modalBackdropEl) closeModal();
});

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveTab(btn.dataset.tab);
  });
});

searchInputEl.addEventListener("input", () => {
  renderRecipeList();
});

// Manual form submit
manualForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = manualTitleEl.value.trim();
  const source = manualSourceEl.value.trim();
  const tags = parseTags(manualTagsEl.value);
  const ingredientsText = manualIngredientsEl.value.trim();
  const instructionsText = manualInstructionsEl.value.trim();
  const cookNotesText = manualNotesEl.value.trim();
  const now = Date.now();
  const editId = manualForm.dataset.editId;
  const file = manualImageEl && manualImageEl.files[0];

  const saveWithImage = (imageValue) => {
    if (editId) {
      // Update existing
      const idx = recipes.findIndex((r) => r.id === editId);
      if (idx >= 0) {
        const existing = recipes[idx];
        recipes[idx] = {
          ...existing,
          title,
          source,
          tags,
          ingredientsText,
          instructionsText,
          cookNotesText,
          image: imageValue !== null ? imageValue : existing.image || "",
          updatedAt: now,
        };
        activeRecipeId = editId;
      }
    } else {
      const newRecipe = {
        id: generateId(),
        title: title || "(Untitled recipe)",
        source: source || "",
        tags,
        ingredientsText,
        instructionsText,
        cookNotesText,
        image: imageValue || "",
        body: "", // not used here
        createdAt: now,
        updatedAt: now,
      };
      recipes.push(newRecipe);
      activeRecipeId = newRecipe.id;
    }

    saveRecipes();
    render();
    closeModal();
  };

  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result; // base64 image
      saveWithImage(dataUrl);
    };
    reader.onerror = () => {
      console.error("Error reading image file");
      // fallback: save without changing/adding image
      saveWithImage(null);
    };
    reader.readAsDataURL(file);
  } else {
    // No new image selected: keep existing if editing
    saveWithImage(null);
  }
});


// URL fetch button
fetchUrlBtn.addEventListener("click", () => {
  handleFetchUrl();
});

// URL form submit
urlForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = urlInputEl.value.trim();
  const title = urlTitleEl.value.trim() || "(Untitled recipe)";
  const source = urlSourceEl.value.trim() || (url ? new URL(url).hostname : "");
  const tags = parseTags(urlTagsEl.value);
  const ingredientsText = urlIngredientsEl.value.trim();
  const instructionsText = urlInstructionsEl.value.trim();
  const cookNotesText = urlNotesEl.value.trim();
  const now = Date.now();

  const newRecipe = {
    id: generateId(),
    title,
    source,
    tags,
    ingredientsText,
    instructionsText,
    cookNotesText,
    image: "", // you can add an image later by editing
    body: "",
    createdAt: now,
    updatedAt: now,
  };
  recipes.push(newRecipe);
  activeRecipeId = newRecipe.id;
  saveRecipes();
  render();
  closeModal();
});

// Text form submit (pasted recipes: Instagram, TikTok, Notes, etc.)
textForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = textTitleEl.value.trim() || "(Untitled pasted recipe)";
  const source = textSourceEl.value.trim();
  const tags = parseTags(textTagsEl.value);
  const body = textBodyEl.value.trim();
  const cookNotesText = textNotesEl.value.trim();
  if (!body) {
    alert("Please paste some text.");
    return;
  }
  const now = Date.now();

  const { ingredients, instructions } = autoSplitRecipeText(body);

  const newRecipe = {
    id: generateId(),
    title,
    source,
    tags,
    ingredientsText: ingredients,
    instructionsText: instructions,
    cookNotesText,
    image: "", // you can add a photo later by editing
    body, // keep original text as backup
    createdAt: now,
    updatedAt: now,
  };

  recipes.push(newRecipe);
  activeRecipeId = newRecipe.id;
  saveRecipes();
  render();
  closeModal();
});

// File form submit
fileForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const files = Array.from(fileInputEl.files || []);
  if (files.length === 0) {
    alert("Please select one or more files.");
    return;
  }

  const now = Date.now();
  let pending = files.length;
  let lastNewRecipeId = null;

  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const body = String(reader.result || "");
      const title = file.name.replace(/\.[^.]+$/, "") || "(Untitled file)";

      // We can also try auto-split for text files
      const { ingredients, instructions } = autoSplitRecipeText(body);

      const newRecipe = {
        id: generateId(),
        title,
        source: "Imported text file",
        tags: [],
        ingredientsText: ingredients,
        instructionsText: instructions,
        cookNotesText: "",
        image: "",
        body,
        createdAt: now,
        updatedAt: now,
      };
      recipes.push(newRecipe);
      lastNewRecipeId = newRecipe.id;
      pending -= 1;
      if (pending === 0) {
        if (lastNewRecipeId) activeRecipeId = lastNewRecipeId;
        saveRecipes();
        render();
        closeModal();
      }
    };
    reader.onerror = () => {
      console.error("Error reading file", file.name);
      pending -= 1;
      if (pending === 0) {
        saveRecipes();
        render();
        closeModal();
      }
    };
    reader.readAsText(file);
  });
});

// Init
recipes = loadRecipes();
render();