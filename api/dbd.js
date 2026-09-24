export default async function handler(req, res) {
  try {
    const apiKey = process.env.STEAM_API_KEY;

    // =========================
    // ПРОВЕРКА API KEY
    // =========================

    if (!apiKey) {
      return res.status(200).send(
        "❌ STEAM_API_KEY не настроен."
      );
    }

    let steamId =
      req.query.steamid || process.env.STEAM_ID;

    if (!steamId) {
      return res.status(200).send(
        "❌ Steam-профиль не указан."
      );
    }

    steamId = String(steamId).trim();

    try {
      steamId = decodeURIComponent(steamId);
    } catch {}

    // =========================
    // ОПРЕДЕЛЯЕМ STEAMID64
    // =========================

    if (!/^\d{17}$/.test(steamId)) {

      const profileMatch =
        steamId.match(
          /steamcommunity\.com\/profiles\/(\d{17})/i
        );

      if (profileMatch) {
        steamId = profileMatch[1];

      } else {

        const vanityMatch =
          steamId.match(
            /steamcommunity\.com\/id\/([^/?#]+)/i
          );

        if (!vanityMatch) {
          return res.status(200).send(
            "❌ Неверная ссылка на Steam-профиль."
          );
        }

        const vanityUrl =
          `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?` +
          `key=${encodeURIComponent(apiKey)}` +
          `&vanityurl=${encodeURIComponent(vanityMatch[1])}` +
          `&format=json`;

        try {
          const vanityResponse =
            await fetch(vanityUrl);

          if (!vanityResponse.ok) {
            return res.status(200).send(
              "❌ Профиль скрыт"
            );
          }

          const vanityData =
            await vanityResponse.json();

          if (
            vanityData?.response?.success !== 1 ||
            !vanityData?.response?.steamid
          ) {
            return res.status(200).send(
              "❌ Профиль скрыт"
            );
          }

          steamId =
            vanityData.response.steamid;

        } catch {
          return res.status(200).send(
            "❌ Профиль скрыт"
          );
        }
      }
    }

    const appId = 381210;

    // =========================
    // URL STEAM API
    // =========================

    const profileUrl =
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?` +
      `key=${encodeURIComponent(apiKey)}` +
      `&steamids=${encodeURIComponent(steamId)}` +
      `&format=json`;

    const gamesUrl =
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?` +
      `key=${encodeURIComponent(apiKey)}` +
      `&steamid=${encodeURIComponent(steamId)}` +
      `&format=json&include_appinfo=true`;

    const statsUrl =
      `https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v0002/?` +
      `appid=${appId}` +
      `&key=${encodeURIComponent(apiKey)}` +
      `&steamid=${encodeURIComponent(steamId)}` +
      `&format=json`;

    // =========================
    // ПРОФИЛЬ STEAM
    // =========================

    let profileResponse;

    try {
      profileResponse =
        await fetch(profileUrl);
    } catch {
      return res.status(200).send(
        "❌ Профиль скрыт"
      );
    }

    if (!profileResponse.ok) {
      return res.status(200).send(
        "❌ Профиль скрыт"
      );
    }

    let profileData;

    try {
      profileData =
        await profileResponse.json();
    } catch {
      return res.status(200).send(
        "❌ Профиль скрыт"
      );
    }

    const player =
      profileData?.response?.players?.[0];

    if (!player) {
      return res.status(200).send(
        "❌ Профиль скрыт"
      );
    }

    const nickname =
      player.personaname || "Steam";

    // =========================
    // ВРЕМЯ ИГРЫ
    // =========================

    let playtime =
      "Время игры скрыто";

    try {
      const gamesResponse =
        await fetch(gamesUrl);

      if (gamesResponse.ok) {

        const gamesData =
          await gamesResponse.json();

        const games =
          gamesData?.response?.games;

        if (Array.isArray(games)) {

          const dbdGame =
            games.find(
              game =>
                Number(game.appid) === appId
            );

          if (
            dbdGame &&
            dbdGame.playtime_forever != null
          ) {

            const hours =
              Number(
                dbdGame.playtime_forever
              ) / 60;

            if (Number.isFinite(hours)) {
              playtime =
                `${hours.toFixed(1)} ч`;
            }
          }
        }
      }
    } catch {
      playtime =
        "Время игры скрыто";
    }

    // =========================
    // DBD СТАТИСТИКА
    // =========================

    let statsResponse;

    try {
      statsResponse =
        await fetch(statsUrl);
    } catch {
      return res.status(200).send(
        "❌ Профиль скрыт"
      );
