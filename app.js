import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { firebaseConfig, FAMILY_ID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const page = document.body.dataset.page;
const $ = (id) => document.getElementById(id);
const state = {
  feeds: [],
  breastfeeds: [],
  pumps: [],
  measurements: []
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Palvelutyöntekijän rekisteröinti epäonnistui.", error);
    });
  });
}

function roundToQuarter(date = new Date()) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  rounded.setMinutes(Math.round(rounded.getMinutes() / 15) * 15);
  return rounded;
}

function localDateTimeValue(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date - offset).toISOString().slice(0, 16);
}

function normalizeTimeInput(input) {
  if (!input.value) return "";
  input.value = localDateTimeValue(roundToQuarter(new Date(input.value)));
  return input.value;
}

function prepareQuarterHourInputs() {
  document.querySelectorAll('input[type="datetime-local"]').forEach((input) => {
    input.addEventListener("change", () => normalizeTimeInput(input));
    input.addEventListener("blur", () => normalizeTimeInput(input));
  });
}

function dateKey(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date - offset).toISOString().slice(0, 10);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("fi-FI", { day: "numeric", month: "numeric" }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("fi-FI", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("fi-FI", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function setMilkType(switchId, inputId, value) {
  const switcher = $(switchId);
  const input = $(inputId);
  input.value = value;
  switcher.querySelectorAll("[data-milk-type]").forEach((button) => {
    const isActive = button.dataset.milkType === value;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function attachMilkSwitch(switchId, inputId) {
  const switcher = $(switchId);
  switcher.addEventListener("click", (event) => {
    const button = event.target.closest("[data-milk-type]");
    if (button) setMilkType(switchId, inputId, button.dataset.milkType);
  });
  setMilkType(switchId, inputId, $(inputId).value);
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3500);
}

function showLoginError(message) {
  $("loginError").textContent = message;
}

function firebaseErrorMessage(error) {
  switch (error.code) {
    case "auth/popup-closed-by-user":
      return "Kirjautumisikkuna suljettiin ennen kirjautumista.";
    case "auth/popup-blocked":
      return "Selain esti kirjautumisikkunan. Salli ponnahdusikkunat ja yritä uudelleen.";
    case "permission-denied":
      return "Sinulla ei ole oikeutta tämän perheen tietoihin.";
    default:
      return "Toiminto epäonnistui. Tarkista verkkoyhteys ja yritä uudelleen.";
  }
}

function daySeries(days, endOffset = 0) {
  const result = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  today.setDate(today.getDate() - endOffset);
  for (let index = days - 1; index >= 0; index--) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    result.push({ key: dateKey(date), date, breast: 0, formula: 0 });
  }
  state.feeds.forEach((feed) => {
    const day = result.find((entry) => entry.key === dateKey(feed.timestamp));
    if (day) day[feed.type] += feed.amount;
  });
  return result;
}

function getToday() {
  return daySeries(1)[0];
}

function renderDailyTotal() {
  const today = getToday();
  const total = today.breast + today.formula;
  $("todayTotal").textContent = `${total} ml`;
  $("todayBreakdown").textContent = total
    ? `Äidinmaito ${today.breast} ml · Korvike ${today.formula} ml`
    : "Ei kirjauksia vielä";
}

function renderLastFeedTime() {
  const lastFeedTime = $("lastFeedTime");
  const lastFeed = [...state.feeds, ...state.breastfeeds]
    .map((entry) => new Date(entry.timestamp))
    .filter((timestamp) => timestamp <= new Date())
    .sort((first, second) => second - first)[0];
  if (!lastFeed) {
    lastFeedTime.textContent = "Edellisestä syötöstä: —";
    return;
  }
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - lastFeed.getTime()) / 60000));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = String(elapsedMinutes % 60).padStart(2, "0");
  lastFeedTime.textContent = `Edellisestä syötöstä: ${hours}:${minutes}`;
}

function renderRecentFeeds() {
  const list = $("recentFeeds");
  const eightHoursAgo = Date.now() - 8 * 60 * 60 * 1000;
  const recent = [
    ...state.feeds.map((feed) => ({ ...feed, kind: "feed" })),
    ...state.breastfeeds.map((breastfeed) => ({ ...breastfeed, kind: "breastfeed" })),
    ...state.pumps.map((pump) => ({ ...pump, kind: "pump" }))
  ]
    .filter((entry) => new Date(entry.timestamp).getTime() >= eightHoursAgo)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  list.innerHTML = "";
  if (!recent.length) {
    list.innerHTML = '<li class="empty-list">Viimeisen 8 tunnin aikana ei ole kirjattuja merkintöjä.</li>';
    return;
  }
  recent.forEach((entry) => {
    const details = entry.kind === "feed"
      ? { amount: `${entry.amount} ml`, label: entry.type === "breast" ? "Äidinmaito" : "Korvike", className: entry.type }
      : entry.kind === "pump"
        ? { amount: `${entry.amount} ml`, label: "Pumppaus", className: "pump" }
        : { amount: "Imetys", label: "Aloitettu", className: "breastfeed" };
    const item = document.createElement("li");
    item.innerHTML = `<button class="recent-entry" type="button" data-entry-id="${entry.id}" data-entry-kind="${entry.kind}"><time class="recent-time" datetime="${entry.timestamp}">${formatTime(entry.timestamp)}</time><span class="feed-meta"><i class="type-dot ${details.className}"></i><span><strong>${details.amount}</strong><br><small>${details.label}</small></span></span><span class="entry-edit" aria-hidden="true">›</span></button>`;
    list.appendChild(item);
  });
}

function renderQuickAmounts() {
  const amountCounts = state.feeds.reduce((counts, feed) => {
    counts.set(feed.amount, (counts.get(feed.amount) || 0) + 1);
    return counts;
  }, new Map());
  const frequentAmounts = [...amountCounts.entries()]
    .filter(([amount]) => amount >= 60)
    .sort(([, firstCount], [, secondCount]) => secondCount - firstCount)
    .map(([amount]) => amount);
  const amounts = [...new Set([90, 110, ...frequentAmounts])].slice(0, 4);
  $("quickAmounts").innerHTML = amounts
    .map((amount) => `<button class="quick-amount" type="button" data-amount="${amount}">${amount} ml</button>`)
    .join("");
}

function renderChart(series) {
  const chart = $("chart");
  const max = Math.max(...series.map((day) => day.breast + day.formula), 1);
  chart.innerHTML = "";
  series.forEach((day) => {
    const total = day.breast + day.formula;
    const group = document.createElement("div");
    group.className = "bar-group";
    group.title = `${formatDate(day.date)}: ${total} ml`;
    group.innerHTML = `<span class="bar-value">${total} ml</span><div class="bar-wrap"><div class="bar breast" style="height:${(day.breast / max) * 100}%"></div><div class="bar formula" style="height:${(day.formula / max) * 100}%"></div></div><span class="bar-label">${formatDate(day.date)}</span>`;
    chart.appendChild(group);
  });
}

function activitySeries(days, endOffset = 0) {
  return daySeries(days, endOffset).map((day) => ({
    ...day,
    breastfeeds: state.breastfeeds.filter((entry) => dateKey(entry.timestamp) === day.key).length,
    pumped: state.pumps
      .filter((entry) => dateKey(entry.timestamp) === day.key)
      .reduce((sum, entry) => sum + entry.amount, 0)
  }));
}

function renderActivityChart(chartId, series, key, type, unit) {
  const chart = $(chartId);
  const max = Math.max(...series.map((day) => day[key]), 1);
  chart.innerHTML = "";
  series.forEach((day) => {
    const value = day[key];
    const group = document.createElement("div");
    group.className = "activity-bar-group";
    group.title = `${formatDate(day.date)}: ${value} ${unit}`;
    group.innerHTML = `<span class="activity-bar-value">${value} ${unit}</span><div class="activity-bar-wrap"><div class="activity-bar ${type}" style="height:${(value / max) * 100}%"></div></div><span class="activity-bar-label">${formatDate(day.date)}</span>`;
    chart.appendChild(group);
  });
}

function renderStats() {
  const last7 = daySeries(7);
  const last14 = daySeries(14);
  const today = last7[last7.length - 1];
  const total = today.breast + today.formula;
  const average7 = last7.reduce((sum, day) => sum + day.breast + day.formula, 0) / 7;
  const average14 = last14.reduce((sum, day) => sum + day.breast + day.formula, 0) / 14;
  const breastTotal = last7.reduce((sum, day) => sum + day.breast, 0);
  const formulaTotal = last7.reduce((sum, day) => sum + day.formula, 0);
  const milkTotal = breastTotal + formulaTotal;
  const breastPercent = milkTotal ? Math.round((breastTotal / milkTotal) * 100) : 0;
  const formulaPercent = milkTotal ? 100 - breastPercent : 0;
  const activities = activitySeries(7, 1);
  const breastfeedDays = activities.filter((day) => day.breastfeeds > 0);
  const pumpingDays = activities.filter((day) => day.pumped > 0);
  const breastfeedAverage = breastfeedDays.length
    ? breastfeedDays.reduce((sum, day) => sum + day.breastfeeds, 0) / breastfeedDays.length
    : 0;
  const pumpAverage = pumpingDays.length
    ? pumpingDays.reduce((sum, day) => sum + day.pumped, 0) / pumpingDays.length
    : 0;
  const difference = Math.round(total - average14);
  renderDailyTotal();
  $("weekAverage").textContent = `${Math.round(average7)} ml`;
  $("breastPercent").textContent = `${breastPercent} %`;
  $("formulaPercent").textContent = `${formulaPercent} %`;
  $("breastSegment").style.width = `${breastPercent}%`;
  $("formulaSegment").style.width = `${formulaPercent}%`;
  $("breastfeedCount").textContent = `${breastfeedAverage.toLocaleString("fi-FI", { maximumFractionDigits: 1 })} krt`;
  $("pumpTotal").textContent = `${Math.round(pumpAverage)} ml`;
  renderChart(last7);
  renderActivityChart("breastfeedChart", activities, "breastfeeds", "breastfeed", "krt");
  renderActivityChart("pumpChart", activities, "pumped", "pump", "ml");
  const direction = difference > 0 ? "enemmän" : "vähemmän";
  $("comparison").innerHTML = difference === 0
    ? "Tänään on <strong>juuri 14 päivän keskiarvossa</strong>."
    : `Tänään on <strong>${Math.abs(difference)} ml ${direction}</strong> kuin viimeisen 14 päivän päivittäinen keskiarvo (${Math.round(average14)} ml).`;
  $("refreshTime").textContent = `Viimeksi päivitetty: tänään klo ${formatTime(new Date())}`;
}

function renderMeasurements() {
  const measurements = [...state.measurements].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const latestWeight = measurements.find((measurement) => measurement.weight !== null);
  const latestHeight = measurements.find((measurement) => measurement.height !== null);
  $("latestWeight").textContent = latestWeight ? `${String(latestWeight.weight).replace(".", ",")} kg` : "—";
  $("latestHeight").textContent = latestHeight ? `${String(latestHeight.height).replace(".", ",")} cm` : "—";
  $("weightDate").textContent = latestWeight ? `Mitattu ${formatDate(latestWeight.timestamp)}` : "Ei mittauksia";
  $("heightDate").textContent = latestHeight ? `Mitattu ${formatDate(latestHeight.timestamp)}` : "Ei mittauksia";
  const weightInput = $("weight");
  const heightInput = $("height");
  if (latestWeight && document.activeElement !== weightInput) weightInput.value = latestWeight.weight;
  if (latestHeight && document.activeElement !== heightInput) heightInput.value = latestHeight.height;
  renderGrowthChart("weightChart", measurements, "weight", "kg");
  renderGrowthChart("heightChart", measurements, "height", "cm");
  renderMeasurementsTable(measurements);
}

function renderGrowthChart(chartId, measurements, field, unit) {
  const chart = $(chartId);
  const values = measurements
    .filter((measurement) => measurement[field] !== null)
    .sort((first, second) => new Date(first.timestamp) - new Date(second.timestamp));
  if (!values.length) {
    chart.innerHTML = '<text class="chart-empty" x="160" y="75" text-anchor="middle">Ei mittauksia vielä</text>';
    return;
  }
  const chartWidth = 320;
  const chartHeight = 150;
  const padding = { top: 24, right: 16, bottom: 28, left: 36 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const rawMin = Math.min(...values.map((measurement) => measurement[field]));
  const rawMax = Math.max(...values.map((measurement) => measurement[field]));
  const spread = rawMax - rawMin || Math.max(rawMax * 0.1, 1);
  const min = Math.max(0, rawMin - spread * 0.2);
  const max = rawMax + spread * 0.2;
  const x = (index) => padding.left + (values.length === 1 ? plotWidth / 2 : (index / (values.length - 1)) * plotWidth);
  const y = (value) => padding.top + plotHeight - ((value - min) / (max - min)) * plotHeight;
  const points = values.map((measurement, index) => `${x(index)},${y(measurement[field])}`).join(" ");
  const firstDate = formatDate(values[0].timestamp);
  const lastDate = formatDate(values[values.length - 1].timestamp);
  chart.innerHTML = `
    <line class="chart-grid-line" x1="${padding.left}" x2="${chartWidth - padding.right}" y1="${padding.top}" y2="${padding.top}"></line>
    <line class="chart-grid-line" x1="${padding.left}" x2="${chartWidth - padding.right}" y1="${padding.top + plotHeight / 2}" y2="${padding.top + plotHeight / 2}"></line>
    <line class="chart-grid-line" x1="${padding.left}" x2="${chartWidth - padding.right}" y1="${padding.top + plotHeight}" y2="${padding.top + plotHeight}"></line>
    <text class="chart-label" x="${padding.left - 4}" y="${padding.top + 3}" text-anchor="end">${max.toFixed(1)}</text>
    <text class="chart-label" x="${padding.left - 4}" y="${padding.top + plotHeight + 3}" text-anchor="end">${min.toFixed(1)}</text>
    <polyline class="chart-line" points="${points}"></polyline>
    ${values.map((measurement, index) => `<circle class="chart-point" cx="${x(index)}" cy="${y(measurement[field])}" r="4"><title>${formatDate(measurement.timestamp)}: ${String(measurement[field]).replace(".", ",")} ${unit}</title></circle>`).join("")}
    <text class="chart-label" x="${padding.left}" y="${chartHeight - 6}">${firstDate}</text>
    <text class="chart-label" x="${chartWidth - padding.right}" y="${chartHeight - 6}" text-anchor="end">${lastDate}</text>
    <text class="chart-value" x="${chartWidth - padding.right}" y="${padding.top - 8}" text-anchor="end">${String(values[values.length - 1][field]).replace(".", ",")} ${unit}</text>`;
}

function renderMeasurementsTable(measurements) {
  const table = $("measurementsTable");
  table.innerHTML = "";
  if (!measurements.length) {
    table.innerHTML = '<tr><td colspan="4">Ei mittauksia vielä.</td></tr>';
    return;
  }
  measurements.forEach((measurement) => {
    const row = document.createElement("tr");
    const weight = measurement.weight === null ? "—" : `${String(measurement.weight).replace(".", ",")} kg`;
    const height = measurement.height === null ? "—" : `${String(measurement.height).replace(".", ",")} cm`;
    row.innerHTML = `<td>${formatDate(measurement.timestamp)}</td><td>${weight}</td><td>${height}</td><td><button class="table-edit" type="button" data-measurement-id="${measurement.id}">Muokkaa</button></td>`;
    table.appendChild(row);
  });
}

function openMeasurementDialog(measurement) {
  $("editWeight").value = measurement.weight ?? "";
  $("editHeight").value = measurement.height ?? "";
  $("editMeasurementTime").value = localDateTimeValue(new Date(measurement.timestamp));
  $("measurementDialog").dataset.measurementId = measurement.id;
  $("measurementDialog").showModal();
}

function renderPage() {
  if (page === "home") {
    renderDailyTotal();
    renderLastFeedTime();
    renderRecentFeeds();
    renderQuickAmounts();
  }
  if (page === "stats") renderStats();
  if (page === "growth") renderMeasurements();
  if (page === "log") renderLog();
}

function familyRef() {
  return doc(db, "families", FAMILY_ID);
}

function subscribeToData() {
  onSnapshot(familyRef(), (snapshot) => {
    if (!snapshot.exists()) {
      showToast("Perheen asetuksia ei löytynyt. Tarkista Firestore-dokumentti.");
      return;
    }
    renderPage();
  }, (error) => showToast(firebaseErrorMessage(error)));

  const feedsQuery = query(collection(db, "families", FAMILY_ID, "feeds"), orderBy("timestamp", "desc"));
  onSnapshot(feedsQuery, (snapshot) => {
    state.feeds = snapshot.docs.map((feedDocument) => {
      const data = feedDocument.data();
      return { id: feedDocument.id, amount: data.amount, type: data.type, timestamp: data.timestamp.toDate().toISOString() };
    });
    renderPage();
  }, (error) => showToast(firebaseErrorMessage(error)));

  const measurementsQuery = query(collection(db, "families", FAMILY_ID, "measurements"), orderBy("timestamp", "desc"));
  onSnapshot(measurementsQuery, (snapshot) => {
    state.measurements = snapshot.docs.map((measurementDocument) => {
      const data = measurementDocument.data();
      return {
        id: measurementDocument.id,
        weight: data.weight ?? null,
        height: data.height ?? null,
        timestamp: data.timestamp.toDate().toISOString()
      };
    });
    renderPage();
  }, (error) => showToast(firebaseErrorMessage(error)));

  const breastfeedsQuery = query(collection(db, "families", FAMILY_ID, "breastfeeds"), orderBy("timestamp", "desc"));
  onSnapshot(breastfeedsQuery, (snapshot) => {
    state.breastfeeds = snapshot.docs.map((breastfeedDocument) => {
      const data = breastfeedDocument.data();
      return { id: breastfeedDocument.id, timestamp: data.timestamp.toDate().toISOString() };
    });
    renderPage();
  }, (error) => showToast(firebaseErrorMessage(error)));

  const pumpsQuery = query(collection(db, "families", FAMILY_ID, "pumps"), orderBy("timestamp", "desc"));
  onSnapshot(pumpsQuery, (snapshot) => {
    state.pumps = snapshot.docs.map((pumpDocument) => {
      const data = pumpDocument.data();
      return { id: pumpDocument.id, amount: data.amount, timestamp: data.timestamp.toDate().toISOString() };
    });
    renderPage();
  }, (error) => showToast(firebaseErrorMessage(error)));
}

function getAllEntries() {
  return [
    ...state.feeds.map((feed) => ({ ...feed, kind: "feed", collection: "feeds" })),
    ...state.breastfeeds.map((breastfeed) => ({ ...breastfeed, kind: "breastfeed", collection: "breastfeeds" })),
    ...state.pumps.map((pump) => ({ ...pump, kind: "pump", collection: "pumps" }))
  ].sort((first, second) => new Date(second.timestamp) - new Date(first.timestamp));
}

function renderLog() {
  const selectedDate = $("logDate").value;
  const entries = getAllEntries().filter((entry) => !selectedDate || dateKey(entry.timestamp) === selectedDate);
  const list = $("logEntries");
  list.innerHTML = "";
  if (!entries.length) {
    list.innerHTML = '<li class="empty-list">Tälle päivälle ei ole merkintöjä.</li>';
    return;
  }
  const entriesByDay = new Map();
  entries.forEach((entry) => {
    const entryDay = dateKey(entry.timestamp);
    if (!entriesByDay.has(entryDay)) entriesByDay.set(entryDay, []);
    entriesByDay.get(entryDay).push(entry);
  });
  entriesByDay.forEach((dailyEntries, day) => {
    const dayGroup = document.createElement("li");
    dayGroup.className = "log-day-group";
    const details = document.createElement("details");
    details.open = day === dateKey(new Date()) || Boolean(selectedDate);
    const summary = document.createElement("summary");
    summary.className = "log-day-summary";
    const total = dailyEntries
      .filter((entry) => entry.kind === "feed")
      .reduce((sum, entry) => sum + entry.amount, 0);
    summary.innerHTML = `<span>${new Intl.DateTimeFormat("fi-FI", { weekday: "long", day: "numeric", month: "numeric" }).format(new Date(dailyEntries[0].timestamp))}</span><strong>Yhteensä ${total} ml</strong>`;
    const dailyList = document.createElement("ol");
    dailyList.className = "log-day-entries";
    dailyEntries.forEach((entry) => {
      const entryDetails = entry.kind === "feed"
        ? { title: `${entry.amount} ml`, label: entry.type === "breast" ? "Äidinmaito" : "Korvike", className: entry.type }
        : entry.kind === "pump"
          ? { title: `${entry.amount} ml`, label: "Pumppaus", className: "pump" }
          : { title: "Imetys", label: "Aloitettu", className: "breastfeed" };
      const item = document.createElement("li");
      item.innerHTML = `<button class="log-entry" type="button" data-entry-id="${entry.id}" data-entry-kind="${entry.kind}"><span class="feed-meta"><i class="type-dot ${entryDetails.className}"></i><span><strong>${entryDetails.title}</strong><br><small>${entryDetails.label}</small></span></span><time datetime="${entry.timestamp}">${formatDateTime(entry.timestamp)}</time></button>`;
      dailyList.appendChild(item);
    });
    details.append(summary, dailyList);
    dayGroup.appendChild(details);
    list.appendChild(dayGroup);
  });
}

function openEditDialog(entry) {
  const isMeasured = entry.kind !== "breastfeed";
  $("editHeading").textContent = entry.kind === "feed" ? "Muokkaa syöttöä" : entry.kind === "pump" ? "Muokkaa pumppausta" : "Muokkaa imetystä";
  $("editTypeField").hidden = entry.kind !== "feed";
  $("editAmountField").hidden = !isMeasured;
  $("editAmount").required = isMeasured;
  $("editAmount").value = isMeasured ? entry.amount : "";
  setMilkType("editMilkTypeSwitch", "editMilkType", entry.kind === "feed" ? entry.type : "breast");
  $("editTime").value = localDateTimeValue(new Date(entry.timestamp));
  $("editDialog").dataset.entryId = entry.id;
  $("editDialog").dataset.entryKind = entry.kind;
  $("editDialog").showModal();
}

function attachLogEditor(list) {
  attachMilkSwitch("editMilkTypeSwitch", "editMilkType");
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-entry-id]");
    if (!button) return;
    const entry = getAllEntries().find((item) => item.id === button.dataset.entryId && item.kind === button.dataset.entryKind);
    if (entry) openEditDialog(entry);
  });
  $("closeEdit").addEventListener("click", () => $("editDialog").close());
  $("editForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const dialog = $("editDialog");
    const kind = dialog.dataset.entryKind;
    const entryId = dialog.dataset.entryId;
    const timestamp = normalizeTimeInput($("editTime"));
    const requiresAmount = kind !== "breastfeed";
    const amount = Number($("editAmount").value);
    if (!entryId || !timestamp || (requiresAmount && !amount)) return;
    const collectionName = kind === "feed" ? "feeds" : kind === "pump" ? "pumps" : "breastfeeds";
    const changes = {
      timestamp: Timestamp.fromDate(new Date(timestamp)),
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid
    };
    if (kind === "feed") {
      changes.amount = amount;
      changes.type = $("editMilkType").value;
    }
    if (kind === "pump") changes.amount = amount;
    try {
      await updateDoc(doc(db, "families", FAMILY_ID, collectionName, entryId), changes);
      dialog.close();
      showToast("Merkintä päivitetty.");
    } catch (error) {
      showToast(firebaseErrorMessage(error));
    }
  });
  $("deleteLogEntry").addEventListener("click", async () => {
    const dialog = $("editDialog");
    const kind = dialog.dataset.entryKind;
    const entryId = dialog.dataset.entryId;
    if (!entryId || !window.confirm("Poistetaanko merkintä pysyvästi?")) return;
    const collectionName = kind === "feed" ? "feeds" : kind === "pump" ? "pumps" : "breastfeeds";
    try {
      await deleteDoc(doc(db, "families", FAMILY_ID, collectionName, entryId));
      dialog.close();
      showToast("Merkintä poistettu.");
    } catch (error) {
      showToast(firebaseErrorMessage(error));
    }
  });
}

