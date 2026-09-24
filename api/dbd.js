export default async function handler(req, res) {
  try {
    const apiKey = process.env.STEAM_API_KEY;

    if (!apiKey) {
      return res.status(500).send("❌ STEAM_API_KEY не настроен.");
    }

    let steamId = req.query.steamid || process.env.STEAM_ID;

    if (!steamId) {
      return res.status(400).send("❌ Steam-профиль не указан.");
    }

    steamId = String(steamId);

    // Если передан прямой SteamID
    if (/^\d{17}$/.test(steamId)) {
      // Уже правильный SteamID
    } else {
      // Если передана ссылка на профиль
      let profileUrl = steamId;

      try {
        profileUrl = decodeURIComponent(profileUrl);
      } catch {}

      // Профиль вида /profiles/7656119...
      const profileMatch = profileUrl.match(
        /steamcommunity\.com\/profiles\/(\d{17})/
      );

      if (profileMatch) {
        steamId = profileMatch[1];
      } else {
        // Профиль вида /id/username
        const vanityMatch = profileUrl.match(
          /steamcommunity\.com\/id\/([^/?#]+)/i
        );

        if (!vanityMatch) {
          return res
            .status(400)
            .send("❌ Неверная ссылка на Steam-профиль.");
        }

        const vanityUrl =
          `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?` +
          `key=${encodeURIComponent(apiKey)}` +
          `&vanityurl=${encodeURIComponent(vanityMatch[1])}` +
          `&format=json`;

        const vanityResponse = await fetch(vanityUrl);

        if (!vanityResponse.ok) {
          return res
            .status(502)
            .send("❌ Steam не смог определить профиль.");
        }

        const vanityData = await vanityResponse.json();

        if (
          vanityData?.response?.success !== 1 ||
          !vanityData?.response?.steamid
        ) {
          return res
            .status(404)
            .send("❌ Steam-профиль не найден.");
        }

        steamId = vanityData.response.steamid;
      }
    }

    // Профиль Steam
    const profileUrl =
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?` +
      `key=${encodeURIComponent(apiKey)}` +
      `&steamids=${encodeURIComponent(steamId)}` +
      `&format=json`;

    // Игры и время
    const gamesUrl =
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?` +
      `key=${encodeURIComponent(apiKey)}` +
      `&steamid=${encodeURIComponent(steamId)}` +
      `&format=json&include_appinfo=true`;

    // Статы DBD
    const statsUrl =
      `https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v0002/?` +
      `appid=381210` +
      `&key=${encodeURIComponent(apiKey)}` +
      `&steamid=${encodeURIComponent(steamId)}` +
      `&format=json`;

    const [
      profileResponse,
      gamesResponse,
      statsResponse
    ] = await Promise.all([
      fetch(profileUrl),
      fetch(gamesUrl),
      fetch(statsUrl)
    ]);

    if (!profileResponse.ok || !statsResponse.ok) {
      return res.status(502).send("❌ Ошибка Steam API.");
    }

    const profileData = await profileResponse.json();
    const statsData = await statsResponse.json();

    // Никнейм
    const player = profileData?.response?.players?.[0];
    const nickname = player?.personaname || "Steam";

    // Время игры
    let playtime = "Время игры скрыто";

    if (gamesResponse.ok) {
      const gamesData = await gamesResponse.json();
      const games = gamesData?.response?.games;

      if (Array.isArray(games)) {
        const dbdGame = games.find(
          game => Number(game.appid) === 381210
        );

        if (dbdGame && dbdGame.playtime_forever != null) {
          const hours =
            Number(dbdGame.playtime_forever) / 60;

          playtime = `${hours.toFixed(1)} ч`;
        }
      }
    }

    // Получаем статы
    const stats =
      statsData?.playerstats?.stats || [];

    function getStat(name) {
      const stat = stats.find(
        item => item.name === name
      );

      if (!stat || stat.value == null) {
        return 0;
      }

      const value = Number(stat.value);

      return Number.isFinite(value)
        ? value
        : 0;
    }

    // Пипы
    const killerPips =
      getStat("DBD_KillerSkulls");

    const survivorPips =
      getStat("DBD_CamperSkulls");

    // Убийства + жертвы
    const killed =
      getStat("DBD_KilledCampers");

    const sacrificed =
      getStat("DBD_SacrificedCampers");

    const totalKills =
      killed + sacrificed;

    // Генераторы
    const generators =
      getStat("DBD_GeneratorPct_float");

    // Максимальный престиж
    const maxPrestige =
      getStat("DBD_BloodwebMaxPrestigeLevel");

    // Полная шкала из 20 рангов
    function getRank(pips) {
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

    const killerRank =
      getRank(killerPips);

    const survivorRank =
      getRank(survivorPips);

    // Итог
    const message =
      `👤 ${nickname}` +
      ` | ⏱ ${playtime}` +
      ` | 🔪 ${killerRank}` +
      ` | 🧑 ${survivorRank}` +
      ` | ☠️ Убийства: ${totalKills}` +
      ` | ⚙️ Генераторов: ${Math.round(generators)}` +
      ` | 🩸 Макс. престиж: ${maxPrestige}`;

    res.setHeader(
      "Content-Type",
      "text/plain; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=300"
    );

    return res
      .status(200)
      .send(message);

  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .send("❌ Ошибка при получении данных.");
  }
}
