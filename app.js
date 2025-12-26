// Simple recipe app BASE64 img - .8.7.2

// Firebase app is initialized (defensive)
if (!firebase.apps || firebase.apps.length === 0) {
  // SAME config used in index.html
  const firebaseConfig = {
      apiKey: "AIzaSyCst_sQ3u3K3B6Hz5xS2kIQrQrUVQTKuy4",
      authDomain: "recetas-chateau.firebaseapp.com",
      projectId: "recetas-chateau",
      storageBucket: "recetas-chateau.appspot.com",
      messagingSenderId: "789269570020",
      appId: "1:789269570020:web:fc4b9a3ef8458b8f81e7f1",
      measurementId: "G-VFS2QTV4T9"
  };

  firebase.initializeApp(firebaseConfig);
}

// Firebase handles
const auth = firebase.auth();
const db = firebase.firestore();
// const storage = firebase.storage(); // not using firebase storage for now

let recipes = [];
let activeRecipeId = null;
let activeTagFilter = null;
let currentUser = null;

// Auth elements - Firebase
const authEmailEl = document.getElementById("authEmail");
const authPasswordEl = document.getElementById("authPassword");
const authLoginBtn = document.getElementById("authLoginBtn");
const authRegisterBtn = document.getElementById("authRegisterBtn");
const authLogoutBtn = document.getElementById("authLogoutBtn");
const authLoggedOutEl = document.getElementById("authLoggedOut");
const authLoggedInEl = document.getElementById("authLoggedIn");
const authUserEmailEl = document.getElementById("authUserEmail");

// Auth logic - Firebase
authLoginBtn.addEventListener("click", async () => {
  const email = authEmailEl.value.trim();
  const password = authPasswordEl.value.trim();
  if (!email || !password) {
    alert("Enter email and password");
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    alert("Login error: " + err.message);
  }
});

authRegisterBtn.addEventListener("click", async () => {
  const email = authEmailEl.value.trim();
  const password = authPasswordEl.value.trim();
  if (!email || !password) {
    alert("Enter email and password");
    return;
  }
  try {
    await auth.createUserWithEmailAndPassword(email, password);
    alert("Account created, you are logged in.");
  } catch (err) {
    alert("Register error: " + err.message);
  }
});

authLogoutBtn.addEventListener("click", async () => {
  await auth.signOut();
});

// clear highlighted recipe card
function clearActiveRecipeCard() {
  document
    .querySelectorAll(".recipe-card.active")
    .forEach(card => card.classList.remove("active"));
}

// Handle auth state changes - Firebase
auth.onAuthStateChanged(async (user) => {
  if (userDropdown) userDropdown.classList.add("hidden"); // Reset UI on state change

  if (user) {
    currentUser = user;
    authLoggedOutEl.classList.add("hidden");
    authLoggedInEl.classList.remove("hidden");
    authUserEmailEl.textContent = user.email || "(no email)";
    // Add admin helpers in user menu
    ensureDedupeButtonInUserMenu();
    // Load this user's recipes
    await loadRecipesFromCloud();
  } else {
    currentUser = null;
    authLoggedOutEl.classList.remove("hidden");
    authLoggedInEl.classList.add("hidden");
    authUserEmailEl.textContent = "";
    recipes = [];
    activeRecipeId = null;
    render();
  }
});

// DOM elements
const addRecipeBtn = document.getElementById("addRecipeBtn");
const recipeListEl = document.getElementById("recipeList");
const recipeDetailEl = document.getElementById("recipeDetail");
const emptyStateEl = document.getElementById("emptyState");
const searchInputEl = document.getElementById("searchInput");
const tagListEl = document.getElementById("tagList");

// user button
const userMenuBtn = document.getElementById("userMenuBtn");
const userDropdown = document.getElementById("userDropdown");

// user button toggle logic
userMenuBtn.addEventListener("click", (e) => {
  e.stopPropagation(); 
  userDropdown.classList.toggle("hidden");
});

