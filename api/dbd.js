export default async function handler(req, res) {
  try {
    const apiKey = process.env.STEAM_API_KEY;

    if (!apiKey) {
      return res.status(500).send(
        "❌ STEAM_API_KEY не настроен."
      );
    }

    let steamId = req.query.steamid || process.env.STEAM_ID;

    if (!steamId) {
      return res.status(400).send(
        "❌ Steam-профиль не указан."
      );
    }

    // =========================
    // ИСХОДНЫЙ STEAMID
    // =========================

    const originalSteamInput = String(steamId);

    try {
      steamId = decodeURIComponent(
        String(steamId)
      );
    } catch {}

    steamId = String(steamId).trim();

    // =========================
    // ОПРЕДЕЛЯЕМ STEAMID64
    // =========================

    if (/^\d{17}$/.test(steamId)) {
      // SteamID уже передан напрямую
    } else {
      // /profiles/7656119...
      const profileMatch = steamId.match(
        /steamcommunity\.com\/profiles\/(\d{17})/i
      );

      if (profileMatch) {
        steamId = profileMatch[1];
      } else {
        // /id/username
        const vanityMatch = steamId.match(
          /steamcommunity\.com\/id\/([^/?#]+)/i
        );

        if (!vanityMatch) {
          return res.status(400).send(
            `❌ Не удалось определить SteamID.

Получено:
${originalSteamInput}`
          );
        }

        const vanityUrl =
          `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?` +
          `key=${encodeURIComponent(apiKey)}` +
          `&vanityurl=${encodeURIComponent(vanityMatch[1])}` +
          `&format=json`;

        let vanityResponse;

        try {
          vanityResponse =
            await fetch(vanityUrl);
        } catch (error) {
          return res.status(502).send(
            `❌ ResolveVanityURL: ошибка соединения.

Получено:
${originalSteamInput}

Vanity:
${vanityMatch[1]}

Ошибка:
${error.message}`
          );
        }

        if (!vanityResponse.ok) {
          const body =
            await vanityResponse.text();

          return res.status(502).send(
            `❌ ResolveVanityURL: HTTP ${vanityResponse.status}

Vanity:
${vanityMatch[1]}

Ответ Steam:
${body || "{}"}`
          );
        }

        let vanityData;

        try {
          vanityData =
            await vanityResponse.json();
        } catch {
          return res.status(502).send(
            "❌ ResolveVanityURL: Steam вернул некорректный JSON."
          );
        }

        if (
          vanityData?.response?.success !== 1 ||
          !vanityData?.response?.steamid
        ) {
          return res.status(404).send(
            `❌ Steam-профиль не найден.

Vanity:
${vanityMatch[1]}

Ответ Steam:
${JSON.stringify(vanityData)}`
          );
        }

        steamId =
          vanityData.response.steamid;
      }
    }

    // =========================
    // APPID DBD
    // =========================

    const appId = 381210;

    // =========================
    // URL ЗАПРОСОВ
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

    // URL для диагностики — БЕЗ API KEY
    const safeStatsUrl =
      `https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v0002/?` +
      `appid=${appId}` +
      `&steamid=${steamId}` +
      `&format=json`;

    // =========================
    // ПРОФИЛЬ
    // =========================

    let profileResponse;

    try {
      profileResponse =
        await fetch(profileUrl);
    } catch (error) {
      return res.status(502).send(
        `❌ GetPlayerSummaries: ошибка соединения.

SteamID:
${steamId}

AppID:
${appId}

Ошибка:
${error.message}`
      );
    }

    if (!profileResponse.ok) {
      const body =
        await profileResponse.text();

      return res.status(502).send(
        `❌ GetPlayerSummaries: HTTP ${profileResponse.status}

SteamID:
${steamId}

AppID:
${appId}

Ответ Steam:
${body || "{}"}`
      );
    }

    let profileData;

    try {
      profileData =
        await profileResponse.json();
    } catch {
      return res.status(502).send(
        `❌ GetPlayerSummaries: некорректный JSON.

SteamID:
${steamId}`
      );
    }

    const player =
      profileData?.response?.players?.[0];

    if (!player) {
      return res.status(404).send(
        `❌ GetPlayerSummaries: профиль не найден.

SteamID:
${steamId}

Ответ Steam:
${JSON.stringify(profileData)}`
      );
    }

    const nickname =
      player.personaname || "Steam";

    // =========================
    // ВРЕМЯ ИГРЫ
    // =========================

    let playtime =
      "Время игры скрыто";

    let gamesResponse;

    try {
      gamesResponse =
        await fetch(gamesUrl);
    } catch (error) {
      return res.status(502).send(
        `❌ GetOwnedGames: ошибка соединения.

SteamID:
${steamId}

AppID:
${appId}

Ошибка:
${error.message}`
      );
    }

    if (gamesResponse.ok) {
      try {
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

            playtime =
              `${hours.toFixed(1)} ч`;
          }
        }
      } catch {
        playtime =
          "Время игры скрыто";
      }
    }

    // =========================
    // DBD СТАТИСТИКА
    // =========================

    let statsResponse;

    try {
      statsResponse =
        await fetch(statsUrl);
    } catch (error) {
      return res.status(502).send(
        `❌ GetUserStatsForGame: ошибка соединения.

SteamID:
${steamId}

AppID:
${appId}

URL без API-ключа:
${safeStatsUrl}

Ошибка:
${error.message}`
      );
    }

    if (!statsResponse.ok) {
      const body =
        await statsResponse.text();

      return res.status(502).send(
        `❌ GetUserStatsForGame: HTTP ${statsResponse.status}

SteamID:
${steamId}

AppID:
${appId}

URL без API-ключа:
${safeStatsUrl}

Ответ Steam:
${body || "{}"}`
      );
    }

    let statsData;

    try {
      statsData =
        await statsResponse.json();
    } catch {
      return res.status(502).send(
        `❌ GetUserStatsForGame: некорректный JSON.

SteamID:
${steamId}

AppID:
${appId}

URL без API-ключа:
${safeStatsUrl}`
      );
    }

    if (!statsData?.playerstats) {
      return res.status(404).send(
        `❌ GetUserStatsForGame: Steam не вернул playerstats.

SteamID:
${steamId}

AppID:
${appId}

URL без API-ключа:
${safeStatsUrl}

Ответ Steam:
${JSON.stringify(statsData)}`
      );
    }

    // =========================
    // СТАТИСТИКА
    // =========================

    const stats =
      statsData.playerstats.stats || [];

    function getStat(name) {
      const stat =
        stats.find(
          item => item.name === name
        );

      if (
        !stat ||
        stat.value == null
      ) {
        return 0;
      }

      const value =
        Number(stat.value);

      return Number.isFinite(value)
        ? value
        : 0;
    }

    const killerPips =
      getStat("DBD_KillerSkulls");

    const survivorPips =
      getStat("DBD_CamperSkulls");

    const killed =
      getStat("DBD_KilledCampers");

    const sacrificed =
      getStat("DBD_SacrificedCampers");

    const totalKills =
      killed + sacrificed;

    const generators =
      getStat("DBD_GeneratorPct_float");

    const maxPrestige =
      getStat(
        "DBD_BloodwebMaxPrestigeLevel"
      );

    // =========================
    // РАНГИ
    // =========================

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

    // =========================
    // ИТОГ
    // =========================

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
      "no-store"
    );

    return res
      .status(200)
      .send(message);

  } catch (error) {
    console.error(error);

    return res.status(500).send(
      `❌ Общая ошибка Vercel: ${error.message}`
    );
  }
}
