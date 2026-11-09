export default async function handler(req, res) {
  const API_KEY = process.env.STEAM_API_KEY;
  const STEAM_HELP_URL = "https://dbd-bot-livid.vercel.app/steam-help.html";
  const DBD_APP_ID = 381210;
  const TIMEOUT_MS = 8000;

  // ==============================
  // Утилиты
  // ==============================
  function formatNumber(num) {
    num = Number(num) || 0;
    const units = [
      { value: 1e12, name: "трлн" },
      { value: 1e9, name: "млрд" },
      { value: 1e6, name: "млн" },
      { value: 1e3, name: "тыс." }
    ];
    for (const unit of units) {
      if (num >= unit.value) {
        return `${(num / unit.value).toFixed(2).replace(/\.?0+$/, "")} ${unit.name}`;
      }
    }
    return String(Math.round(num));
  }

  function getGrade(pips) {
    pips = Number(pips) || 0;
    if (pips < 0) pips = 0;
    if (pips <= 2) return "Пепел IV";
    if (pips <= 5) return "Пепел III";
    if (pips <= 9) return "Пепел II";
    if (pips <= 13) return "Пепел I";
    if (pips <= 17) return "Бронза IV";
    if (pips <= 21) return "Бронза III";
    if (pips <= 25) return "Бронза II";
    if (pips <= 29) return "Бронза I";
    if (pips <= 34) return "Серебро IV";
    if (pips <= 39) return "Серебро III";
    if (pips <= 44) return "Серебро II";
    if (pips <= 49) return "Серебро I";
    if (pips <= 54) return "Золото IV";
    if (pips <= 59) return "Золото III";
    if (pips <= 64) return "Золото II";
    if (pips <= 69) return "Золото I";
    if (pips <= 74) return "Радужный IV";
    if (pips <= 79) return "Радужный III";
    if (pips <= 84) return "Радужный II";
    return "Радужный I";
  }

  function pipsToNextGrade(pips) {
    pips = Math.max(0, Number(pips) || 0);
    const thresholds = [2, 5, 9, 13, 17, 21, 25, 29, 34, 39, 44, 49, 54, 59, 64, 69, 74, 79, 84];
    for (const t of thresholds) {
      if (pips <= t) return t - pips + 1;
    }
    return 0; // уже максимум (Радужный I)
  }

  function safeDecode(str) {
    try {
      return decodeURIComponent(str);
    } catch {
      return str;
    }
  }

  function extractSteamId(input) {
    if (!input) return null;
    input = safeDecode(input.trim());
    if (/^\d{17}$/.test(input)) return input;
    const m = input.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
    return m ? m[1] : null;
  }

  async function fetchSteam(path, params) {
    const url =
      `https://api.steampowered.com/${path}/` +
      `?key=${encodeURIComponent(API_KEY)}` +
      `&${new URLSearchParams(params)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return { ok: false, data: null };
      return { ok: true, data: await response.json() };
    } catch {
      return { ok: false, data: null };
    } finally {
      clearTimeout(timer);
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ==============================
  // HTML-обёртка
  // ==============================
  function page(title, body) {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{color-scheme:dark;--bg:#171a1e;--panel:#20252b;--text:#e7e9ec;--muted:#aeb8c4;--accent:#66c0f4;--border:#39424c;--red:#ff6570;--green:#61e59a;--gold:#ffbe3c}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}
.container{width:min(820px,calc(100% - 28px));margin:0 auto;padding:28px 0 60px}
header{padding:18px 0;border-bottom:1px solid var(--border)}
.brand{color:var(--accent);font-weight:800;font-size:18px;text-decoration:none}
.hero{margin:22px 0}
.hero h1{font-size:clamp(24px,4vw,34px);margin:6px 0;line-height:1.15}
.hero .nick{color:var(--accent)}
.hero .sub{color:var(--muted)}
a.prof{color:var(--accent)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px}
.card h2{font-size:14px;text-transform:uppercase;letter-spacing:.6px;color:var(--accent);margin:0 0 10px}
.stat{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px dashed rgba(255,255,255,.06)}
.stat:last-child{border-bottom:none}
.stat .k{color:var(--muted)}
.stat .v{font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.stat .v.pos{color:var(--green)}
.insights{display:grid;gap:10px;margin-top:16px}
.insight{background:#1a222b;border-left:3px solid var(--accent);border-radius:8px;padding:11px 14px}
.insight .tag{color:var(--gold);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
.pills{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.pill{background:#26303b;border:1px solid var(--border);border-radius:999px;padding:3px 11px;font-size:13px;color:var(--text)}
.err{color:var(--red);padding:30px 0}
</style>
</head>
<body>
<header><div class="container"><a class="brand" href="/">🎮 DBD Stats</a></div></header>
<div class="container">${body}</div>
</body>
</html>`;
  }

  function errorPage(msg) {
    return page("Ошибка", `<div class="hero"><div class="err">${esc(msg)}</div><a class="prof" href="${STEAM_HELP_URL}">Как это исправить →</a></div>`);
  }

  // ==============================
  // Основной сценарий
  // ==============================
  try {
    if (!API_KEY) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(errorPage("STEAM_API_KEY не задан"));
    }

    let input = req.query?.steamid;
    if (Array.isArray(input)) input = input[0];
    if (!input) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(errorPage("Добавь параметр ?steamid=… к ссылке"));
    }

    let steamId = extractSteamId(input);
    let attemptedVanity = false;

    if (!steamId) {
      let vanity = null;
      const vanityMatch = input.match(/steamcommunity\.com\/id\/([^\/?#]+)/i);
      if (vanityMatch) vanity = vanityMatch[1];
      else if (/^[a-zA-Z0-9_-]{2,32}$/.test(input)) vanity = input;

      if (vanity) {
        attemptedVanity = true;
        const resolve = await fetchSteam("ISteamUser/ResolveVanityURL/v0001", { vanityurl: vanity });
        if (resolve.ok && resolve.data?.response?.success === 1 && resolve.data.response.steamid) {
          steamId = resolve.data.response.steamid;
        }
      }
    }

    if (!steamId) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(errorPage(attemptedVanity
        ? "Не удалось найти Steam-профиль. Проверь ссылку и настройки приватности."
        : "Неверная ссылка Steam. Используй SteamID64, ссылку /profiles/ID, /id/имя или просто имя профиля."));
    }

    const [profile, games, stats] = await Promise.all([
      fetchSteam("ISteamUser/GetPlayerSummaries/v0002", { steamids: steamId }),
      fetchSteam("IPlayerService/GetOwnedGames/v0001", {
        steamid: steamId,
        format: "json",
        include_played_free_games: 1,
        include_appinfo: 0,
        "appids_filter[0]": DBD_APP_ID
      }),
      fetchSteam("ISteamUserStats/GetUserStatsForGame/v0002", {
        appid: DBD_APP_ID,
        steamid: steamId
      })
    ]);

    const player = profile.ok ? profile.data?.response?.players?.[0] : null;
    if (!player) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(errorPage("Не удалось найти Steam-профиль."));
    }

    const nickname = player.personaname || "Неизвестно";

    let playtimeHours = null;
    if (games.ok) {
      const dbdGame = games.data?.response?.games?.find((g) => Number(g.appid) === DBD_APP_ID);
      if (dbdGame && typeof dbdGame.playtime_forever === "number") {
        playtimeHours = dbdGame.playtime_forever / 60;
      }
    }

    const statsList = stats.ok ? stats.data?.playerstats?.stats : null;
    if (!Array.isArray(statsList)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(errorPage("Статистика DBD недоступна. Убедись, что «Доступ к игровой информации» в Steam открыт."));
    }

    const stat = {};
    for (const item of statsList) stat[item.name] = Number(item.value) || 0;

    // ==============================
    // Аналитика
    // ==============================
    const bloodpoints = stat.DBD_BloodwebPoints || 0;
    const maxPrestige = stat.DBD_BloodwebMaxPrestigeLevel || 0;
    const killerPips = stat.DBD_KillerSkulls || 0;
    const survivorPips = stat.DBD_CamperSkulls || 0;
    const killerGrade = getGrade(killerPips);
    const survivorGrade = getGrade(survivorPips);

    const moriKills = stat.DBD_KilledCampers || 0;
    const sacrificed = stat.DBD_SacrificedCampers || 0;
    const totalKills = moriKills + sacrificed;

    const hatchEscapes = stat.DBD_EscapeThroughHatch || 0;
    const escapes = (stat.DBD_Escape || 0) + hatchEscapes;

    const generators = Math.round(stat.DBD_GeneratorPct_float || 0);
    const healing = Math.round(stat.DBD_HealPct_float || 0);
    const skillChecks = stat.DBD_SkillCheckSuccess || 0;
    const unhookHeal = stat.DBD_UnhookOrHeal || 0;
    const unhookPostExit = stat.DBD_UnhookOrHeal_PostExit || 0;
    const hitsNearHook = stat.DBD_HitNearHook || 0;
    const kill4 = stat.DBD_SlasherPowerKillAllCampers || 0;
    const chainsawHit = stat.DBD_ChainsawHit || 0;
    const trapPickup = stat.DBD_TrapPickup || 0;
    const uncloakAttack = stat.DBD_UncloakAttack || 0;

    const camperMatches = stat.DBD_CamperFullLoadout || 0;
    const slasherMatches = stat.DBD_SlasherFullLoadout || 0;
    const totalRoleMatches = camperMatches + slasherMatches;

    const survivorPct = totalRoleMatches ? Math.round((camperMatches / totalRoleMatches) * 100) : null;
    const killerPct = survivorPct !== null ? 100 - survivorPct : null;

    const survivalRate = camperMatches ? Math.round((escapes / camperMatches) * 100) : null;
    const bpHour = playtimeHours ? Math.round(bloodpoints / playtimeHours) : null;
    const killsHour = playtimeHours ? (totalKills / playtimeHours).toFixed(1) : null;
    const escapesHour = playtimeHours ? (escapes / playtimeHours).toFixed(1) : null;
    const gensHour = playtimeHours ? (generators / playtimeHours).toFixed(1) : null;

    // Любимый базовый киллер
    let favKiller = "—";
    if (chainsawHit >= trapPickup && chainsawHit >= uncloakAttack && chainsawHit > 0) favKiller = "Хиллбилли";
    else if (uncloakAttack > 0) favKiller = "Рейф";
    else if (trapPickup > 0) favKiller = "Траппер";

    // ==============================
    // Случайная аналитика (фан-факты)
    // ==============================
    function shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    const funFacts = [];
    if (playtimeHours !== null) {
      funFacts.push(`⏱ ${playtimeHours.toFixed(0)} часов в DBD — это ${Math.round(playtimeHours / 24)} суток без сна. Ты буквально живёшь в тумане.`);
    }
    funFacts.push(`🩸 ${formatNumber(bloodpoints)} очков крови. Если бы это были деньги — ты уже миллионер.`);
    funFacts.push(`🔪 ${formatNumber(totalKills)} убийств — больше, чем у половины киллеров из фильмов ужасов.`);
    funFacts.push(`🏃 ${formatNumber(escapes)} побегов — ты сбегал от киллера чаще, чем некоторые выходят из дома.`);
    if (skillChecks > 0) funFacts.push(`🎯 ${formatNumber(skillChecks)} скиллчеков — реакция быстрее, чем у Пищевого Бота.`);
    if (unhookHeal > 0) funFacts.push(`🤝 ${formatNumber(unhookHeal)} спасений — личный ангел-хранитель команды.`);
    if (hitsNearHook > 0) funFacts.push(`⛺ ${formatNumber(hitsNearHook)} ударов возле крюка — кемпинг-метрика, которая говорит сама за себя.`);
    if (generators > 0) funFacts.push(`⚙️ ${formatNumber(generators)} генераторов — этим можно запитать небольшой город.`);
    if (healing > 0) funFacts.push(`💊 ${formatNumber(healing)} единиц лечения — ходячая аптечка.`);
    if (hatchEscapes > 0) funFacts.push(`🕳 ${hatchEscapes} побегов через люк — мастер неожиданных исчезновений.`);
    if (maxPrestige > 0) funFacts.push(`⭐ ${maxPrestige} престиж — на это ушло примерно полжизни.`);
    if (kill4 > 0) funFacts.push(`☠️ ${kill4} раз вырезал всю команду силой киллера — безжалостно.`);

    const randomFacts = shuffle(funFacts).slice(0, 4);

    // ==============================
    // Рендер
    // ==============================
    const roleHtml = survivorPct !== null
      ? `<div class="stat"><span class="k">Роль</span><span class="v">выживший ${survivorPct}% / убийца ${killerPct}%</span></div>` +
        `<div class="stat"><span class="k">Мейн</span><span class="v">${survivorPct >= 60 ? "выживший" : survivorPct <= 40 ? "убийца" : "универсал"}</span></div>`
      : "";

    const tempoHtml = playtimeHours
      ? `<div class="stat"><span class="k">BP / час</span><span class="v pos">${formatNumber(bpHour)}</span></div>` +
        `<div class="stat"><span class="k">Убийств / час</span><span class="v">${killsHour}</span></div>` +
        `<div class="stat"><span class="k">Побегов / час</span><span class="v">${escapesHour}</span></div>` +
        `<div class="stat"><span class="k">Генераторов / час</span><span class="v">${gensHour}</span></div>`
      : `<div class="stat"><span class="k">Время игры</span><span class="v">скрыто</span></div>`;

    const killerNext = pipsToNextGrade(killerPips);
    const survivorNext = pipsToNextGrade(survivorPips);

    const body = `
<div class="hero">
  <div class="sub">Аналитика аккаунта</div>
  <h1><span class="nick">${esc(nickname)}</span></h1>
  <div class="sub">⏱ ${playtimeHours !== null ? playtimeHours.toFixed(1) + " ч" : "время скрыто"} · 🩸 ${formatNumber(bloodpoints)} BP · ⭐ Престиж ${maxPrestige} · <a class="prof" href="https://steamcommunity.com/profiles/${steamId}" target="_blank" rel="noopener noreferrer">профиль Steam ↗</a></div>
</div>

<h2 style="color:var(--accent);font-size:15px;text-transform:uppercase;letter-spacing:.6px">🎲 Случайная аналитика</h2>
<div class="insights">
  ${randomFacts.map((f) => `<div class="insight">${esc(f)}</div>`).join("")}
</div>
<div class="sub" style="margin-top:6px">обнови страницу — факты будут другие</div>

<div class="grid" style="margin-top:20px">
  <div class="card">
    <h2>Профиль</h2>
    ${roleHtml || `<div class="stat"><span class="k">Роль</span><span class="v">нет данных</span></div>`}
    <div class="stat"><span class="k">Очки крови</span><span class="v">${formatNumber(bloodpoints)}</span></div>
    <div class="stat"><span class="k">Макс. престиж</span><span class="v">${maxPrestige}</span></div>
  </div>

  <div class="card">
    <h2>Темп</h2>
    ${tempoHtml}
  </div>

  <div class="card">
    <h2>Убийца</h2>
    <div class="stat"><span class="k">Ранг</span><span class="v">${killerGrade} (${killerPips})</span></div>
    ${killerNext > 0 ? `<div class="stat"><span class="k">До следующего ранга</span><span class="v">${killerNext} пипс(а)</span></div>` : `<div class="stat"><span class="k">Ранг</span><span class="v pos">максимум</span></div>`}
    <div class="stat"><span class="k">Убийств</span><span class="v">${formatNumber(totalKills)}</span></div>
    <div class="stat"><span class="k">— мори</span><span class="v">${formatNumber(moriKills)}</span></div>
    <div class="stat"><span class="k">— жертвы</span><span class="v">${formatNumber(sacrificed)}</span></div>
    <div class="stat"><span class="k">Хиты у крюка</span><span class="v">${formatNumber(hitsNearHook)}</span></div>
    <div class="stat"><span class="k">4k силой</span><span class="v">${kill4}</span></div>
    <div class="stat"><span class="k">Любимый киллер</span><span class="v">${favKiller}</span></div>
  </div>

  <div class="card">
    <h2>Выживший</h2>
    <div class="stat"><span class="k">Ранг</span><span class="v">${survivorGrade} (${survivorPips})</span></div>
    ${survivorNext > 0 ? `<div class="stat"><span class="k">До следующего ранга</span><span class="v">${survivorNext} пипс(а)</span></div>` : `<div class="stat"><span class="k">Ранг</span><span class="v pos">максимум</span></div>`}
    <div class="stat"><span class="k">Побегов</span><span class="v">${formatNumber(escapes)}</span></div>
    <div class="stat"><span class="k">— через люк</span><span class="v">${formatNumber(hatchEscapes)}</span></div>
    ${survivalRate !== null ? `<div class="stat"><span class="k">Выживаемость</span><span class="v pos">~${survivalRate}%</span></div>` : ""}
    <div class="stat"><span class="k">Скиллчеков</span><span class="v">${formatNumber(skillChecks)}</span></div>
    <div class="stat"><span class="k">Спасений/лечений</span><span class="v">${formatNumber(unhookHeal)}</span></div>
  </div>

  <div class="card">
    <h2>Объективы</h2>
    <div class="stat"><span class="k">Генераторов</span><span class="v">${formatNumber(generators)}</span></div>
    <div class="stat"><span class="k">Лечение</span><span class="v">${formatNumber(healing)}</span></div>
    <div class="stat"><span class="k">Спасений после ворот</span><span class="v">${formatNumber(unhookPostExit)}</span></div>
  </div>
</div>
`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (process.env.NODE_ENV !== "development") {
      res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    }
    return res.status(200).send(page(`${nickname} — аналитика DBD`, body));
  } catch (error) {
    console.error(error);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(errorPage("Внутренняя ошибка. Попробуй позже."));
  }
}
