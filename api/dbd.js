export default async function handler(req, res) {
  try {
    const { steamid, profile } = req.query;

    let steamId = steamid;

    // Если передана ссылка на Steam-профиль
    if (!steamId && profile) {
      const match = profile.match(/steamcommunity\.com\/profiles\/(\d+)/i);

      if (match) {
        steamId = match[1];
      } else {
        return res.status(400).send("⚠️ Не удалось определить SteamID.");
      }
    }

    if (!steamId) {
      return res.status(400).send("⚠️ Укажите SteamID или ссылку на профиль!");
    }

    const apiKey = process.env.STEAM_API_KEY;

    if (!apiKey) {
      return res.status(500).send("❌ Steam API key не настроен на Vercel.");
    }

    const steamUrl =
      `https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v0002/` +
      `?appid=381210` +
      `&key=${encodeURIComponent(apiKey)}` +
      `&steamid=${encodeURIComponent(steamId)}`;

    const response = await fetch(steamUrl);

    if (!response.ok) {
      return res.status(502).send("❌ Steam API вернул ошибку.");
    }

    const data = await response.json();

    if (!data.playerstats || !data.playerstats.stats) {
      return res.status(404).send("❌ Статистика Dead by Daylight не найдена.");
    }

    const stats = data.playerstats.stats;

    function getStat(name) {
      const stat = stats.find((item) => item.name === name);
      return stat ? Number(stat.value) : 0;
    }

    // Основные статистики DBD
    const sacrificed = getStat("DBD_SacrificedCampers");
    const killed = getStat("DBD_KilledCampers");

    const escapes = getStat("DBD_Escape");
    const hatchEscapes = getStat("DBD_EscapeThroughHatch");

    const bloodwebPrestige = getStat("DBD_BloodwebMaxPrestigeLevel");

    const generators = getStat("DBD_FixSecondFloorGenerator_MapAsy_Asylum");

    const skillChecks = getStat("DBD_SkillCheckSuccess");

    const heals = getStat("DBD_UnhookOrHeal");

    const killerLoadouts = getStat("DBD_SlasherFullLoadout");
    const survivorLoadouts = getStat("DBD_CamperFullLoadout");

    const rankUnlock = getStat("DBD_UnlockRanking");

    const format = (number) =>
      Number(number).toLocaleString("ru-RU");

    /*
     * Steam API не предоставляет здесь:
     * - общее игровое время DBD
     * - текущий Grade (Bronze II, Silver I и т.д.)
     *
     * Поэтому эти значения пока не показываем.
     */

    const message =
      `🎮 DBD | ` +
      `🔪 Жертв: ${format(sacrificed)} | ` +
      `💀 Убийств: ${format(killed)} | ` +
      `🏃 Побегов: ${format(escapes)} | ` +
      `🚪 Люк: ${format(hatchEscapes)} | ` +
      `🩸 Престиж: ${format(bloodwebPrestige)} | ` +
      `🎯 Skill Check: ${format(skillChecks)} | ` +
      `💉 Лечение/снятие: ${format(heals)}`;

    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=300"
    );

    res.setHeader(
      "Content-Type",
      "text/plain; charset=utf-8"
    );

    return res.status(200).send(message);

  } catch (error) {
    console.error("DBD API ERROR:", error);

    return res
      .status(500)
      .send("❌ Внутренняя ошибка API.");
  }
}
