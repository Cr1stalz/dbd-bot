export default async function handler(req, res) {
  const API_KEY = process.env.STEAM_API_KEY;
  const STEAM_HELP_URL = "https://dbd-bot-livid.vercel.app/steam-help.html";
  const DBD_APP_ID = 381210;
  const TIMEOUT_MS = 8000; // лимит на каждый запрос к Steam
  const CACHE_TTL = 30;    // кэш CDN в секундах (поставь 0, чтобы отключить)

  // ==============================
  // Утилиты
  // ==============================
  const send = (text) => res.status(200).send(text);

  const notFound = () =>
    send(`❌ Не удалось найти Steam-профиль. Проверь ссылку и настройки приватности: ${STEAM_HELP_URL}`);

  const invalidInput = () =>
    send(`❌ Неверная ссылка Steam. Используй SteamID64 или ссылку /profiles/ID либо /id/имя. Инструкция: ${STEAM_HELP_URL}`);

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
        return `${(num / unit.value)
          .toFixed(2)
          .replace(/\.?0+$/, "")} ${unit.name}`;
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

    // Просто SteamID64
    if (/^\d{17}$/.test(input)) {
      return input;
    }

    // /profiles/SteamID64
    const profileMatch = input.match(
      /steamcommunity\.com\/profiles\/(\d{17})/i
    );

    return profileMatch ? profileMatch[1] : null;
  }

  // Запрос к Steam с таймаутом. Никогда не бросает исключение:
  // при любой ошибке возвращает { ok: false }.
  async function fetchSteam(path, params) {
    const url =
      `https://api.steampowered.com${path}/` +
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

  // ==============================
  // Основной сценарий
  // ==============================
  try {
    if (!API_KEY) return send("❌ STEAM_API_KEY не задан");

    let input = req.query?.steamid;
    if (Array.isArray(input)) input = input[0];
    if (!input) return send("❌ Укажи Steam профиль");

    // ==============================
    // Определяем SteamID64
    // ==============================
    let steamId = extractSteamId(input);
    let attemptedVanity = false;

    // Vanity URL — /id/username
    if (!steamId) {
      const vanityMatch = input.match(
        /steamcommunity\.com\/id\/([^\/?#]+)/i
      );

      if (vanityMatch) {
        attemptedVanity = true;

        const resolve = await fetchSteam(
          "ISteamUser/ResolveVanityURL/v0001",
          { vanityurl: vanityMatch[1] }
        );

        if (
          resolve.ok &&
          resolve.data?.response?.success === 1 &&
          resolve.data.response.steamid
        ) {
          steamId = resolve.data.response.steamid;
        }
      }
    }

    if (!steamId) return attemptedVanity ? notFound() : invalidInput();

    // ==============================
    // Получаем профиль, время игры и статистику
    // параллельно — все три зависят только от steamId
    // ==============================
    const [profile, games, stats] = await Promise.all([
      fetchSteam("ISteamUser/GetPlayerSummaries/v0002", {
        steamids: steamId
      }),
      fetchSteam("IPlayerService/GetOwnedGames/v0001", {
        steamid: steamId,
        format: "json",
        include_played_free_games: 1, // DBD — бесплатная игра, по умолчанию не возвращается
        include_appinfo: 0,
        "appids_filter[0]": DBD_APP_ID
      }),
      fetchSteam("ISteamUserStats/GetUserStatsForGame/v0002", {
        appid: DBD_APP_ID,
        steamid: steamId
      })
    ]);

    // ==============================
    // Никнейм
    // ==============================
    const player = profile.ok
      ? profile.data?.response?.players?.[0]
      : null;

    if (!player) return notFound();

    const nickname = player.personaname || "Неизвестно";

    // ==============================
    // Время игры DBD
    // ==============================
    let playtimeHours = null;

    if (games.ok) {
      const dbdGame = games.data?.response?.games?.find(
        (game) => Number(game.appid) === DBD_APP_ID
      );

      if (dbdGame && typeof dbdGame.playtime_forever === "number") {
        playtimeHours = dbdGame.playtime_forever / 60;
      }
    }

    const playtimeText =
      playtimeHours !== null
        ? `⏱ ${playtimeHours.toFixed(1)} ч`
        : "⏱ Время игры скрыто";

    // ==============================
    // Статистика DBD
    // ==============================
    const statsList = stats.ok
      ? stats.data?.playerstats?.stats
      : null;

    if (!Array.isArray(statsList)) {
      return send(
        `👤 ${nickname} | ${playtimeText} | 🎮 Статистика DBD недоступна. Проверь сведения об играх и настройки Steam: ${STEAM_HELP_URL}`
      );
    }

    // Превращаем массив Steam stats в объект
    const stat = {};
    for (const item of statsList) {
      stat[item.name] = Number(item.value) || 0;
    }

    // ==============================
    // Итоговые значения
    // ==============================
    const killerGrade = getGrade(stat.DBD_KillerSkulls);
    const survivorGrade = getGrade(stat.DBD_CamperSkulls);

    const totalKills =
      (stat.DBD_KilledCampers || 0) +
      (stat.DBD_SacrificedCampers || 0);

    const generators = Math.round(stat.DBD_GeneratorPct_float || 0);
    const maxPrestige = stat.DBD_BloodwebMaxPrestigeLevel || 0;

    const escapes =
      (stat.DBD_Escape || 0) +
      (stat.DBD_EscapeThroughHatch || 0);

    const bloodpoints = stat.DBD_BloodwebPoints || 0;

    const result =
      `👤 ${nickname}` +
      ` | ${playtimeText}` +
      ` | 🔪 Ранг убийцы: ${killerGrade}` +
      ` | 🧑 Ранг выжившего: ${survivorGrade}` +
      ` | ☠️ Убийства: ${totalKills}` +
      ` | 🏃 Побеги: ${escapes}` +
      ` | ⭐ Макс. престиж: ${maxPrestige}` +
      ` | ⚙️ Генераторов: ${generators}` +
      ` | 🩸 Очки крови (всего): ${formatNumber(bloodpoints)}`;

    // Кэш на CDN: повторные запросы по тому же steamid не бьют в Steam API
    if (CACHE_TTL > 0) {
      res.setHeader(
        "Cache-Control",
        `public, s-maxage=${CACHE_TTL}, stale-while-revalidate=${CACHE_TTL * 4}`
      );
    }

    return send(result);
  } catch (error) {
    console.error(error);
    return send(`❌ Внутренняя ошибка. Попробуй позже: ${STEAM_HELP_URL}`);
  }
}
