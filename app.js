const EXERCISES = {
  balance: {
    name: "单脚站立",
    step: "动作 1 / 3",
    badge: "计时",
    instruction: "站在稳固支撑物旁，抬起一只脚并保持身体稳定。",
    mode: "timer",
    setting: "训练时间",
    value: 30,
    min: 10,
    max: 300,
    increment: 5,
    unit: "秒",
  },
  cross: {
    name: "单脚前后跨越",
    step: "动作 2 / 3",
    badge: "计次",
    instruction: "支撑脚保持稳定，另一只脚每完成一次前跨或后跨，点按圆盘计 1 次。",
    mode: "counter",
    setting: "目标次数",
    value: 60,
    min: 10,
    max: 200,
    increment: 5,
    unit: "次",
  },
  band: {
    name: "弹力带勾脚",
    step: "动作 3 / 3",
    badge: "计次",
    instruction: "缓慢勾脚再放松，每完成一次完整动作，点按圆盘计 1 次。",
    mode: "counter",
    setting: "目标次数",
    value: 30,
    min: 5,
    max: 200,
    increment: 5,
    unit: "次",
  },
};

const STORE_KEY = "rehab-pwa-state-v1";
const CIRCUMFERENCE = 2 * Math.PI * 96;

const state = loadState();
let session = null;
let timerId = null;
let wakeLock = null;
let toastTimer = null;

const el = (id) => document.getElementById(id);
const overlay = el("sessionOverlay");