// Improved Click-Outside Logic for Desktop & Mobile "new click outside"
document.addEventListener("click", (e) => {
  const isClickInside = userMenuBtn.contains(e.target) || userDropdown.contains(e.target);
  
  if (!isClickInside) {
    userDropdown.classList.add("hidden");
  }
});

// "Go up" button (mobile helper)
const goUpBtnEl = document.getElementById("goUpBtn");

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

// Normalize tags from comma-separated string
function parseTags(tagString) {
  if (!tagString) return [];
  return tagString
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

// --- Duplicate prevention helpers (fingerprint) ---
function normalizeForFingerprint(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

// Stable fingerprint for “same recipe content”
function recipeFingerprint(recipe) {
  const title = normalizeForFingerprint(recipe.title);
  const source = normalizeForFingerprint(recipe.source);
  const ing = normalizeForFingerprint(recipe.ingredientsText);
  const inst = normalizeForFingerprint(recipe.instructionsText);
  const notes = normalizeForFingerprint(recipe.cookNotesText);
  return [title, source, ing, inst, notes].join("||");
}

function buildLocalFingerprintIndex() {
  const map = new Map(); // fp -> recipeId
  (recipes || []).forEach((r) => {
    if (!r) return;
    const fp = r.fingerprint || recipeFingerprint(r);
    // Keep the first occurrence (we only need existence)
    if (fp && !map.has(fp) && r.id) map.set(fp, r.id);
  });
  return map;
}

async function findExistingRecipeIdByFingerprint(fp, excludeId = null) {
  if (!currentUser || !fp) return null;

  // 1) Fast local check
  const localIndex = buildLocalFingerprintIndex();
  const localId = localIndex.get(fp);
  if (localId && localId !== excludeId) return localId;

  // 2) Authoritative Firestore check (cross-device)
  try {
    const colRef = db
      .collection("users")
      .doc(currentUser.uid)
      .collection("recipes");

    const snap = await colRef.where("fingerprint", "==", fp).limit(3).get();
    if (!snap.empty) {
      const doc = snap.docs.find((d) => d.id !== excludeId) || snap.docs[0];
      return doc ? doc.id : null;
    }
  } catch (e) {
    console.warn("Fingerprint lookup failed:", e);
  }
  return null;
}

// One-time cloud dedupe: groups by fingerprint, keeps newest, deletes the rest
async function dedupeRecipesInCloud({ dryRun = true } = {}) {
  if (!currentUser) {
    alert("Please log in first.");
    return { groups: 0, toDelete: 0 };
  }

  const col = db
    .collection("users")
    .doc(currentUser.uid)
    .collection("recipes");

  const snap = await col.get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const groups = new Map(); // fp -> array of docs
  for (const r of docs) {
    const fp = r.fingerprint || recipeFingerprint(r);
    if (!fp) continue;
    if (!groups.has(fp)) groups.set(fp, []);
    groups.get(fp).push({ ...r, fingerprint: fp });
  }

  const dupGroups = Array.from(groups.entries()).filter(([, arr]) => arr.length > 1);

  const totalToDelete = dupGroups.reduce((sum, [, arr]) => sum + (arr.length - 1), 0);

  if (dryRun) {
    console.log("Dedupe dry run — duplicate groups:", dupGroups.length);
    dupGroups.slice(0, 25).forEach(([fp, arr], i) => {
      const title = arr[0]?.title || "(untitled)";
      console.log(`Group #${i + 1} (${arr.length} items)`, { title, ids: arr.map((x) => x.id) });
    });
    return { groups: dupGroups.length, toDelete: totalToDelete };
  }

  // Firestore batch limit is 500 ops. We chunk commits.
  let deleted = 0;
  let updated = 0;

  let batch = db.batch();
  let ops = 0;

  const commitIfNeeded = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  for (const [fp, arr] of dupGroups) {
    // keep newest by updatedAt/createdAt
    arr.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    const keep = arr[0];
    const remove = arr.slice(1);

    // Ensure kept doc has fingerprint set
    batch.set(col.doc(keep.id), { fingerprint: fp }, { merge: true });
    ops++; updated++;

    for (const r of remove) {
      batch.delete(col.doc(r.id));
      ops++; deleted++;

      if (ops >= 450) {
        await commitIfNeeded();
      }
    }

    if (ops >= 450) {
      await commitIfNeeded();
    }
  }

  await commitIfNeeded();
  return { groups: dupGroups.length, toDelete: totalToDelete, deleted, updated };
}

// Add a "Dedupe duplicates" button inside the user menu dropdown
function ensureDedupeButtonInUserMenu() {
  if (!userDropdown) return;

  // Avoid adding it multiple times
  if (document.getElementById("dedupeRecipesBtn")) return;

  const btn = document.createElement("button");
  btn.id = "dedupeRecipesBtn";
  btn.className = "secondary-btn";
  btn.style.marginTop = "0.25rem";
  btn.textContent = "Dedupe duplicates";

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!currentUser) return alert("Please log in first.");

    btn.disabled = true;
    btn.textContent = "Scanning…";

    try {
      const scan = await dedupeRecipesInCloud({ dryRun: true });

      if (!scan.groups || !scan.toDelete) {
        alert("No duplicates found ✅");
        return;
      }

      const ok = confirm(
        `Found ${scan.groups} duplicate group(s) with ${scan.toDelete} duplicate recipe(s) to delete.\n\n` +
        `This will KEEP the newest recipe in each group and DELETE the rest.\n\nProceed?`
      );

      if (!ok) return;

      btn.textContent = "Deduping…";
      const result = await dedupeRecipesInCloud({ dryRun: false });

      alert(
        `Done ✅\n\nDeleted: ${result.deleted}\nUpdated kept recipes: ${result.updated}\nGroups: ${result.groups}`
      );

      await loadRecipesFromCloud(); // refresh from source of truth
    } catch (err) {
      console.error(err);
      alert("Dedupe error: " + (err.message || err));
    } finally {
      btn.disabled = false;
      btn.textContent = "Dedupe duplicates";
    }
  });

  // Put it above the Log out button
  const logoutBtn = userDropdown.querySelector("#authLogoutBtn");
  if (logoutBtn && logoutBtn.parentNode === userDropdown) {
    userDropdown.insertBefore(btn, logoutBtn);
  } else {
    userDropdown.appendChild(btn);
  }
}

