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
          const hours =
            Number(dbdGame.playtime_forever) / 60;

          playtime = `${hours.toFixed(1)} ч`;
        }
      }
    }

    // =========================
    // СТАТИСТИКА DBD
    // =========================

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

    const killerPips =
      getStat("DBD_KillerSkulls");

    const survivorPips =
      getStat("DBD_CamperSkulls");

    const killed =
      getStat("DBD_KilledCampers");

    const sacrificed =
      getStat("DBD_SacrificedCampers");

    const generators =
      getStat("DBD_GeneratorPct_float");

    const maxPrestige =
      getStat("DBD_BloodwebMaxPrestigeLevel");

    // =========================
    // ПИПСЫ → СТАРЫЙ РАНГ DBD
    // =========================

    /*
      ВАЖНО:

      DBD_KillerSkulls и DBD_CamperSkulls
      являются количеством пипсов.

      Steam не хранит отдельным полем
      современный текущий Grade.

      Поэтому здесь НЕ делаем ложное
      преобразование 21/28 в текущий Grade.
    */

    function pipInfo(pips) {
      return `${pips} пип.`;
    }

    // =========================
    // ОТВЕТ
    // =========================

    const message =
      `👤 ${nickname}` +
      ` | ⏱ ${playtime}` +
      ` | 🔪 ${pipInfo(killerPips)}` +
      ` | 🧑 ${pipInfo(survivorPips)}` +
      ` | ☠️ Убито: ${killed}` +
      ` | 🪝 Жертв: ${sacrificed}` +
      ` | ⚙️ Генераторов: ${generators.toFixed(1)}` +
      ` | 🩸 Макс. престиж: ${maxPrestige}`;

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
