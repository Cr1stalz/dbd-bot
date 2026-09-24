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

    // Steam API: профиль
    const profileUrl =
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/` +
      `?key=${encodeURIComponent(apiKey)}` +
      `&steamids=${encodeURIComponent(steamId)}`;

    // Steam API: список игр и время
    const gamesUrl =
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/` +
      `?key=${encodeURIComponent(apiKey)}` +
      `&steamid=${encodeURIComponent(steamId)}` +
      `&format=json&include_appinfo=true`;

    const [profileResponse, gamesResponse] = await Promise.all([
      fetch(profileUrl),
      fetch(gamesUrl)
    ]);

    if (!profileResponse.ok || !gamesResponse.ok) {
      return res.status(502).send("❌ Ошибка Steam API.");
    }

    const profileData = await profileResponse.json();
    const gamesData = await gamesResponse.json();

    // =========================
    // НИК
    // =========================

    const player = profileData?.response?.players?.[0];

    const nickname =
      player?.personaname || "Steam";

    // =========================
    // ВРЕМЯ ИГРЫ
    // =========================

    const games = gamesData?.response?.games;

    let playtime = "Время игры скрыто";

    if (Array.isArray(games)) {
      const dbdGame = games.find(
        (game) => Number(game.appid) === 381210
      );

      if (dbdGame && dbdGame.playtime_forever != null) {
        const hours =
          Number(dbdGame.playtime_forever) / 60;

        playtime = `${hours.toFixed(1)} ч`;
      }
    }

    // =========================
    // РАНГИ
    // =========================
    //
    // Steam Web API не отдаёт текущий
    // ранг убийцы/выжившего DBD.
    //
    // Пока оставляем "—".
    // Когда подключим источник рангов,
    // эти значения будут автоматически заменены.
    //

    const killerRank = "—";
    const survivorRank = "—";

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

    return res.status(500).send(
      "❌ Ошибка при получении данных."
    );
  }
}
