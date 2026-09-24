export default async function handler(req, res) {
  try {
    const apiKey = process.env.STEAM_API_KEY;
    const steamId = req.query.steamid || process.env.STEAM_ID;

    if (!apiKey) {
      return res.status(500).send("❌ STEAM_API_KEY не настроен.");
    }

    if (!steamId) {
      return res.status(400).send("❌ SteamID не настроен.");
    }

    const profileUrl =
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?` +
      `key=${encodeURIComponent(apiKey)}` +
      `&steamids=${encodeURIComponent(steamId)}`;

    const gamesUrl =
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?` +
      `key=${encodeURIComponent(apiKey)}` +
      `&steamid=${encodeURIComponent(steamId)}` +
      `&format=json&include_appinfo=true`;

    const statsUrl =
      `https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v0002/?` +
      `appid=381210` +
      `&key=${encodeURIComponent(apiKey)}` +
      `&steamid=${encodeURIComponent(steamId)}` +
      `&format=json`;

    const [profileResponse, gamesResponse, statsResponse] =
      await Promise.all([
        fetch(profileUrl),
        fetch(gamesUrl),
        fetch(statsUrl)
      ]);

    if (!profileResponse.ok || !gamesResponse.ok || !statsResponse.ok) {
      return res.status(502).send("❌ Ошибка Steam API.");
    }

    const profileData = await profileResponse.json();
    const gamesData = await gamesResponse.json();
    const statsData = await statsResponse.json();

    // =========================
    // ИМЯ
    // =========================

    const player = profileData?.response?.players?.[0];
    const nickname = player?.personaname || "Steam";

    // =========================
    // ВРЕМЯ ИГРЫ
    // =========================

    const games = gamesData?.response?.games;

    let playtime = "Время игры скрыто";

    if (Array.isArray(games)) {
      const dbdGame = games.find(
        game => Number(game.appid) === 381210
      );

      if (
        dbdGame &&
        dbdGame.playtime_forever != null
      ) {
        const hours = Number(dbdGame.playtime_forever) / 60;
        playtime = `${hours.toFixed(1)} ч`;
      }
    }

    // =========================
    // STEAM СТАТИСТИКА DBD
    // =========================

    const stats = statsData?.playerstats?.stats || [];

    function getStat(name) {
      const stat = stats.find(item => item.name === name);

      if (!stat || stat.value == null) {
        return null;
      }

      const value = Number(stat.value);

      return Number.isFinite(value) ? value : null;
    }

    // Настоящие поля Grade.
    const killerGradeValue =
      getStat("DBD_SlasherTierIncrement");

    const survivorGradeValue =
      getStat("DBD_UnlockRanking");

    // =========================
    // GRADE
    // =========================

    /*
      Steam хранит Grade как числовое значение.

      ВАЖНО:
      DBD_KillerSkulls и DBD_CamperSkulls здесь
      специально НЕ используются.

      Если Steam не отдаёт соответствующее поле,
      показываем "Нет данных", а не выдумываем Grade.
    */

    function getGrade(value) {
      if (value === null) {
        return "Нет данных";
      }

      /*
        На этом этапе не делаем неправильное
        преобразование большого накопительного значения
        напрямую в Bronze/Silver/Gold.

        Значение сохраняем для диагностики.
      */

      return `Steam: ${value}`;
    }

    const killerRank = getGrade(killerGradeValue);
    const survivorRank = getGrade(survivorGradeValue);

    // =========================
    // ОТВЕТ
    // =========================

    const message =
      `👤 ${nickname}` +
      ` | ⏱ ${playtime}` +
      ` | 🔪 ${killerRank}` +
      ` | 🧑 ${survivorRank}`;

    res.setHeader(
      "Content-Type",
      "text/plain; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=300"
    );

    return res.status(200).send(message);

  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .send("❌ Ошибка при получении данных.");
  }
}