// Utility: generate ID
function generateId() {
  return "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Cloud Load & Save helpers
async function loadRecipesFromCloud() {
  if (!currentUser) return;
  const snap = await db
    .collection("users")
    .doc(currentUser.uid)
    .collection("recipes")
    .orderBy("updatedAt", "desc")
    .get();

  recipes = snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  // Firestore stores timestamps as objects; convert if needed
  recipes.forEach((r) => {
    if (r.createdAt && r.createdAt.toMillis) {
      r.createdAt = r.createdAt.toMillis();
    }
    if (r.updatedAt && r.updatedAt.toMillis) {
      r.updatedAt = r.updatedAt.toMillis();
    }
  });

  // Ensure fingerprint exists in-memory for quick duplicate checks
  recipes.forEach((r) => {
    if (r && !r.fingerprint) r.fingerprint = recipeFingerprint(r);
  });

  // On mobile (or narrow screens), start with list only (no auto-open detail)
if (!activeRecipeId && recipes.length > 0) {
  if (window.innerWidth > 900) {
    activeRecipeId = recipes[0].id; // desktop default
  } else {
    activeRecipeId = null; // mobile: keep closed
  }
}

  render();
}

async function saveRecipeToCloud(recipe) {
  if (!currentUser) {
    alert("Please log in first.");
    throw new Error("No user");
  }

  const colRef = db
    .collection("users")
    .doc(currentUser.uid)
    .collection("recipes");

  const dataToSave = { ...recipe };
  delete dataToSave.id; // Firestore doc id is separate

  if (recipe.id) {
    await colRef.doc(recipe.id).set(dataToSave, { merge: true });
  } else {
    const docRef = await colRef.add(dataToSave);
    recipe.id = docRef.id;
  }
}

async function deleteRecipeFromCloud(recipeId) {
  if (!currentUser) return;
  const docRef = db
    .collection("users")
    .doc(currentUser.uid)
    .collection("recipes")
    .doc(recipeId);

  await docRef.delete();
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

/**
 * Resize and compress an image file before saving.
 * Returns a Promise that resolves to a base64 data URL.
 *
 * @param {File} file - the uploaded image
 * @param {number} maxWidth - target max width (default 800px)
 * @param {number} quality - JPEG compression (0–1)
 */
function resizeImageFile(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const ratio = img.width / img.height;
        if (img.width > maxWidth) {
          canvas.width = maxWidth;
          canvas.height = maxWidth / ratio;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Convert to JPEG base64
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };

      img.onerror = () => reject(new Error("Error loading image"));
      img.src = event.target.result;
    };

    reader.onerror = () => reject(new Error("Error reading file"));
    reader.readAsDataURL(file);
  });
}

