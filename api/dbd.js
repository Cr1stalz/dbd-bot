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
    }

    if (!statsResponse.ok) {
      return res.status(200).send(
        "❌ Профиль скрыт"
      );
    }

    let statsData;

    try {
      statsData =
        await statsResponse.json();
    } catch {
      return res.status(200).send(
        "❌ Профиль скрыт"
      );
    }

    if (
      !statsData ||
      !statsData.playerstats ||
      !Array.isArray(
        statsData.playerstats.stats
      )
    ) {
      return res.status(200).send(
        "❌ Профиль скрыт"
      );
    }

    const stats =
      statsData.playerstats.stats;

    // =========================
    // ПОЛУЧЕНИЕ СТАТА
    // =========================

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

    // =========================
    // DBD СТАТИСТИКА
    // =========================

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

    const bloodpoints =
      getStat(
        "DBD_BloodwebPoints"
      );

    const escape =
      getStat("DBD_Escape");

    const escapeHatch =
      getStat(
        "DBD_EscapeThroughHatch"
      );

    const totalEscapes =
      escape + escapeHatch;

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
      ` | 🔪 Ранг убийцы: ${killerRank}` +
      ` | 🧑 Ранг выжившего: ${survivorRank}` +
      ` | ☠️ Убийства: ${totalKills}` +
      ` | ⚙️ Генераторов: ${Math.round(generators)}` +
      ` | ⭐ Макс. престиж: ${maxPrestige}` +
      ` | 🩸 Очки крови: ${bloodpoints}` +
      ` | 🏃 Побеги: ${totalEscapes}`;

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

    return res.status(200).send(
      "❌ Профиль скрыт"
    );
  }
}
