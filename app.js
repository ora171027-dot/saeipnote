const STORAGE_KEY = "saeipnote.plants.v1";
const MAX_PHOTO_SIZE = 1280;
const PHOTO_QUALITY = 0.78;

const statusLabels = {
  good: "좋음",
  okay: "보통",
  watch: "주의",
};

const DEFAULT_WATER_INTERVAL_DAYS = 7;

const samplePlants = [
  {
    id: crypto.randomUUID(),
    name: "몬스테라",
    species: "Monstera",
    location: "창가",
    status: "good",
    wateredAt: today(-3),
    waterIntervalDays: 7,
    repottedAt: today(-18),
    memo: "새잎 올라오는 중",
    photo: "",
  },
  {
    id: crypto.randomUUID(),
    name: "스킨답서스",
    species: "Pothos",
    location: "책상 옆",
    status: "okay",
    wateredAt: today(-6),
    waterIntervalDays: 5,
    repottedAt: "",
    memo: "줄기가 길어져서 곧 정리 필요",
    photo: "",
  },
  {
    id: crypto.randomUUID(),
    name: "고무나무",
    species: "Ficus",
    location: "회의실 입구",
    status: "watch",
    wateredAt: today(-10),
    waterIntervalDays: 10,
    repottedAt: today(-43),
    memo: "잎끝 마름 관찰 중",
    photo: "",
  },
];

let plants = loadPlants();
let currentFilter = "all";
let selectedPhoto = "";

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
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    document.querySelectorAll(".filter-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    render();
  });
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = document.querySelector("#plantId").value || crypto.randomUUID();
  const plant = {
    id,
    name: document.querySelector("#plantName").value.trim(),
    species: document.querySelector("#plantSpecies").value.trim(),
    location: document.querySelector("#plantLocation").value.trim(),
    status: document.querySelector("#plantStatus").value,
    wateredAt: document.querySelector("#wateredAt").value,
    waterIntervalDays: normalizeWaterInterval(document.querySelector("#waterIntervalDays").value),
    repottedAt: document.querySelector("#repottedAt").value,
    memo: document.querySelector("#plantMemo").value.trim(),
    photo: selectedPhoto,
  };

  plants = plants.some((item) => item.id === id)
    ? plants.map((item) => (item.id === id ? plant : item))
    : [plant, ...plants];

  try {
    savePlants();
    dialog.close();
    render();
  } catch (error) {
    alert("저장공간이 부족해요. 사진을 더 작게 넣거나 오래된 사진을 줄여주세요.");
  }
});

grid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card) return;

  const plant = plants.find((item) => item.id === card.dataset.id);
  if (!plant) return;

  if (event.target.matches("[data-action='water']")) {
    plant.wateredAt = today();
    savePlants();
    render();
    return;
  }

  if (event.target.matches("[data-action='edit']")) {
    openForm(plant);
    return;
  }

  openForm(plant);
});

render();

function loadPlants() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return samplePlants.map(normalizePlant);

  try {
    return JSON.parse(saved).map(normalizePlant);
  } catch {
    return samplePlants.map(normalizePlant);
  }
}

function savePlants() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plants));
}

function exportPlants() {
  const backup = {
    app: "새잎노트",
    version: 1,
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

function importPlants() {
  const file = importInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);
      const nextPlants = Array.isArray(backup) ? backup : backup.plants;
      if (!Array.isArray(nextPlants)) throw new Error("Invalid backup");

      const ok = confirm("현재 식물 목록을 백업 파일 내용으로 바꿀까요?");
      if (!ok) return;

      plants = nextPlants.map(normalizePlant);
      savePlants();
      render();
    } catch {
      alert("백업 파일을 읽지 못했어요.");
    } finally {
      importInput.value = "";
    }
  };
  reader.readAsText(file);
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = plants.filter((plant) => {
    const text = [plant.name, plant.species, plant.location, plant.memo].join(" ").toLowerCase();
    const matchesSearch = !query || text.includes(query);
    const matchesFilter = currentFilter === "all" || plant.status === currentFilter;
    return matchesSearch && matchesFilter;
  });

  document.querySelector("#totalPlants").textContent = plants.length;
  document.querySelector("#needsWater").textContent = plants.filter((plant) => getWaterStatus(plant).daysUntilDue <= 0).length;
  document.querySelector("#watchPlants").textContent = plants.filter((plant) => plant.status === "watch").length;
  renderWaterBoard();

  grid.innerHTML = filtered.map(renderPlant).join("");
  emptyState.classList.toggle("visible", filtered.length === 0);
}

