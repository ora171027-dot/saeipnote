const LEGACY_STORAGE_KEY = "saeipnote.plants.v1";
const DATABASE_NAME = "saeipnote.db";
const DATABASE_VERSION = 1;
const STORE_NAME = "app-state";
const PLANTS_KEY = "plants";
const MAX_PHOTO_SIZE = 960;
const MAX_PHOTO_BYTES = 140 * 1024;
const PHOTO_QUALITY = 0.72;
const DEFAULT_WATER_INTERVAL_DAYS = 7;
const MAX_WATER_HISTORY = 24;

const statusLabels = {
  good: "좋음",
  okay: "보통",
  watch: "주의",
};

const samplePlants = [
  {
    id: crypto.randomUUID(),
    name: "몬스테라",
    species: "Monstera",
    location: "창가",
    status: "good",
    wateredAt: today(-3),
    waterIntervalDays: 7,
    autoWaterInterval: true,
    waterHistory: [today(-3)],
    repottedAt: today(-18),
    memo: "새잎 올라오는 중",
    photo: "",
  },
];

let plants = [];
let currentFilter = "all";
let selectedPhoto = "";
let databasePromise;

const addPlantButton = document.querySelector("#addPlantButton");
const emptyAddButton = document.querySelector("#emptyAddButton");
const exportButton = document.querySelector("#exportButton");
const importInput = document.querySelector("#importInput");
const closeDialogButton = document.querySelector("#closeDialogButton");
const cancelDialogButton = document.querySelector("#cancelDialogButton");
const deletePlantButton = document.querySelector("#deletePlantButton");
const dialog = document.querySelector("#plantDialog");
const form = document.querySelector("#plantForm");
const grid = document.querySelector("#plantGrid");
const emptyState = document.querySelector("#emptyState");
const searchInput = document.querySelector("#searchInput");
const photoInput = document.querySelector("#plantPhoto");
const photoPreview = document.querySelector("#photoPreview");
const waterScheduleBoard = document.querySelector("#waterScheduleBoard");

addPlantButton.addEventListener("click", () => openForm());
emptyAddButton.addEventListener("click", () => openForm());
exportButton.addEventListener("click", exportPlants);
importInput.addEventListener("change", importPlants);
closeDialogButton.addEventListener("click", () => dialog.close());
cancelDialogButton.addEventListener("click", () => dialog.close());
searchInput.addEventListener("input", render);
photoInput.addEventListener("change", handlePhoto);
deletePlantButton.addEventListener("click", deletePlant);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    document.querySelectorAll(".filter-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    render();
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = document.querySelector("#plantId").value || crypto.randomUUID();
  const existingPlant = plants.find((item) => item.id === id);
  const wateredAt = document.querySelector("#wateredAt").value;
  const plant = normalizePlant({
    ...existingPlant,
    id,
    name: document.querySelector("#plantName").value.trim(),
    species: document.querySelector("#plantSpecies").value.trim(),
    location: document.querySelector("#plantLocation").value.trim(),
    status: document.querySelector("#plantStatus").value,
    wateredAt,
    waterIntervalDays: document.querySelector("#waterIntervalDays").value,
    autoWaterInterval: document.querySelector("#autoWaterInterval").checked,
    waterHistory: updateLastWaterDate(
      existingPlant?.waterHistory || [],
      existingPlant?.wateredAt || "",
      wateredAt
    ),
    repottedAt: document.querySelector("#repottedAt").value,
    memo: document.querySelector("#plantMemo").value.trim(),
    photo: selectedPhoto,
  });

  const previousPlants = plants;
  plants = plants.some((item) => item.id === id)
    ? plants.map((item) => (item.id === id ? plant : item))
    : [plant, ...plants];

  try {
    await savePlants();
    dialog.close();
    render();
  } catch (error) {
    plants = previousPlants;
    console.error(error);
    alert("저장하지 못했어요. 브라우저의 사이트 데이터 사용이 허용되어 있는지 확인해주세요.");
  }
});

grid.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-id]");
  if (!card) return;
  const plant = plants.find((item) => item.id === card.dataset.id);
  if (!plant) return;

  if (event.target.matches("[data-action='water']")) {
    const previousPlant = { ...plant, waterHistory: [...plant.waterHistory] };
    recordWatering(plant, today());
    try {
      await savePlants();
      render();
    } catch (error) {
      Object.assign(plant, previousPlant);
      console.error(error);
      alert("물 준 기록을 저장하지 못했어요.");
    }
    return;
  }

  openForm(plant);
});

waterScheduleBoard.addEventListener("click", (event) => {
  const card = event.target.closest("[data-water-id]");
  if (!card) return;
  const plant = plants.find((item) => item.id === card.dataset.waterId);
  if (plant) openForm(plant);
});

