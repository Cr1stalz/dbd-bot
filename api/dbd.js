export default async function handler(req, res) {
  const API_KEY = process.env.STEAM_API_KEY;
  const STEAM_HELP_URL = "https://dbd-bot-livid.vercel.app/steam-help.html";
  const DBD_APP_ID = 381210;
  const TIMEOUT_MS = 8000; // лимит на каждый запрос к Steam
  const CACHE_TTL = 30;    // кэш CDN в секундах (поставь 0, чтобы отключить)

  const format = String(req.query?.format || "").toLowerCase();
  const asJson = format === "json";

  // ==============================
  // Сообщения (текстовые — для ботов, short — для JSON)
  // ==============================
  const MSG_NO_KEY = "❌ STEAM_API_KEY не задан";
  const MSG_NO_INPUT = "❌ Укажи Steam профиль";
  const MSG_NOT_FOUND = `❌ Не удалось найти Steam-профиль. Проверь ссылку и настройки приватности: ${STEAM_HELP_URL}`;
  const MSG_INVALID = `❌ Неверная ссылка Steam. Используй SteamID64, ссылку /profiles/ID, /id/имя или просто имя профиля. Инструкция: ${STEAM_HELP_URL}`;
  const MSG_INTERNAL = `❌ Внутренняя ошибка. Попробуй позже: ${STEAM_HELP_URL}`;

  // ==============================
  // Утилиты
  // ==============================
  // Ошибка: текст (для ботов) либо JSON (для оверлея).
  function fail(short, text, extra) {
    if (asJson) {
      return res.status(200).json({
        ok: false,
        error: short,
        help: STEAM_HELP_URL,
        ...extra
      });
    }
    return res.status(200).send(text);
  }

  const send = (text) => res.status(200).send(text);

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

  // ==============================
  // Основной сценарий
  // ==============================
  try {
    if (!API_KEY) return fail("Бот не настроен", MSG_NO_KEY);

    let input = req.query?.steamid;
    if (Array.isArray(input)) input = input[0];
    if (!input) return fail("Укажи Steam профиль", MSG_NO_INPUT);

    // ==============================
    // Определяем SteamID64
    // ==============================
    let steamId = extractSteamId(input);
    let attemptedVanity = false;

    // Vanity: полный URL /id/имя или просто имя кастомного URL (например cr1stalz_kz)
    if (!steamId) {
      let vanity = null;

      const vanityMatch = input.match(
        /steamcommunity\.com\/id\/([^\/?#]+)/i
      );

      if (vanityMatch) {
        vanity = vanityMatch[1];
      } else if (/^[a-zA-Z0-9_-]{2,32}$/.test(input)) {
        vanity = input;
      }

      if (vanity) {
        attemptedVanity = true;

        const resolve = await fetchSteam(
          "ISteamUser/ResolveVanityURL/v0001",
          { vanityurl: vanity }
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

    if (!steamId) {
      return attemptedVanity
        ? fail("Не удалось найти Steam-профиль", MSG_NOT_FOUND)
        : fail("Неверная ссылка Steam", MSG_INVALID);
    }

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

    if (!player) return fail("Не удалось найти Steam-профиль", MSG_NOT_FOUND);

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
      const statsText =
        `👤 ${nickname} | ${playtimeText} | 🎮 Статистика DBD недоступна. Проверь сведения об играх и настройки Steam: ${STEAM_HELP_URL}`;

      return fail("Статистика DBD недоступна", statsText, {
        nickname,
        playtime: { hours: playtimeHours, hidden: playtimeHours === null }
      });
    }

    // Превращаем массив Steam stats в объект
    const stat = {};
    for (const item of statsList) {
      stat[item.name] = Number(item.value) || 0;
    }

    // ==============================
    // Итоговые значения
    // ==============================
    const killerPips = stat.DBD_KillerSkulls || 0;
    const survivorPips = stat.DBD_CamperSkulls || 0;

    const killerGrade = getGrade(killerPips);
    const survivorGrade = getGrade(survivorPips);

    const totalKills =
      (stat.DBD_KilledCampers || 0) +
      (stat.DBD_SacrificedCampers || 0);

    const generators = Math.round(stat.DBD_GeneratorPct_float || 0);
    const maxPrestige = stat.DBD_BloodwebMaxPrestigeLevel || 0;

    const escapes =
      (stat.DBD_Escape || 0) +
      (stat.DBD_EscapeThroughHatch || 0);

    const bloodpoints = stat.DBD_BloodwebPoints || 0;

    // ==============================
    // Структурированные данные (для JSON / оверлея)
    // ==============================
    const data = {
      ok: true,
      nickname,
      steamid: steamId,
      profileUrl: `https://steamcommunity.com/profiles/${steamId}`,
      playtime: { hours: playtimeHours, hidden: playtimeHours === null },
      killer: { grade: killerGrade, pips: killerPips },
      survivor: { grade: survivorGrade, pips: survivorPips },
      kills: {
        killed: stat.DBD_KilledCampers || 0,
        sacrificed: stat.DBD_SacrificedCampers || 0,
        total: totalKills
      },
      escapes: {
        normal: stat.DBD_Escape || 0,
        hatch: stat.DBD_EscapeThroughHatch || 0,
        total: escapes
      },
      maxPrestige,
      generators,
      bloodpoints
    };

    // ==============================
    // Текстовый ответ (для ботов) — формат сохранён 1-в-1
    // ==============================
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

    if (asJson) {
      return res.status(200).json(data);
    }

    return send(result);
  } catch (error) {
    console.error(error);
    return fail("Внутренняя ошибка", MSG_INTERNAL);
  }
}