function attachPageActions() {
  const signOutButton = $("signOutButton");
  if (signOutButton) {
    signOutButton.addEventListener("click", async () => {
      try {
        await signOut(auth);
      } catch (error) {
        showToast(firebaseErrorMessage(error));
      }
    });
  }

  if (page === "settings") {
    const themePreference = window.PeepooTheme.getPreference();
    document.querySelector(`input[name="themePreference"][value="${themePreference}"]`).checked = true;
    document.querySelectorAll('input[name="themePreference"]').forEach((input) => {
      input.addEventListener("change", () => window.PeepooTheme.setPreference(input.value));
    });
  }

  if (page === "home") {
    $("feedTime").value = localDateTimeValue(roundToQuarter());
    $("breastfeedTime").value = localDateTimeValue(roundToQuarter());
    $("pumpTime").value = localDateTimeValue(roundToQuarter());
    attachMilkSwitch("milkTypeSwitch", "milkType");
    window.setInterval(renderLastFeedTime, 60000);
    document.querySelectorAll("[data-entry-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.entryMode;
        document.querySelectorAll("[data-entry-mode]").forEach((entryButton) => {
          const isActive = entryButton === button;
          entryButton.classList.toggle("active", isActive);
          entryButton.setAttribute("aria-selected", String(isActive));
        });
        document.querySelectorAll("[data-entry-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.entryPanel !== mode;
        });
      });
    });
    $("quickAmounts").addEventListener("click", (event) => {
      const button = event.target.closest("[data-amount]");
      if (!button) return;
      $("amount").value = button.dataset.amount;
      $("amount").focus();
    });
    $("feedForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
      if (submitButton.disabled) return;
      submitButton.disabled = true;
      const amount = Number($("amount").value);
      const timestamp = normalizeTimeInput($("feedTime"));
      if (!amount || !timestamp) {
        submitButton.disabled = false;
        return;
      }
      try {
        await addDoc(collection(db, "families", FAMILY_ID, "feeds"), {
          amount,
          type: $("milkType").value,
          timestamp: Timestamp.fromDate(new Date(timestamp)),
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser.uid
        });
        $("amount").value = "";
        $("feedTime").value = localDateTimeValue(roundToQuarter());
        showToast("Syöttö tallennettu.");
      } catch (error) {
        showToast(firebaseErrorMessage(error));
      } finally {
        submitButton.disabled = false;
      }
    });
    $("breastfeedForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
      if (submitButton.disabled) return;
      submitButton.disabled = true;
      const timestamp = normalizeTimeInput($("breastfeedTime"));
      if (!timestamp) {
        submitButton.disabled = false;
        return;
      }
      try {
        await addDoc(collection(db, "families", FAMILY_ID, "breastfeeds"), {
          timestamp: Timestamp.fromDate(new Date(timestamp)),
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser.uid
        });
        $("breastfeedTime").value = localDateTimeValue(roundToQuarter());
        showToast("Imetys kirjattu.");
      } catch (error) {
        showToast(firebaseErrorMessage(error));
      } finally {
        submitButton.disabled = false;
      }
    });
    $("pumpForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
      if (submitButton.disabled) return;
      submitButton.disabled = true;
      const amount = Number($("pumpAmount").value);
      const timestamp = normalizeTimeInput($("pumpTime"));
      if (!amount || !timestamp) {
        submitButton.disabled = false;
        return;
      }
      try {
        await addDoc(collection(db, "families", FAMILY_ID, "pumps"), {
          amount,
          timestamp: Timestamp.fromDate(new Date(timestamp)),
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser.uid
        });
        $("pumpAmount").value = "";
        $("pumpTime").value = localDateTimeValue(roundToQuarter());
        showToast("Pumppaus kirjattu.");
      } catch (error) {
        showToast(firebaseErrorMessage(error));
      } finally {
        submitButton.disabled = false;
      }
    });
    attachLogEditor($("recentFeeds"));
  }

  if (page === "stats") {
    $("refreshButton").addEventListener("click", () => {
      renderStats();
      showToast("Tilastot päivitetty.");
    });
  }

  if (page === "growth") {
    $("measurementForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const weightText = $("weight").value.replace(",", ".");
      const heightText = $("height").value.replace(",", ".");
      const weight = weightText ? Number(weightText) : null;
      const height = heightText ? Number(heightText) : null;
      if (!weight && !height) {
        showToast("Lisää paino tai pituus.");
        return;
      }
      try {
        await addDoc(collection(db, "families", FAMILY_ID, "measurements"), {
          weight,
          height,
          timestamp: Timestamp.now(),
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser.uid
        });
        showToast("Kasvumitat tallennettu.");
      } catch (error) {
        showToast(firebaseErrorMessage(error));
      }
    });
    $("measurementsTable").addEventListener("click", (event) => {
      const button = event.target.closest("[data-measurement-id]");
      if (!button) return;
      const measurement = state.measurements.find((entry) => entry.id === button.dataset.measurementId);
      if (measurement) openMeasurementDialog(measurement);
    });
    $("closeMeasurementEdit").addEventListener("click", () => $("measurementDialog").close());
    $("editMeasurementForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const measurementId = $("measurementDialog").dataset.measurementId;
      const weightText = $("editWeight").value.replace(",", ".");
      const heightText = $("editHeight").value.replace(",", ".");
      const weight = weightText ? Number(weightText) : null;
      const height = heightText ? Number(heightText) : null;
      const timestamp = normalizeTimeInput($("editMeasurementTime"));
      if (!measurementId || (!weight && !height) || !timestamp) return;
      try {
        await updateDoc(doc(db, "families", FAMILY_ID, "measurements", measurementId), {
          weight,
          height,
          timestamp: Timestamp.fromDate(new Date(timestamp)),
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser.uid
        });
        $("measurementDialog").close();
        showToast("Mittaus päivitetty.");
      } catch (error) {
        showToast(firebaseErrorMessage(error));
      }
    });
  }

  if (page === "log") {
    $("logDate").addEventListener("change", renderLog);
    $("clearLogDate").addEventListener("click", () => {
      $("logDate").value = "";
      renderLog();
    });
    attachLogEditor($("logEntries"));
  }
}

function attachLogin() {
  $("loginButton").addEventListener("click", async () => {
    const button = $("loginButton");
    button.disabled = true;
    showLoginError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      showLoginError(firebaseErrorMessage(error));
      button.disabled = false;
    }
  });
}

onAuthStateChanged(auth, (user) => {
  if (page === "login") {
    if (user) window.location.replace("index.html");
    return;
  }
  if (!user) {
    window.location.replace("kirjaudu.html");
    return;
  }
  document.querySelector(".protected-content").hidden = false;
  prepareQuarterHourInputs();
  attachPageActions();
  subscribeToData();
});

if (page === "login") attachLogin();
