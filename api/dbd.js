export default async function handler(req, res) {
  try {
    const { steamid, profile, format } = req.query;

    let steamId = steamid;

    /*
     * Если передана ссылка на Steam-профиль
     */
    if (steamId) {
      steamId = decodeURIComponent(steamId).trim();

      const profileMatch = steamId.match(
        /steamcommunity\.com\/profiles\/(\d+)/i
      );

      if (profileMatch) {
        steamId = profileMatch[1];
      } else {
        const vanityMatch = steamId.match(
          /steamcommunity\.com\/id\/([^/?#]+)/i
        );

        if (vanityMatch) {
          const vanity = vanityMatch[1];

          const apiKey = process.env.STEAM_API_KEY;

          if (!apiKey) {
            return res.status(200).send(
              "❌ Steam API key не настроен на Vercel."
            );
          }

          const resolveUrl =
            `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/` +
            `?key=${encodeURIComponent(apiKey)}` +
            `&vanityurl=${encodeURIComponent(vanity)}`;

          const resolveResponse = await fetch(resolveUrl);

          if (!resolveResponse.ok) {
            return res.status(200).send(
              "❌ Не удалось определить SteamID."
            );
          }

          const resolveData = await resolveResponse.json();

          if (
            !resolveData.response ||
            resolveData.response.success !== 1 ||
            !resolveData.response.steamid
          ) {
            return res.status(200).send(
              "❌ Не удалось определить SteamID."
            );
          }

          steamId = resolveData.response.steamid;
        }
      }
    }

    /*
     * Поддержка параметра profile=
     */
    if (!steamId && profile) {
      steamId = decodeURIComponent(profile).trim();

      const profileMatch = steamId.match(
        /steamcommunity\.com\/profiles\/(\d+)/i
      );

      if (profileMatch) {
        steamId = profileMatch[1];
      } else {
        const vanityMatch = steamId.match(
          /steamcommunity\.com\/id\/([^/?#]+)/i
        );

        if (vanityMatch) {
          const vanity = vanityMatch[1];

          const apiKey = process.env.STEAM_API_KEY;

          if (!apiKey) {
            return res.status(200).send(
              "❌ Steam API key не настроен на Vercel."
            );
          }

          const resolveUrl =
            `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/` +
            `?key=${encodeURIComponent(apiKey)}` +
            `&vanityurl=${encodeURIComponent(vanity)}`;

          const resolveResponse = await fetch(resolveUrl);

          if (!resolveResponse.ok) {
            return res.status(200).send(
              "❌ Не удалось определить SteamID."
            );
          }

          const resolveData = await resolveResponse.json();

          if (
            !resolveData.response ||
            resolveData.response.success !== 1 ||
            !resolveData.response.steamid
          ) {
            return res.status(200).send(
              "❌ Не удалось определить SteamID."
            );
          }

          steamId = resolveData.response.steamid;
        }
      }
    }

    /*
     * Если SteamID не передан:
     * используем DEFAULT_STEAM_ID.
     *
     * Это нужно для JeetBot,
     * потому что его $(api ...) требует фиксированный URL.
     */
    if (!steamId) {
      steamId = process.env.DEFAULT_STEAM_ID;
    }

    if (!steamId) {
      return res.status(200).send(
        "❌ Укажите Steam-профиль или настройте DEFAULT_STEAM_ID."
      );
    }

    const apiKey = process.env.STEAM_API_KEY;

    if (!apiKey) {
      return res.status(200).send(
        "❌ Steam API key не настроен на Vercel."
      );
    }

    /*
     * ==========================================
     * 1. Получаем Steam-профиль
     * ==========================================
     */

    const profileUrl =
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/` +
      `?key=${encodeURIComponent(apiKey)}` +
      `&steamids=${encodeURIComponent(steamId)}`;

    const profileResponse = await fetch(profileUrl);

    if (!profileResponse.ok) {
      return res.status(200).send(
        "❌ Не удалось получить Steam-профиль."
      );
    }

    const profileData = await profileResponse.json();

    const player =
      profileData.response &&
      profileData.response.players &&
      profileData.response.players[0];

    if (!player) {
      return res.status(200).send(
        "❌ Профиль скрыт или не найден."
      );
    }

    const nickname = player.personaname || "Unknown";


    /*
     * ==========================================
     * 2. Получаем игровое время
     * ==========================================
     */

    const ownedGamesUrl =
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/` +
      `?key=${encodeURIComponent(apiKey)}` +
      `&steamid=${encodeURIComponent(steamId)}` +
      `&include_appinfo=true` +
      `&include_played_free_games=true`;

    const ownedGamesResponse = await fetch(ownedGamesUrl);

    let playtimeHours = 0;
    let playtimeAvailable = false;

    if (ownedGamesResponse.ok) {
      const ownedGamesData = await ownedGamesResponse.json();

      if (ownedGamesData.response) {
        if (Array.isArray(ownedGamesData.response.games)) {
          const dbdGame =
            ownedGamesData.response.games.find(
              game => Number(game.appid) === 381210
            );

          if (dbdGame) {
            playtimeHours =
              Number(dbdGame.playtime_forever || 0) / 60;

            playtimeAvailable = true;
          }
        }
      }
    }

    const playtimeText = playtimeAvailable
      ? `${playtimeHours.toFixed(1)} ч`
      : "Время игры скрыто";


    /*
     * ==========================================
     * 3. Получаем статистику Dead by Daylight
     * ==========================================
     */

    const statsUrl =
      `https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v0002/` +
      `?appid=381210` +
      `&key=${encodeURIComponent(apiKey)}` +
      `&steamid=${encodeURIComponent(steamId)}`;

    const statsResponse = await fetch(statsUrl);

    if (!statsResponse.ok) {
      return sendResult({
        format,
        nickname,
        playtimeText,
        statsAvailable: false
      });
    }

    const statsData = await statsResponse.json();

    if (
      !statsData.playerstats ||
      !Array.isArray(statsData.playerstats.stats)
    ) {
      return sendResult({
        format,
        nickname,
        playtimeText,
        statsAvailable: false
      });
    }

    const stats = statsData.playerstats.stats;


    function getStat(name) {
      const stat = stats.find(item => item.name === name);
      return stat ? Number(stat.value) : 0;
    }


    /*
     * ==========================================
     * Основные статистики
     * ==========================================
     */

    const sacrificed =
      getStat("DBD_SacrificedCampers");

    const killed =
      getStat("DBD_KilledCampers");

    const escapes =
      getStat("DBD_Escape");

    const hatchEscapes =
      getStat("DBD_EscapeThroughHatch");

    const bloodwebPrestige =
      getStat("DBD_BloodwebMaxPrestigeLevel");

    const generatorPct =
      getStat("DBD_GeneratorPct_float");

    const skillChecks =
      getStat("DBD_SkillCheckSuccess");

    const heals =
      getStat("DBD_UnhookOrHeal");

    const bloodwebPoints =
      getStat("DBD_BloodwebPoints");

    const killerPips =
      getStat("DBD_KillerSkulls");

    const survivorPips =
      getStat("DBD_CamperSkulls");


    /*
     * ==========================================
     * Ранги
     * ==========================================
     */

    function getGrade(pips) {
      pips = Number(pips) || 0;

      if (pips < 0) {
        pips = 0;
      }

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


    const killerGrade =
      getGrade(killerPips);

    const survivorGrade =
      getGrade(survivorPips);


    /*
     * ==========================================
     * Итоговые значения
     * ==========================================
     */

    const totalKills =
      sacrificed + killed;

    const totalEscapes =
      escapes + hatchEscapes;

    const generators =
      Math.round(generatorPct);

    const bloodPointsMillions =
      bloodwebPoints / 1000000;


    const formatNumber = number =>
      Number(number).toLocaleString("ru-RU");


    const bloodPointsText =
      bloodPointsMillions >= 1
        ? `${bloodPointsMillions.toFixed(2)} млн`
        : formatNumber(bloodwebPoints);


    /*
     * ==========================================
     * Формируем текст
     * ==========================================
     */

    const message =
      `👤 ${nickname} | ` +
      `⏱ ${playtimeText} | ` +
      `🔪 Ранг убийцы: ${killerGrade} | ` +
      `🧑 Ранг выжившего: ${survivorGrade} | ` +
      `☠️ Убийства: ${formatNumber(totalKills)} | ` +
      `🏃 Побеги: ${formatNumber(totalEscapes)} | ` +
      `⭐ Макс. престиж: ${formatNumber(bloodwebPrestige)} | ` +
      `⚙️ Генераторов: ${formatNumber(generators)} | ` +
      `🩸 Очки крови: ${bloodPointsText}`;


    /*
     * ==========================================
     * JSON для JeetBot
     * ==========================================
     */

    if (
      format === "json" ||
      format === "jeetbot"
    ) {
      res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
      );

      res.setHeader(
        "Cache-Control",
        "s-maxage=15, stale-while-revalidate=60"
      );

      return res.status(200).json({
        success: true,
        message,
        nickname,
        playtime: playtimeText,
        killerGrade,
        survivorGrade,
        kills: totalKills,
        escapes: totalEscapes,
        prestige: bloodwebPrestige,
        generators,
        bloodPoints: bloodPointsText
      });
    }


    /*
     * ==========================================
     * Обычный текстовый ответ
     * ==========================================
     */

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

    console.error(
      "DBD API ERROR:",
      error
    );

    return res.status(200).send(
      "❌ Внутренняя ошибка API."
    );
  }
}


/*
 * ==========================================
 * Обработка ошибок / частичных результатов
 * ==========================================
 */

function sendResult({
  format,
  nickname,
  playtimeText,
  statsAvailable
}) {

  if (
    format === "json" ||
    format === "jeetbot"
  ) {

    return new Response(
      JSON.stringify({
        success: false,
        message: statsAvailable
          ? `👤 ${nickname} | ⏱ ${playtimeText}`
          : `👤 ${nickname} | ⏱ ${playtimeText} | 🎮 Игры скрыты`
      }),
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/json; charset=utf-8",

          "Cache-Control":
            "s-maxage=15, stale-while-revalidate=60"
        }
      }
    );
  }


  return new Response(
    statsAvailable
      ? `👤 ${nickname} | ⏱ ${playtimeText}`
      : `👤 ${nickname} | ⏱ ${playtimeText} | 🎮 Игры скрыты`,
    {
      status: 200,
      headers: {
        "Content-Type":
          "text/plain; charset=utf-8",

        "Cache-Control":
          "s-maxage=60, stale-while-revalidate=300"
      }
    }
  );
}