// --- Go up button helpers ---
function getActiveScrollTarget() {
  // On mobile, when the detail sheet is open, the recipe panel scrolls.
  if (
    window.innerWidth <= 900 &&
    recipeDetailEl &&
    recipeDetailEl.classList.contains("sheet-open") &&
    !recipeDetailEl.classList.contains("hidden")
  ) {
    return recipeDetailEl;
  }
  return window;
}

function getScrollTop(target) {
  if (target === window) {
    return (
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0
    );
  }
  return target.scrollTop || 0;
}

function updateGoUpVisibility() {
  if (!goUpBtnEl) return;
  const target = getActiveScrollTarget();
  const scrollTop = getScrollTop(target);
  const threshold = target === window ? window.innerHeight : target.clientHeight;

  goUpBtnEl.classList.toggle("hidden", scrollTop <= threshold);
}

function scrollToTop() {
  const target = getActiveScrollTarget();
  if (target === window) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    target.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// Render functions
function render() {
  renderRecipeList();
  renderTagList();
  renderDetail();
  updateGoUpVisibility();
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

      // highlight the selected recipe
      if (recipe.id === activeRecipeId) card.classList.add("active");

      const titleEl = document.createElement("div");
      titleEl.className = "recipe-card-title";
      titleEl.textContent = recipe.title || "(Untitled recipe)";

      const metaEl = document.createElement("div");
      metaEl.className = "recipe-card-meta";
      // Only show source (no saved date/time)
      if (recipe.source) {
        metaEl.textContent = `Source: ${recipe.source}`;
      }

      const tagsEl = document.createElement("div");
      tagsEl.className = "recipe-card-tags";
      (recipe.tags || []).forEach((tag) => {
        const span = document.createElement("span");
        span.className = "recipe-card-tag";
        span.textContent = tag;
        tagsEl.appendChild(span);
      });

      card.appendChild(titleEl);
      if (recipe.source) card.appendChild(metaEl);
      if ((recipe.tags || []).length > 0) {
        card.appendChild(tagsEl);
      }

      card.addEventListener("click", () => {
        clearActiveRecipeCard();          // recipe list active state
        card.classList.add("active");     // recipe list active state
        activeRecipeId = recipe.id;
        render();
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
    recipeDetailEl.classList.remove("sheet-open"); // NEW U/X
    document.body.classList.remove("detail-open"); // NEW U/X
    recipeDetailEl.innerHTML = "";
    return;
  }

  const recipe = recipes.find((r) => r.id === activeRecipeId);
  if (!recipe) {
    recipeDetailEl.classList.add("hidden");
    recipeDetailEl.classList.remove("sheet-open"); // NEW U/X
    document.body.classList.remove("detail-open"); // NEW U/X
    recipeDetailEl.innerHTML = "";
    return;
  }

  // NEW Recipe on top of viewport (Desktop)
  recipeDetailEl.scrollTop = 0;

  document.body.classList.add("detail-open"); // NEW U/X

  recipeDetailEl.classList.remove("hidden");
  recipeDetailEl.innerHTML = "";

  // NEW U/X Close button (visible only on mobile via CSS)
  const closeBtn = document.createElement("button");
  closeBtn.className = "detail-close-btn";
  closeBtn.textContent = "Close"; // Close Icon
  closeBtn.addEventListener("click", () => {
    activeRecipeId = null;
    clearActiveRecipeCard();
    recipeDetailEl.classList.add("hidden");
    recipeDetailEl.classList.remove("sheet-open");
    document.body.classList.remove("detail-open");
  });
  recipeDetailEl.appendChild(closeBtn);

  const header = document.createElement("header");
  header.className = "recipe-detail-header";

  const titleBlock = document.createElement("div");
  titleBlock.className = "recipe-title-block";
  const title = document.createElement("h2");
  title.className = "recipe-title";
  title.textContent = recipe.title || "(Untitled recipe)";
  titleBlock.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "recipe-detail-meta";
  const lines = [];
  if (recipe.source) lines.push(`Source: ${recipe.source}`);
  if (lines.length > 0) {
    meta.textContent = lines.join(" · ");
    titleBlock.appendChild(meta);
  }

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
  actions.className = "recipe-actions top";

  // Icon circle buttons (Lucide)
  const editBtn = document.createElement("button");
  editBtn.className = "icon-circle-btn";
  editBtn.title = "Edit";
  editBtn.setAttribute("aria-label", "Edit");
  editBtn.innerHTML = '<i data-lucide="square-pen"></i>';
  editBtn.addEventListener("click", () => {
    openModal("manualTab", recipe);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "icon-circle-btn danger";
  deleteBtn.title = "Delete";
  deleteBtn.setAttribute("aria-label", "Delete");
  deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';

  deleteBtn.addEventListener("click", async () => {
    if (!confirm("Delete this recipe?")) return;
    await deleteRecipeFromCloud(recipe.id);
    recipes = recipes.filter((r) => r.id !== recipe.id);
    if (activeRecipeId === recipe.id) activeRecipeId = null;
    render();
  });

  const closeDetailBtn = document.createElement("button");
  closeDetailBtn.className = "icon-circle-btn mobile-only-close";
  closeDetailBtn.title = "Close";
  closeDetailBtn.setAttribute("aria-label", "Close");
  closeDetailBtn.innerHTML = '<i data-lucide="x"></i>';

  closeDetailBtn.addEventListener("click", () => {
    activeRecipeId = null;
    clearActiveRecipeCard();
    render(); // this will also remove body.detail-open via renderDetail
  });

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  actions.appendChild(closeDetailBtn);

  header.appendChild(actions);
  header.appendChild(titleBlock);

  recipeDetailEl.appendChild(header);

// Image (if any)
if (recipe.image) {
  const img = document.createElement("img");
  img.className = "recipe-image";
  img.src = recipe.image;
  img.alt = recipe.title || "Recipe photo";
  recipeDetailEl.appendChild(img);
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

  // NEW U/X Mobile: open as a slide-up bottom sheet
  if (window.innerWidth <= 900) {
    recipeDetailEl.classList.add("sheet-open");
    document.body.classList.add("detail-open");
  } else {
    recipeDetailEl.classList.remove("sheet-open");
    document.body.classList.remove("detail-open");
  }

lucide.createIcons();

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
    document.getElementById("modalTitle").textContent = "+ Add";
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

// Go up button: watch both the window and the mobile detail panel scroll
if (goUpBtnEl) {
  goUpBtnEl.addEventListener("click", scrollToTop);
  window.addEventListener("scroll", updateGoUpVisibility, { passive: true });
  window.addEventListener("resize", updateGoUpVisibility);
  if (recipeDetailEl) {
    recipeDetailEl.addEventListener("scroll", updateGoUpVisibility, { passive: true });
  }
}

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

let searchDebounceTimer = null;
searchInputEl.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    renderRecipeList();
  }, 150);
});

// Manual form submit
manualForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }

  const title = manualTitleEl.value.trim();
  const source = manualSourceEl.value.trim();
  const tags = parseTags(manualTagsEl.value);
  const ingredientsText = manualIngredientsEl.value.trim();
  const instructionsText = manualInstructionsEl.value.trim();
  const cookNotesText = manualNotesEl.value.trim();
  const now = Date.now();
  const editId = manualForm.dataset.editId;
  const file = manualImageEl && manualImageEl.files[0];

  // Helper to create/update the recipe and save it
  const saveRecipeObject = async (imageValue) => {
    // Compute fingerprint for duplicate prevention
    const fp = recipeFingerprint({
      title: title || "(Untitled recipe)",
      source,
      ingredientsText,
      instructionsText,
      cookNotesText,
    });

    // If this content already exists (different doc id), open it instead of creating/updating a duplicate.
    const existingId = await findExistingRecipeIdByFingerprint(fp, editId || null);

    // New recipe: prevent duplicate creates
    if (!editId && existingId) {
      alert("This recipe already exists. Opening the existing one instead of creating a duplicate.");
      activeRecipeId = existingId;
      render();
      closeModal();
      return;
    }

    // Edit: if edit would turn this into a duplicate of another recipe, block it.
    if (editId && existingId && existingId !== editId) {
      alert("A recipe with the same content already exists. Opening the existing one instead.");
      activeRecipeId = existingId;
      render();
      closeModal();
      return;
    }

    let recipe;

    if (editId) {
      const idx = recipes.findIndex((r) => r.id === editId);
      if (idx >= 0) {
        const existing = recipes[idx];
        recipe = {
          ...existing,
          title: title || "(Untitled recipe)",
          source,
          tags,
          ingredientsText,
          instructionsText,
          cookNotesText,
          fingerprint: fp,
          // if imageValue is null, keep existing image
          image: imageValue !== null ? imageValue : existing.image || "",
          updatedAt: now,
        };
        recipes[idx] = recipe;
      }
    } else {
      recipe = {
        id: null, // will be set by Firestore
        title: title || "(Untitled recipe)",
        source,
        tags,
        ingredientsText,
        instructionsText,
        cookNotesText,
        fingerprint: fp,
        image: imageValue || "", // base64 data URL or empty string
        body: "",
        createdAt: now,
        updatedAt: now,
      };
      recipes.push(recipe);
    }

    await saveRecipeToCloud(recipe);
    activeRecipeId = recipe.id;
    render();
    closeModal();
  };


  // If a new image file was selected, resize/compress and save
  if (file) {
    try {
      // You can tweak maxWidth/quality here if you want
      const dataUrl = await resizeImageFile(file, 900, 0.75);
      await saveRecipeObject(dataUrl);
    } catch (err) {
      console.error("Error resizing/saving recipe image:", err);
      alert("Error processing image: " + err.message);
      // fallback: save without changing/adding image
      await saveRecipeObject(null);
    }
  } else {
    // No new image selected → keep existing (edit) or empty (new)
    await saveRecipeObject(null);
  }
});


