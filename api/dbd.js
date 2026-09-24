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

    // =========================
    // STEAM API
    // =========================

    const profileUrl =
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?` +
      `key=${encodeURIComponent(apiKey)}` +
      `&steamids=${encodeURIComponent(steamId)}`;

    const gamesUrl =
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?` +
      `key=${encodeURIComponent(apiKey)}` +
      `&steamid=${encodeURIComponent(steamId)}` +
      `&format=json&include_appinfo=true`;

    // =========================
    // NIGHTLIGHT API
    // =========================

    const survivorGradeUrl =
      `https://api.nightlight.gg/v1/steam-stats/${encodeURIComponent(steamId)}/stats/survivor_grade?format=plain`;

    const killerGradeUrl =
      `https://api.nightlight.gg/v1/steam-stats/${encodeURIComponent(steamId)}/stats/killer_grade?format=plain`;

    const [
      profileResponse,
      gamesResponse,
      survivorGradeResponse,
      killerGradeResponse
    ] = await Promise.all([
      fetch(profileUrl),
      fetch(gamesUrl),
      fetch(survivorGradeUrl),
      fetch(killerGradeUrl)
    ]);

    // Steam profile обязателен.
    if (!profileResponse.ok) {
      return res.status(502).send("❌ Ошибка Steam API.");
    }

    const profileData = await profileResponse.json();

    // =========================
    // ИМЯ
    // =========================

    const player = profileData?.response?.players?.[0];
    const nickname = player?.personaname || "Steam";

    // =========================
    // ВРЕМЯ ИГРЫ
    // =========================

    let playtime = "Время игры скрыто";

    if (gamesResponse.ok) {
      const gamesData = await gamesResponse.json();
      const games = gamesData?.response?.games;

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
    }

    // =========================
    // GRADE
    // =========================

    let killerRank = "Нет данных";
    let survivorRank = "Нет данных";

    if (killerGradeResponse.ok) {
      const text = (await killerGradeResponse.text()).trim();

      if (text && !text.startsWith("{")) {
        killerRank = translateGrade(text);
      }
    }

    if (survivorGradeResponse.ok) {
      const text = (await survivorGradeResponse.text()).trim();

      if (text && !text.startsWith("{")) {
        survivorRank = translateGrade(text);
      }
    }

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


// =========================
// ПЕРЕВОД GRADE НА РУССКИЙ
// =========================

function translateGrade(grade) {
  const grades = {
    "Ash IV": "Пепел IV",
    "Ash III": "Пепел III",
    "Ash II": "Пепел II",
    "Ash I": "Пепел I",

    "Bronze IV": "Бронза IV",
    "Bronze III": "Бронза III",
    "Bronze II": "Бронза II",
    "Bronze I": "Бронза I",

    "Silver IV": "Серебро IV",
    "Silver III": "Серебро III",
    "Silver II": "Серебро II",
    "Silver I": "Серебро I",

    "Gold IV": "Золото IV",
    "Gold III": "Золото III",
    "Gold II": "Золото II",
    "Gold I": "Золото I",

    "Iridescent IV": "Радужный IV",
    "Iridescent III": "Радужный III",
    "Iridescent II": "Радужный II",
    "Iridescent I": "Радужный I"
  };

  return grades[grade] || grade;
}
