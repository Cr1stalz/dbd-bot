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
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/` +
      `?key=${encodeURIComponent(apiKey)}` +
      `&steamids=${encodeURIComponent(steamId)}`;

    const gamesUrl =
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/` +
      `?key=${encodeURIComponent(apiKey)}` +
      `&steamid=${encodeURIComponent(steamId)}` +
      `&format=json&include_appinfo=true`;

    const statsUrl =
      `https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v0002/` +
      `?appid=381210` +
      `&key=${encodeURIComponent(apiKey)}` +
      `&steamid=${encodeURIComponent(steamId)}` +
      `&format=json`;

    const [profileResponse, gamesResponse, statsResponse] =
      await Promise.all([
        fetch(profileUrl),
        fetch(gamesUrl),
        fetch(statsUrl)
      ]);

    if (
      !profileResponse.ok ||
      !gamesResponse.ok ||
      !statsResponse.ok
    ) {
      return res.status(502).send("❌ Ошибка Steam API.");
    }

    const profileData = await profileResponse.json();
    const gamesData = await gamesResponse.json();
    const statsData = await statsResponse.json();

    const player =
      profileData?.response?.players?.[0];

    const nickname =
      player?.personaname || "Steam";

    const games =
      gamesData?.response?.games;

    let playtime = "Время игры скрыто";

    if (Array.isArray(games)) {
      const dbdGame = games.find(
        game => Number(game.appid) === 381210
      );

      if (
        dbdGame &&
        dbdGame.playtime_forever != null
      ) {
        const hours =
          Number(dbdGame.playtime_forever) / 60;

        playtime =
          `${hours.toFixed(1)} ч`;
      }
    }

    const stats =
      statsData?.playerstats?.stats || [];

    function getStat(name) {
      const stat = stats.find(
        item => item.name === name
      );

      return stat ? Number(stat.value) : null;
    }

    const killerSkulls =
      getStat("DBD_KillerSkulls");

    const survivorSkulls =
      getStat("DBD_CamperSkulls");

    function getGrade(skulls) {
      if (skulls == null) {
        return "—";
      }

      if (skulls <= 4) return "Бронза IV";
      if (skulls <= 8) return "Бронза III";
      if (skulls <= 12) return "Бронза II";
      if (skulls <= 16) return "Бронза I";

      if (skulls <= 21) return "Серебро IV";
      if (skulls <= 26) return "Серебро III";
      if (skulls <= 31) return "Серебро II";
      if (skulls <= 36) return "Серебро I";

      if (skulls <= 41) return "Золото IV";
      if (skulls <= 46) return "Золото III";
      if (skulls <= 51) return "Золото II";
      if (skulls <= 56) return "Золото I";

      if (skulls <= 61) return "Радужный IV";
      if (skulls <= 66) return "Радужный III";
      if (skulls <= 71) return "Радужный II";

      return "Радужный I";
    }

    const killerRank =
      getGrade(killerSkulls);

    const survivorRank =
      getGrade(survivorSkulls);

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
