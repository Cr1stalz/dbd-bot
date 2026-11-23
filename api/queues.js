// Текстовый ответ с очередями Dead by Daylight на русском.
// Для чата Twitch/Discord и команд бота.
//
// Примеры:
//   /api/queues
//   /api/queues?regions=eu-central-1,eu-west-1&mode=live
//   /api/queues?regions=eu-central-1,eu-west-1,eu-west-2&only=all&title=Очереди
//
// Параметры:
//   regions — список регионов через запятую (по умолчанию eu-central-1,eu-west-1,eu-west-2)
//   mode    — live | live-event | ptb | ptb-event (по умолчанию live)
//   only    — online, чтобы скрыть офлайн-регионы (по умолчанию показываются все)
//   max     — максимум регионов в ответе (по умолчанию 4, чтобы влезло в чат)
//   title   — свой заголовок вместо «Очереди»

const API_QUEUES = "https://api2.deadbyqueue.com/queues";
const API_REGIONS = "https://api2.deadbyqueue.com/regions";
const TIMEOUT_MS = 8000;
const CACHE_TTL = 60;

const REGIONS = {
  "us-east-1":      { name: "Вирджиния",   flag: "🇺🇸" },
  "us-east-2":      { name: "Огайо",       flag: "🇺🇸" },
  "us-west-1":      { name: "Калифорния",  flag: "🇺🇸" },
  "us-west-2":      { name: "Орегон",      flag: "🇺🇸" },
  "ca-central-1":   { name: "Монреаль",    flag: "🇨🇦" },
  "eu-central-1":   { name: "Франкфурт",   flag: "🇩🇪" },
  "eu-west-1":      { name: "Дублин",      flag: "🇮🇪" },
  "eu-west-2":      { name: "Лондон",      flag: "🇬🇧" },
  "sa-east-1":      { name: "Сан-Паулу",   flag: "🇧🇷" },
  "ap-south-1":     { name: "Мумбаи",      flag: "🇮🇳" },
  "ap-east-1":      { name: "Гонконг",     flag: "🇭🇰" },
  "ap-northeast-1": { name: "Токио",       flag: "🇯🇵" },
  "ap-northeast-2": { name: "Сеул",        flag: "🇰🇷" },
  "ap-southeast-1": { name: "Сингапур",    flag: "🇸🇬" },
  "ap-southeast-2": { name: "Сидней",      flag: "🇦🇺" }
};

const MODES = {
  "live":       "обычный режим",
  "live-event": "режим события",
  "ptb":        "PTB",
  "ptb-event":  "PTB · событие"
};

const DEFAULT_REGIONS = ["eu-central-1", "eu-west-1", "eu-west-2"];

function fmtTime(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}с`;

  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m}м ${rest}с` : `${m}м`;

  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}ч ${mm}м` : `${h}ч`;
}

function parseList(value) {
  if (Array.isArray(value)) value = value[0];
  if (typeof value !== "string" || !value.trim()) return DEFAULT_REGIONS;

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMode(value) {
  if (Array.isArray(value)) value = value[0];
  return MODES[value] ? value : "live";
}

async function fetchJson(url, signal) {
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function cell(raw, deadLabel) {
  if (raw === "x" || raw === null || raw === undefined || raw === "") {
    return deadLabel || "нет данных";
  }

  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) return deadLabel || "нет данных";

  return fmtTime(seconds);
}

export default async function handler(req, res) {
  const query = req.query || {};
  const regions = parseList(query.regions);
  const mode = parseMode(query.mode);
  const showOffline = query.only !== "online";
  const title = (Array.isArray(query.title) ? query.title[0] : query.title) || "Очереди";

  let max = Number(Array.isArray(query.max) ? query.max[0] : query.max) || 4;
  max = Math.min(15, Math.max(1, Math.floor(max)));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const [queues, enabled] = await Promise.all([
      fetchJson(API_QUEUES, controller.signal),
      fetchJson(API_REGIONS, controller.signal)
    ]);

    const modeData = (queues.queues && queues.queues[mode]) || {};
    const enabledMap = (enabled && enabled.regions) || {};

    const parts = [];

    for (const code of regions) {
      const info = REGIONS[code] || { name: code, flag: "🌐" };
      const regionEnabled = enabledMap[code] !== false;
      const entry = modeData[code];
      const hasTimes = entry && (entry.killer || entry.survivor);

      if (!regionEnabled) {
        if (showOffline) parts.push(`${info.flag} ${info.name} — не в сети`);
        continue;
      }

      if (!hasTimes) {
        if (showOffline) parts.push(`${info.flag} ${info.name} — нет данных`);
        continue;
      }

      const killer = cell(entry.killer && entry.killer.time);
      const survivor = cell(entry.survivor && entry.survivor.time);

      parts.push(`${info.flag} ${info.name} — 🔪 ${killer} / 🏃 ${survivor}`);
    }

    const head = `⏳ ${title} (${MODES[mode]})`;

    let list = parts;
    if (list.length > max) {
      const hidden = list.length - max;
      list = list.slice(0, max);
      list.push(`и ещё ${hidden}`);
    }

    const text = list.length
      ? `${head}: ${list.join(" · ")}`
      : `${head}: сейчас нет данных по выбранным регионам`;

    if (CACHE_TTL > 0) {
      res.setHeader(
        "Cache-Control",
        `public, s-maxage=${CACHE_TTL}, stale-while-revalidate=${CACHE_TTL * 4}`
      );
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(text);
  } catch (error) {
    console.error(error);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send("❌ Не удалось получить данные об очередях. Попробуй позже.");
  } finally {
    clearTimeout(timer);
  }
}