// URL fetch button
fetchUrlBtn.addEventListener("click", () => {
  handleFetchUrl();
});

// URL form submit
urlForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return alert("Please log in first.");

  const url = urlInputEl.value.trim();
  const title = urlTitleEl.value.trim() || "(Untitled recipe)";
  const source = urlSourceEl.value.trim() || (url ? new URL(url).hostname : "");
  const tags = parseTags(urlTagsEl.value);
  const ingredientsText = urlIngredientsEl.value.trim();
  const instructionsText = urlInstructionsEl.value.trim();
  const cookNotesText = urlNotesEl.value.trim();
  const now = Date.now();

  const fp = recipeFingerprint({
    title,
    source,
    ingredientsText,
    instructionsText,
    cookNotesText,
  });

  const existingId = await findExistingRecipeIdByFingerprint(fp, null);
  if (existingId) {
    alert("This recipe already exists. Opening the existing one instead of creating a duplicate.");
    activeRecipeId = existingId;
    render();
    closeModal();
    return;
  }

  // Build recipe object for Firestore
  const recipe = {
    id: null,
    title,
    source,
    tags,
    ingredientsText,
    instructionsText,
    cookNotesText,
    fingerprint: fp,
    image: "", // No image for URL imports, user can edit later
    body: "",
    createdAt: now,
    updatedAt: now,
  };

  recipes.push(recipe);
  await saveRecipeToCloud(recipe);

  activeRecipeId = recipe.id;
  render();
  closeModal();
});