initialize();

async function initialize() {
  try {
    plants = await loadPlants();
    render();
  } catch (error) {
    console.error(error);
    plants = loadLegacyPlants() || samplePlants.map(normalizePlant);
    render();
    alert("새 저장소를 열지 못했어요. 브라우저를 다시 시작한 뒤 확인해주세요.");
  }
}

async function loadPlants() {
  const saved = await readDatabaseValue(PLANTS_KEY);
  if (Array.isArray(saved)) return saved.map(normalizePlant);

  const legacyPlants = loadLegacyPlants();
  const nextPlants = legacyPlants || samplePlants.map(normalizePlant);
  await writeDatabaseValue(PLANTS_KEY, nextPlants);
  if (legacyPlants) localStorage.removeItem(LEGACY_STORAGE_KEY);
  return nextPlants;
}

function loadLegacyPlants() {
  const saved = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.map(normalizePlant) : null;
  } catch {
    return null;
  }
}

async function savePlants() {
  await writeDatabaseValue(PLANTS_KEY, plants);
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not supported"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Database upgrade is blocked"));
  });
  return databasePromise;
}

async function readDatabaseValue(key) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeDatabaseValue(key, value) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Database transaction aborted"));
  });
}

function exportPlants() {
  const backup = {
    app: "새잎노트",
    version: 2,
    exportedAt: new Date().toISOString(),
    plants,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `saeipnote-backup-${today()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importPlants() {
  const file = importInput.files[0];
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    const nextPlants = Array.isArray(backup) ? backup : backup.plants;
    if (!Array.isArray(nextPlants)) throw new Error("Invalid backup");
    if (!confirm("현재 식물 목록을 백업 파일 내용으로 바꿀까요?")) return;

    const previousPlants = plants;
    plants = nextPlants.map(normalizePlant);
    try {
      await savePlants();
      render();
    } catch (error) {
      plants = previousPlants;
      throw error;
    }
  } catch (error) {
    console.error(error);
    alert("백업 파일을 읽거나 저장하지 못했어요.");
  } finally {
    importInput.value = "";
  }
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = plants.filter((plant) => {
    const text = [plant.name, plant.species, plant.location, plant.memo].join(" ").toLowerCase();
    return (!query || text.includes(query)) && (currentFilter === "all" || plant.status === currentFilter);
  });

  document.querySelector("#totalPlants").textContent = plants.length;
  document.querySelector("#needsWater").textContent = plants.filter(
    (plant) => getWaterStatus(plant).daysUntilDue <= 0
  ).length;
  document.querySelector("#watchPlants").textContent = plants.filter((plant) => plant.status === "watch").length;
  renderWaterBoard();
  grid.innerHTML = filtered.map(renderPlant).join("");
  emptyState.classList.toggle("visible", filtered.length === 0);
}

function renderWaterBoard() {
  const schedule = plants.map(getWaterStatus).sort((a, b) => {
    if (a.daysUntilDue !== b.daysUntilDue) return a.daysUntilDue - b.daysUntilDue;
    return a.plant.name.localeCompare(b.plant.name, "ko");
  });
  const groups = new Map();
  schedule.forEach((item) => {
    if (!groups.has(item.daysUntilDue)) groups.set(item.daysUntilDue, []);
    groups.get(item.daysUntilDue).push(item);
  });

  waterScheduleBoard.innerHTML = [...groups.entries()].map(([days, items]) => {
    const stateClass = days < 0 ? "overdue" : days === 0 ? "today" : "upcoming";
    return `
      <section class="water-group ${stateClass}">
        <div class="water-group-heading">
          <h3>${formatWaterGroupLabel(days)}</h3>
          <span>${items.length}</span>
        </div>
        <div class="water-photo-grid">
          ${items.map(({ plant }) => renderWaterPhoto(plant)).join("")}
        </div>
      </section>
    `;
  }).join("");
  document.querySelector("#waterBoardNote").textContent = "사진을 누르면 식물 기록을 열 수 있어요.";
}

function renderWaterPhoto(plant) {
  const initial = escapeHtml(plant.name.slice(0, 1) || "?");
  const photo = plant.photo
    ? `<img src="${plant.photo}" alt="${escapeHtml(plant.name)} 사진" />`
    : `<span class="water-photo-placeholder">${initial}</span>`;
  return `
    <button class="water-photo-card" type="button" data-water-id="${plant.id}">
      ${photo}
      <b>${escapeHtml(plant.name)}</b>
    </button>
  `;
}

function formatWaterGroupLabel(days) {
  if (days < 0) return `${Math.abs(days)}일 지남`;
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  return `${days}일 뒤`;
}

function renderPlant(plant) {
  const waterStatus = getWaterStatus(plant);
  const waterText = plant.wateredAt ? `${daysSince(plant.wateredAt)}일 전` : "기록 없음";
  const repotText = plant.repottedAt ? `${daysSince(plant.repottedAt)}일 전` : "기록 없음";
  const nextWaterText = plant.wateredAt ? formatDueText(waterStatus.daysUntilDue) : "주기 확인";
  const subtitle = [plant.species, plant.location].filter(Boolean).join(" · ") || "위치 미정";
  const initial = plant.name.slice(0, 1) || "?";
  const intervalText = plant.autoWaterInterval
    ? `자동 ${waterStatus.interval}일${waterStatus.observationCount ? "" : " (학습 전)"}`
    : `${waterStatus.interval}일마다`;

  return `
    <article class="plant-card" data-id="${plant.id}">
      <div class="plant-photo">
        ${plant.photo ? `<img src="${plant.photo}" alt="${escapeHtml(plant.name)} 사진" />` : `<span>${escapeHtml(initial)}</span>`}
      </div>
      <div class="plant-content">
        <div class="plant-title">
          <div><h2>${escapeHtml(plant.name)}</h2><p>${escapeHtml(subtitle)}</p></div>
          <span class="status-pill status-${plant.status}">${statusLabels[plant.status]}</span>
        </div>
        <div class="plant-dates">
          <div><b>물 준 날</b><span>${waterText}</span></div>
          <div><b>다음 물</b><span>${nextWaterText}</span></div>
          <div><b>물 주기</b><span>${intervalText}</span></div>
          <div><b>분갈이</b><span>${repotText}</span></div>
        </div>
        ${plant.memo ? `<p class="plant-memo">${escapeHtml(plant.memo)}</p>` : ""}
        <div class="plant-actions">
          <button class="quick-button" type="button" data-action="water">물 줬어요</button>
          <button class="quick-button secondary" type="button" data-action="edit">수정</button>
        </div>
      </div>
    </article>
  `;
}

function openForm(plant = null) {
  selectedPhoto = plant?.photo || "";
  document.querySelector("#dialogTitle").textContent = plant ? "식물 수정" : "식물 추가";
  document.querySelector("#plantId").value = plant?.id || "";
  document.querySelector("#plantName").value = plant?.name || "";
  document.querySelector("#plantSpecies").value = plant?.species || "";
  document.querySelector("#plantLocation").value = plant?.location || "";
  document.querySelector("#plantStatus").value = plant?.status || "good";
  document.querySelector("#wateredAt").value = plant?.wateredAt || today();
  document.querySelector("#waterIntervalDays").value = plant?.waterIntervalDays || DEFAULT_WATER_INTERVAL_DAYS;
  document.querySelector("#autoWaterInterval").checked = plant?.autoWaterInterval !== false;
  document.querySelector("#repottedAt").value = plant?.repottedAt || "";
  document.querySelector("#plantMemo").value = plant?.memo || "";
  photoInput.value = "";
  deletePlantButton.style.visibility = plant ? "visible" : "hidden";
  updatePhotoPreview();
  dialog.showModal();
}

async function deletePlant() {
  const id = document.querySelector("#plantId").value;
  if (!id) return;
  const plant = plants.find((item) => item.id === id);
  if (!confirm(`${plant.name} 기록을 삭제할까요?`)) return;

  const previousPlants = plants;
  plants = plants.filter((item) => item.id !== id);
  try {
    await savePlants();
    dialog.close();
    render();
  } catch (error) {
    plants = previousPlants;
    console.error(error);
    alert("식물 기록을 삭제하지 못했어요.");
  }
}

async function handlePhoto() {
  const file = photoInput.files[0];
  if (!file) return;
  try {
    selectedPhoto = await resizePhoto(file);
    updatePhotoPreview();
  } catch (error) {
    console.error(error);
    alert("사진을 처리하지 못했어요. 다른 사진을 선택해주세요.");
  }
}

function updatePhotoPreview() {
  photoPreview.src = selectedPhoto;
  photoPreview.classList.toggle("visible", Boolean(selectedPhoto));
}

function normalizePlant(plant) {
  const wateredAt = isDateString(plant?.wateredAt) ? plant.wateredAt : "";
  return {
    ...plant,
    id: plant?.id || crypto.randomUUID(),
    name: plant?.name || "이름 없는 식물",
    species: plant?.species || "",
    location: plant?.location || "",
    status: statusLabels[plant?.status] ? plant.status : "good",
    wateredAt,
    waterIntervalDays: normalizeWaterInterval(plant?.waterIntervalDays),
    autoWaterInterval: plant?.autoWaterInterval !== false,
    waterHistory: normalizeWaterHistory(plant?.waterHistory, wateredAt),
    repottedAt: isDateString(plant?.repottedAt) ? plant.repottedAt : "",
    memo: plant?.memo || "",
    photo: typeof plant?.photo === "string" ? plant.photo : "",
  };
}

function normalizeWaterInterval(value) {
  const days = Number.parseInt(value, 10);
  if (!Number.isFinite(days) || days < 1) return DEFAULT_WATER_INTERVAL_DAYS;
  return Math.min(days, 365);
}

function normalizeWaterHistory(history, wateredAt = "") {
  const dates = Array.isArray(history) ? history.filter(isDateString) : [];
  if (isDateString(wateredAt)) dates.push(wateredAt);
  return [...new Set(dates)].sort().slice(-MAX_WATER_HISTORY);
}

function updateLastWaterDate(history, previousDate, nextDate) {
  const dates = normalizeWaterHistory(history, previousDate);
  const nextHistory = previousDate === nextDate ? dates : dates.filter((date) => date !== previousDate);
  return normalizeWaterHistory(nextHistory, nextDate);
}

function recordWatering(plant, date) {
  plant.waterHistory = normalizeWaterHistory(plant.waterHistory, date);
  plant.wateredAt = date;
}

function getAdaptiveWaterInterval(plant) {
  const baseInterval = normalizeWaterInterval(plant.waterIntervalDays);
  if (!plant.autoWaterInterval) return { interval: baseInterval, observationCount: 0 };

  const history = normalizeWaterHistory(plant.waterHistory, plant.wateredAt);
  const intervals = [];
  for (let index = 1; index < history.length; index += 1) {
    const interval = daysBetween(history[index - 1], history[index]);
    if (interval >= 1 && interval <= 365) intervals.push(interval);
  }
  const recent = intervals.slice(-5);
  if (!recent.length) return { interval: baseInterval, observationCount: 0 };

  const weightedTotal = recent.reduce((total, value, index) => total + value * (index + 1), 0);
  const weightSum = recent.reduce((total, _value, index) => total + index + 1, 0);
  const recentAverage = weightedTotal / weightSum;
  const learned = recent.length === 1
    ? Math.round((baseInterval + recentAverage) / 2)
    : Math.round(recentAverage);
  return { interval: Math.max(1, Math.min(365, learned)), observationCount: recent.length };
}

function getWaterStatus(plant) {
  const { interval, observationCount } = getAdaptiveWaterInterval(plant);
  const dueDate = addDays(plant.wateredAt || today(), interval);
  return {
    plant,
    interval,
    observationCount,
    dueDate,
    daysUntilDue: plant.wateredAt ? daysBetween(today(), dueDate) : 0,
  };
}

function formatDueText(days) {
  if (days < 0) return `${Math.abs(days)}일 지남`;
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  return `${days}일 뒤`;
}

function addDays(dateString, offset) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return formatLocalDate(date);
}

function daysBetween(fromDateString, toDateString) {
  const fromDate = new Date(`${fromDateString}T00:00:00`);
  const toDate = new Date(`${toDateString}T00:00:00`);
  return Math.round((toDate - fromDate) / 86400000);
}

function daysSince(dateString) {
  if (!dateString) return Number.POSITIVE_INFINITY;
  const date = new Date(`${dateString}T00:00:00`);
  const now = new Date();
  const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((currentDate - date) / 86400000));
}

function today(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return formatLocalDate(date);
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDateString(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

async function resizePhoto(file) {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_PHOTO_SIZE / Math.max(image.width, image.height));
  let canvas = drawImage(image, Math.round(image.width * scale), Math.round(image.height * scale));
  let quality = PHOTO_QUALITY;
  let result = encodePhoto(canvas, quality);

  while (dataUrlBytes(result) > MAX_PHOTO_BYTES && quality > 0.44) {
    quality -= 0.08;
    result = encodePhoto(canvas, quality);
  }
  while (dataUrlBytes(result) > MAX_PHOTO_BYTES && Math.max(canvas.width, canvas.height) > 640) {
    canvas = resizeCanvas(canvas, 0.82);
    result = encodePhoto(canvas, Math.max(0.48, quality));
  }
  return result;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();
    reader.onload = () => { image.src = reader.result; };
    reader.onerror = reject;
    image.onload = () => resolve(image);
    image.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function drawImage(image, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function resizeCanvas(source, scale) {
  return drawImage(source, Math.round(source.width * scale), Math.round(source.height * scale));
}

function encodePhoto(canvas, quality) {
  const webp = canvas.toDataURL("image/webp", quality);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
}

function dataUrlBytes(value) {
  const base64 = value.slice(value.indexOf(",") + 1);
  return Math.ceil((base64.length * 3) / 4);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