function renderPlant(plant) {
  const wateredDays = daysSince(plant.wateredAt);
  const repottedDays = daysSince(plant.repottedAt);
  const waterStatus = getWaterStatus(plant);
  const waterText = plant.wateredAt ? `${wateredDays}일 전` : "기록 없음";
  const nextWaterText = plant.wateredAt ? formatDueText(waterStatus.daysUntilDue) : "주기 확인";
  const repotText = plant.repottedAt ? `${repottedDays}일 전` : "기록 없음";
  const subtitle = [plant.species, plant.location].filter(Boolean).join(" · ") || "위치 미정";
  const initial = plant.name.slice(0, 1) || "?";

  return `
    <article class="plant-card" data-id="${plant.id}">
      <div class="plant-photo">
        ${plant.photo ? `<img src="${plant.photo}" alt="${escapeHtml(plant.name)} 사진" />` : `<span>${escapeHtml(initial)}</span>`}
      </div>
      <div class="plant-content">
        <div class="plant-title">
          <div>
            <h2>${escapeHtml(plant.name)}</h2>
            <p>${escapeHtml(subtitle)}</p>
          </div>
          <span class="status-pill status-${plant.status}">${statusLabels[plant.status]}</span>
        </div>
        <div class="plant-dates">
          <div><b>물 준 날</b><span>${waterText}</span></div>
          <div><b>다음 물</b><span>${nextWaterText}</span></div>
          <div><b>물 주기</b><span>${plant.waterIntervalDays}일마다</span></div>
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
  document.querySelector("#repottedAt").value = plant?.repottedAt || "";
  document.querySelector("#plantMemo").value = plant?.memo || "";
  photoInput.value = "";
  deletePlantButton.style.visibility = plant ? "visible" : "hidden";
  updatePhotoPreview();
  dialog.showModal();
}

function deletePlant() {
  const id = document.querySelector("#plantId").value;
  if (!id) return;

  const plant = plants.find((item) => item.id === id);
  const ok = confirm(`${plant.name} 기록을 삭제할까요?`);
  if (!ok) return;

  plants = plants.filter((item) => item.id !== id);
  savePlants();
  dialog.close();
  render();
}

async function handlePhoto() {
  const file = photoInput.files[0];
  if (!file) return;

  selectedPhoto = await resizePhoto(file);
  updatePhotoPreview();
}

function updatePhotoPreview() {
  photoPreview.src = selectedPhoto;
  photoPreview.classList.toggle("visible", Boolean(selectedPhoto));
}

function normalizePlant(plant) {
  return {
    ...plant,
    waterIntervalDays: normalizeWaterInterval(plant.waterIntervalDays),
  };
}

function normalizeWaterInterval(value) {
  const days = Number.parseInt(value, 10);
  if (!Number.isFinite(days) || days < 1) return DEFAULT_WATER_INTERVAL_DAYS;
  return Math.min(days, 365);
}

function renderWaterBoard() {
  const schedule = plants.map(getWaterStatus).sort((a, b) => {
    if (a.daysUntilDue !== b.daysUntilDue) return a.daysUntilDue - b.daysUntilDue;
    return a.plant.name.localeCompare(b.plant.name, "ko");
  });

  document.querySelector("#overduePlants").textContent = schedule.filter((item) => item.daysUntilDue < 0).length;
  document.querySelector("#todayPlants").textContent = schedule.filter((item) => item.daysUntilDue === 0).length;
  document.querySelector("#tomorrowPlants").textContent = schedule.filter((item) => item.daysUntilDue === 1).length;
  document.querySelector("#soonPlants").textContent = schedule.filter(
    (item) => item.daysUntilDue >= 0 && item.daysUntilDue <= 3
  ).length;

  const visibleSchedule = schedule;
  document.querySelector("#waterScheduleBody").innerHTML = visibleSchedule.map(renderWaterRow).join("");
  document.querySelector("#waterBoardNote").textContent = "급한 순서로 전체 식물을 보여줘요.";
}

function renderWaterRow(item) {
  const { plant, dueDate, daysUntilDue } = item;
  const stateClass = daysUntilDue < 0 ? "overdue" : daysUntilDue <= 1 ? "due" : daysUntilDue <= 3 ? "soon" : "ok";
  const lastWatered = plant.wateredAt ? `${daysSince(plant.wateredAt)}일 전` : "기록 없음";
  const dueDateText = plant.wateredAt ? formatDateLabel(dueDate) : "물 준 날 필요";

  return `
    <tr>
      <td><b>${escapeHtml(plant.name)}</b></td>
      <td>${escapeHtml(plant.location || "-")}</td>
      <td>${plant.waterIntervalDays}일</td>
      <td>${lastWatered}</td>
      <td>${dueDateText}</td>
      <td><span class="water-state ${stateClass}">${formatDueText(daysUntilDue)}</span></td>
    </tr>
  `;
}

function getWaterStatus(plant) {
  const interval = normalizeWaterInterval(plant.waterIntervalDays);
  const dueDate = addDays(plant.wateredAt || today(), interval);
  return {
    plant: { ...plant, waterIntervalDays: interval },
    dueDate,
    daysUntilDue: plant.wateredAt ? daysBetween(today(), dueDate) : 0,
  };
}

function formatDueText(daysUntilDue) {
  if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)}일 지남`;
  if (daysUntilDue === 0) return "오늘";
  if (daysUntilDue === 1) return "내일";
  return `${daysUntilDue}일 뒤`;
}

function formatDateLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function addDays(dateString, offset) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return formatLocalDate(date);
}

function daysBetween(fromDateString, toDateString) {
  const fromDate = new Date(`${fromDateString}T00:00:00`);
  const toDate = new Date(`${toDateString}T00:00:00`);
  return Math.floor((toDate - fromDate) / 86400000);
}

function daysSince(dateString) {
  if (!dateString) return Number.POSITIVE_INFINITY;
  const date = new Date(`${dateString}T00:00:00`);
  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((todayDate - date) / 86400000));
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

function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      image.src = reader.result;
    };

    reader.onerror = reject;

    image.onload = () => {
      const scale = Math.min(1, MAX_PHOTO_SIZE / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);

      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
    };

    image.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
