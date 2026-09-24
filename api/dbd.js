export default async function handler(req, res) {
  const API_KEY = process.env.STEAM_API_KEY;

  // ==============================
  // Форматирование больших чисел
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
        return `${(num / unit.value)
          .toFixed(2)
          .replace(/\.?0+$/, "")} ${unit.name}`;
      }
    }

    return String(Math.round(num));
  }

  // ==============================
  // Определение Grade по Pip'ам
  // ==============================
  function getGrade(pips) {
    pips = Number(pips) || 0;

    if (pips < 0) {
      pips = 0;
    }

    /*
      Grades требуют:

      Ash IV       0–2
      Ash III      3–5
      Ash II       6–9
      Ash I        10–13

      Bronze IV    14–17
      Bronze III   18–21
      Bronze II    22–25
      Bronze I     26–29

      Silver IV    30–34
      Silver III   35–39
      Silver II    40–44
      Silver I     45–49

      Gold IV      50–54
      Gold III     55–59
      Gold II      60–64
      Gold I       65–69

      Iridescent IV 70–74
      Iridescent III 75–79
      Iridescent II 80–84
      Iridescent I  85+
    */

    if (pips <= 2)  return "Пепел IV";
    if (pips <= 5)  return "Пепел III";
    if (pips <= 9)  return "Пепел II";
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

  // ==============================
  // Извлечение SteamID64
  // ==============================
  function extractSteamId(input) {
    if (!input) return null;

    input = decodeURIComponent(input.trim());

    // Просто SteamID64
    if (/^\d{17}$/.test(input)) {
      return input;
    }

    // https://steamcommunity.com/profiles/765611...
    const profileMatch = input.match(
      /steamcommunity\.com\/profiles\/(\d{17})/i
    );

    if (profileMatch) {
      return profileMatch[1];
    }

    return null;
  }

  try {
    // ==============================
    // Проверка API ключа
    // ==============================
    if (!API_KEY) {
      res.status(200).send("❌ STEAM_API_KEY не задан");
      return;
    }

    // ==============================
    // Получаем параметр steamid
    // ==============================
    let input = req.query?.steamid;

    if (Array.isArray(input)) {
      input = input[0];
    }

    if (!input) {
      res.status(200).send("❌ Укажи Steam профиль");
      return;
    }

    // ==============================
    // Определяем SteamID
    // ==============================
    let steamId = extractSteamId(input);

    // ==============================
    // Vanity URL
    // /id/username
    // ==============================
    if (!steamId) {
      const vanityMatch = input.match(
        /steamcommunity\.com\/id\/([^\/?#]+)/i
      );

      if (vanityMatch) {
        const vanity = vanityMatch[1];

        const resolveUrl =
          `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/` +
          `?key=${encodeURIComponent(API_KEY)}` +
          `&vanityurl=${encodeURIComponent(vanity)}`;

        const resolveResponse = await fetch(resolveUrl);

        if (!resolveResponse.ok) {
          res.status(200).send("❌ Профиль скрыт");
          return;
        }

        const resolveData = await resolveResponse.json();

        if (
          !resolveData.response ||
          resolveData.response.success !== 1 ||
          !resolveData.response.steamid
        ) {
          res.status(200).send("❌ Профиль скрыт");
          return;
        }

        steamId = resolveData.response.steamid;
      }
    }

    if (!steamId) {
      res.status(200).send("❌ Неверная ссылка Steam");
      return;
    }

    // ==============================
    // Получаем Steam профиль
    // ==============================
    const profileUrl =
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/` +
      `?key=${encodeURIComponent(API_KEY)}` +
      `&steamids=${encodeURIComponent(steamId)}`;

    const profileResponse = await fetch(profileUrl);

    if (!profileResponse.ok) {
      res.status(200).send("❌ Профиль скрыт");
      return;
    }

    const profileData = await profileResponse.json();

    const player = profileData?.response?.players?.[0];

    if (!player) {
      res.status(200).send("❌ Профиль скрыт");
      return;
    }

    const nickname = player.personaname || "Неизвестно";

    // ==============================
    // Получаем время игры
    // ==============================
    let playtimeHours = null;

    try {
      const gamesUrl =
        `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/` +
        `?key=${encodeURIComponent(API_KEY)}` +
        `&steamid=${encodeURIComponent(steamId)}` +
        `&format=json` +
        `&include_appinfo=true`;

      const gamesResponse = await fetch(gamesUrl);

      if (gamesResponse.ok) {
        const gamesData = await gamesResponse.json();

        const dbdGame = gamesData?.response?.games?.find(
          game => Number(game.appid) === 381210
        );

        if (
          dbdGame &&
          typeof dbdGame.playtime_forever === "number"
        ) {
          playtimeHours =
            dbdGame.playtime_forever / 60;
        }
      }
    } catch (error) {
      playtimeHours = null;
    }

    // ==============================
    // Получаем статистику DBD
    // ==============================
    const statsUrl =
      `https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v0002/` +
      `?appid=381210` +
      `&key=${encodeURIComponent(API_KEY)}` +
      `&steamid=${encodeURIComponent(steamId)}`;

    const statsResponse = await fetch(statsUrl);

    if (!statsResponse.ok) {
      res.status(200).send("❌ Профиль скрыт");
      return;
    }

    let statsData;

    try {
      statsData = await statsResponse.json();
    } catch (error) {
      res.status(200).send("❌ Профиль скрыт");
      return;
    }

    if (
      !statsData ||
      !statsData.playerstats ||
      !Array.isArray(statsData.playerstats.stats)
    ) {
      res.status(200).send("❌ Профиль скрыт");
      return;
    }

    // ==============================
    // Превращаем Steam stats в объект
    // ==============================
    const stats = {};

    for (const item of statsData.playerstats.stats) {
      stats[item.name] = Number(item.value) || 0;
    }

    // ==============================
    // Killer / Survivor Grade
    // ==============================
    const killerPips =
      stats.DBD_KillerSkulls || 0;

    const survivorPips =
      stats.DBD_CamperSkulls || 0;

    const killerGrade =
      getGrade(killerPips);

    const survivorGrade =
      getGrade(survivorPips);

    // ==============================
    // Убийства
    // ==============================
    const killedCampers =
      stats.DBD_KilledCampers || 0;

    const sacrificedCampers =
      stats.DBD_SacrificedCampers || 0;

    const totalKills =
      killedCampers + sacrificedCampers;

    // ==============================
    // Генераторы
    // ==============================
    const generators =
      Math.round(
        stats.DBD_GeneratorPct_float || 0
      );

    // ==============================
    // Максимальный престиж
    // ==============================
    const maxPrestige =
      stats.DBD_BloodwebMaxPrestigeLevel || 0;

    // ==============================
    // Побеги
    // Обычный выход + люк
    // ==============================
    const escapes =
      (stats.DBD_Escape || 0) +
      (stats.DBD_EscapeThroughHatch || 0);

    // ==============================
    // Очки крови
    // ==============================
    const bloodpoints =
      stats.DBD_BloodwebPoints || 0;

    // ==============================
    // Время игры
    // ==============================
    const playtimeText =
      playtimeHours !== null
        ? `⏱ ${playtimeHours.toFixed(1)} ч`
        : `⏱ Время игры скрыто`;

    // ==============================
    // Итоговый текст
    // ==============================
    const result =
      `👤 ${nickname}` +
      ` | ${playtimeText}` +
      ` | 🔪 Ранг убийцы: ${killerGrade}` +
      ` | 🧑 Ранг выжившего: ${survivorGrade}` +
      ` | ☠️ Убийства: ${totalKills}` +
      ` | ⚙️ Генераторов: ${generators}` +
      ` | ⭐ Макс. престиж: ${maxPrestige}` +
      ` | 🩸 Очки крови: ${formatNumber(bloodpoints)}` +
      ` | 🏃 Побеги: ${escapes}`;

    // Moobot получает HTTP 200
    res.status(200).send(result);

  } catch (error) {
    console.error(error);

    // Не выдаём 404/500 для Moobot
    res.status(200).send("❌ Профиль скрыт");
  }
}