function loadState() {
  const defaults = {
    settings: { balance: 30, cross: 60, band: 30 },
    records: [],
    sound: true,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    return {
      ...defaults,
      ...saved,
      settings: { ...defaults.settings, ...(saved?.settings || {}) },
      records: Array.isArray(saved?.records) ? saved.records : [],
    };
  } catch {
    return defaults;
  }
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(iso) {
  const date = new Date(iso);
  const today = localDateKey();
  const day = localDateKey(date) === today
    ? "今天"
    : `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${day} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function renderHome() {
  const today = new Date();
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  el("todayLabel").textContent = `${today.getMonth() + 1}月${today.getDate()}日 · ${weekdays[today.getDay()]}`;

  el("balanceMeta").textContent = `${state.settings.balance} 秒`;
  el("crossMeta").textContent = `${state.settings.cross} 次`;
  el("bandMeta").textContent = `${state.settings.band} 次`;

  const completed = new Set(
    state.records
      .filter((record) => record.dateKey === localDateKey())
      .map((record) => record.exercise)
  ).size;
  const percent = Math.round((completed / 3) * 100);
  el("todayDone").textContent = completed;
  el("todayPercent").textContent = `${percent}%`;
  el("todayRing").style.strokeDashoffset = String(113.1 * (1 - percent / 100));
  el("soundButton").setAttribute("aria-pressed", String(state.sound));
  el("soundIcon").textContent = state.sound ? "◖))" : "◖×";

  renderRecords();
}

function renderRecords() {
  const container = el("recordsList");
  const records = state.records.slice(0, 8);
  if (!records.length) {
    container.innerHTML = '<div class="empty-records">完成一次训练后，记录会出现在这里</div>';
    return;
  }
  container.innerHTML = records.map((record) => {
    const exercise = EXERCISES[record.exercise];
    return `
      <div class="record-row">
        <div class="record-main">
          <strong>${exercise.name}</strong>
          <small>${formatDateTime(record.completedAt)}</small>
        </div>
        <span class="record-value">${record.result} ${exercise.unit}</span>
      </div>`;
  }).join("");
}

function openSession(type) {
  const config = EXERCISES[type];
  session = {
    type,
    target: state.settings[type],
    current: config.mode === "timer" ? state.settings[type] : 0,
    running: false,
    finished: false,
  };

  el("sessionStep").textContent = config.step;
  el("sessionTitle").textContent = config.name;
  el("sessionBadge").textContent = config.badge;
  el("sessionInstruction").textContent = config.instruction;
  el("settingLabel").textContent = config.setting;
  el("displayUnit").textContent = config.unit;
  el("sessionProgress").style.stroke = type === "cross" ? "var(--orange)" : type === "band" ? "var(--blue)" : "var(--green)";
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  renderSession();
}

function closeSession() {
  stopTimer();
  releaseWakeLock();
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  session = null;
}

function renderSession() {
  if (!session) return;
  const config = EXERCISES[session.type];
  el("settingValue").textContent = `${session.target} ${config.unit}`;
  el("displayNumber").textContent = session.current;
  el("minusOne").disabled = config.mode === "timer" || session.current <= 0 || session.finished;
  el("settingPanel").style.opacity = session.running ? ".5" : "1";
  el("decreaseSetting").disabled = session.running;
  el("increaseSetting").disabled = session.running;

  let progress;
  if (config.mode === "timer") {
    progress = session.finished ? 1 : 1 - session.current / session.target;
    el("tapHint").textContent = session.finished ? "训练完成" : session.running ? "保持稳定" : "点击开始";
    el("mainAction").textContent = session.finished ? "再练一次" : session.running ? "暂停" : session.current < session.target ? "继续训练" : "开始训练";
  } else {
    progress = Math.min(session.current / session.target, 1);
    el("tapHint").textContent = session.finished ? "训练完成" : "每完成一次点这里";
    el("mainAction").textContent = session.finished ? "再练一次" : "＋ 计一次";
  }
  el("sessionProgress").style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progress));
}

function adjustSetting(direction) {
  if (!session || session.running) return;
  const config = EXERCISES[session.type];
  const next = Math.min(config.max, Math.max(config.min, session.target + direction * config.increment));
  session.target = next;
  session.current = config.mode === "timer" ? next : Math.min(session.current, next);
  state.settings[session.type] = next;
  saveState();
  renderSession();
  renderHome();
}

function handleMainAction() {
  if (!session) return;
  const config = EXERCISES[session.type];
  if (session.finished) {
    resetSession();
    if (config.mode === "timer") startTimer();
    return;
  }
  if (config.mode === "timer") {
    session.running ? pauseTimer() : startTimer();
  } else {
    addCount();
  }
}

function handleTargetTap() {
  if (!session) return;
  if (EXERCISES[session.type].mode === "timer") handleMainAction();
  else addCount();
}

async function startTimer() {
  if (!session || session.running) return;
  session.running = true;
  speak(session.current === session.target ? "准备，开始" : "继续");
  vibrate(40);
  await requestWakeLock();
  renderSession();
  timerId = window.setInterval(() => {
    if (!session?.running) return;
    session.current -= 1;
    if ([10, 5, 4, 3, 2, 1].includes(session.current)) speak(String(session.current));
    if (session.current <= 0) finishSession();
    renderSession();
  }, 1000);
}

function pauseTimer() {
  if (!session) return;
  session.running = false;
  stopTimer();
  releaseWakeLock();
  speak("已暂停");
  renderSession();
}

function stopTimer() {
  if (timerId) window.clearInterval(timerId);
  timerId = null;
  if (session) session.running = false;
}

function addCount() {
  if (!session || session.finished) return;
  session.current = Math.min(session.current + 1, session.target);
  vibrate(18);
  speak(String(session.current), true);
  if (session.current >= session.target) finishSession();
  renderSession();
}

function subtractCount() {
  if (!session || EXERCISES[session.type].mode === "timer" || session.finished) return;
  session.current = Math.max(0, session.current - 1);
  renderSession();
}

function resetSession() {
  if (!session) return;
  stopTimer();
  releaseWakeLock();
  const config = EXERCISES[session.type];
  session.current = config.mode === "timer" ? session.target : 0;
  session.finished = false;
  renderSession();
}

function finishSession() {
  if (!session || session.finished) return;
  stopTimer();
  releaseWakeLock();
  session.finished = true;
  session.current = session.target;
  const now = new Date();
  state.records.unshift({
    id: `${Date.now()}-${session.type}`,
    exercise: session.type,
    result: session.target,
    completedAt: now.toISOString(),
    dateKey: localDateKey(now),
  });
  state.records = state.records.slice(0, 100);
  saveState();
  renderHome();
  vibrate([80, 60, 160]);
  speak("训练完成，做得很好");
  showToast("训练完成，已保存记录");
}

function speak(text, countSpeech = false) {
  if (!state.sound || !("speechSynthesis" in window)) return;
  if (countSpeech) window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 1.08;
  window.speechSynthesis.speak(utterance);
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
  } catch { /* 浏览器不支持时继续训练 */ }
}

function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}

function showToast(message) {
  const toast = el("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

document.querySelectorAll(".exercise-card").forEach((button) => {
  button.addEventListener("click", () => openSession(button.dataset.exercise));
});
el("closeSession").addEventListener("click", closeSession);
el("decreaseSetting").addEventListener("click", () => adjustSetting(-1));
el("increaseSetting").addEventListener("click", () => adjustSetting(1));
el("mainAction").addEventListener("click", handleMainAction);
el("countTarget").addEventListener("click", handleTargetTap);
el("minusOne").addEventListener("click", subtractCount);
el("resetSession").addEventListener("click", resetSession);
el("soundButton").addEventListener("click", () => {
  state.sound = !state.sound;
  if (!state.sound && "speechSynthesis" in window) window.speechSynthesis.cancel();
  saveState();
  renderHome();
  showToast(state.sound ? "语音提示已开启" : "语音提示已关闭");
});
el("clearRecords").addEventListener("click", () => {
  if (!state.records.length) return;
  if (window.confirm("确定清空全部训练记录吗？")) {
    state.records = [];
    saveState();
    renderHome();
    showToast("记录已清空");
  }
});
overlay.addEventListener("click", (event) => {
  if (event.target === overlay) closeSession();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && session?.running) requestWakeLock();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

renderHome();