// Text form submit (pasted recipes: Instagram, TikTok, Notes, etc.)
textForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return alert("Please log in first.");

  const title = textTitleEl.value.trim() || "(Untitled pasted recipe)";
  const source = textSourceEl.value.trim();
  const tags = parseTags(textTagsEl.value);
  const body = textBodyEl.value.trim();
  const cookNotesText = textNotesEl.value.trim();

  if (!body) return alert("Please paste some text.");

  const now = Date.now();

  // Auto-split the pasted text
  const { ingredients, instructions } = autoSplitRecipeText(body);

  const fp = recipeFingerprint({
    title,
    source,
    ingredientsText: ingredients,
    instructionsText: instructions,
    cookNotesText,
  });

  const existingId = await findExistingRecipeIdByFingerprint(fp, null);
  if (existingId) {
    alert("This recipe already exists. Opening the existing one instead of creating a duplicate.");
    activeRecipeId = existingId;
    render();
    closeModal();
    return;
  }

  const recipe = {
    id: null,
    title,
    source,
    tags,
    ingredientsText: ingredients,
    instructionsText: instructions,
    cookNotesText,
    fingerprint: fp,
    image: "",
    body,
    createdAt: now,
    updatedAt: now,
  };

  recipes.push(recipe);
  await saveRecipeToCloud(recipe);

  activeRecipeId = recipe.id;
  render();
  closeModal();
});


// File form submit
fileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return alert("Please log in first.");

  const files = Array.from(fileInputEl.files || []);
  if (files.length === 0) return alert("Please select one or more files.");

  const now = Date.now();
  let lastRecipeId = null;
  let skipped = 0;
  let created = 0;

  for (const file of files) {
    const text = await file.text();
    const title = file.name.replace(/\.[^.]+$/, "") || "(Untitled file)";

    const { ingredients, instructions } = autoSplitRecipeText(text);

    const fp = recipeFingerprint({
      title,
      source: "Imported text file",
      ingredientsText: ingredients,
      instructionsText: instructions,
      cookNotesText: "",
    });

    const existingId = await findExistingRecipeIdByFingerprint(fp, null);
    if (existingId) {
      skipped++;
      lastRecipeId = existingId;
      continue;
    }

    const recipe = {
      id: null,
      title,
      source: "Imported text file",
      tags: [],
      ingredientsText: ingredients,
      instructionsText: instructions,
      cookNotesText: "",
      fingerprint: fp,
      image: "",
      body: text,
      createdAt: now,
      updatedAt: now,
    };

    recipes.push(recipe);
    await saveRecipeToCloud(recipe);

    created++;
    lastRecipeId = recipe.id;
  }

  if (skipped > 0) {
    alert(`Import finished. Created ${created} new recipe(s). Skipped ${skipped} duplicate(s).`);
  }

  if (lastRecipeId) activeRecipeId = lastRecipeId;
  render();
  closeModal();
});

// Init

// Auth listener will load recipes when logged in
render();
lucide.createIcons(); // replaces <i data-lucide="..."> with actual SVGs