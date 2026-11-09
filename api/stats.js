export default async function handler(req, res) {
  const API_KEY = process.env.STEAM_API_KEY;
  const STEAM_HELP_URL = "https://dbd-bot-livid.vercel.app/steam-help.html";
  const DBD_APP_ID = 381210;
  const TIMEOUT_MS = 8000;

  function formatNumber(num) {
    num = Number(num) || 0;
    const units = [
      { value: 1e12, name: "трлн" },
      { value: 1e9, name: "млрд" },
      { value: 1e6, name: "млн" },
      { value: 1e3, name: "тыс." }
    ];
    for (const unit of units) {
      if (num >= unit.value) {
        return `${(num / unit.value).toFixed(2).replace(/\.?0+$/, "")} ${unit.name}`;
      }
    }
    return String(Math.round(num));
  }

  function safeDecode(str) {
    try {
      return decodeURIComponent(str);
    } catch {
      return str;
    }
  }

  function extractSteamId(input) {
    if (!input) return null;
    input = safeDecode(input.trim());
    if (/^\d{17}$/.test(input)) return input;
    const m = input.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
    return m ? m[1] : null;
  }

  async function fetchSteam(path, params) {
    const url =
      `https://api.steampowered.com/${path}/` +
      `?key=${encodeURIComponent(API_KEY)}` +
      `&${new URLSearchParams(params)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return { ok: false, data: null };
      return { ok: true, data: await response.json() };
    } catch {
      return { ok: false, data: null };
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    if (!API_KEY) return res.status(200).send("❌ STEAM_API_KEY не задан");

    let input = req.query?.steamid;
    if (Array.isArray(input)) input = input[0];
    if (!input) return res.status(200).send("❌ Укажи Steam профиль");

    let steamId = extractSteamId(input);
    let attemptedVanity = false;

    if (!steamId) {
      let vanity = null;
      const vanityMatch = input.match(/steamcommunity\.com\/id\/([^\/?#]+)/i);
      if (vanityMatch) vanity = vanityMatch[1];
      else if (/^[a-zA-Z0-9_-]{2,32}$/.test(input)) vanity = input;

      if (vanity) {
        attemptedVanity = true;
        const resolve = await fetchSteam("ISteamUser/ResolveVanityURL/v0001", { vanityurl: vanity });
        if (resolve.ok && resolve.data?.response?.success === 1 && resolve.data.response.steamid) {
          steamId = resolve.data.response.steamid;
        }
      }
    }

    if (!steamId) {
      return res.status(200).send(attemptedVanity
        ? `❌ Не удалось найти Steam-профиль: ${STEAM_HELP_URL}`
        : `❌ Неверная ссылка Steam: ${STEAM_HELP_URL}`);
    }

    const [profile, games, stats] = await Promise.all([
      fetchSteam("ISteamUser/GetPlayerSummaries/v0002", { steamids: steamId }),
      fetchSteam("IPlayerService/GetOwnedGames/v0001", {
        steamid: steamId,
        format: "json",
        include_played_free_games: 1,
        include_appinfo: 0,
        "appids_filter[0]": DBD_APP_ID
      }),
      fetchSteam("ISteamUserStats/GetUserStatsForGame/v0002", {
        appid: DBD_APP_ID,
        steamid: steamId
      })
    ]);

    const player = profile.ok ? profile.data?.response?.players?.[0] : null;
    if (!player) return res.status(200).send(`❌ Не удалось найти Steam-профиль: ${STEAM_HELP_URL}`);

    const nickname = player.personaname || "Неизвестно";

    let playtimeHours = null;
    if (games.ok) {
      const dbdGame = games.data?.response?.games?.find((g) => Number(g.appid) === DBD_APP_ID);
      if (dbdGame && typeof dbdGame.playtime_forever === "number") {
        playtimeHours = dbdGame.playtime_forever / 60;
      }
    }

    const statsList = stats.ok ? stats.data?.playerstats?.stats : null;
    if (!Array.isArray(statsList)) {
      return res.status(200).send(`❌ Статистика DBD недоступна: ${STEAM_HELP_URL}`);
    }

    const stat = {};
    for (const item of statsList) stat[item.name] = Number(item.value) || 0;

    const bloodpoints = stat.DBD_BloodwebPoints || 0;
    const totalKills = (stat.DBD_KilledCampers || 0) + (stat.DBD_SacrificedCampers || 0);
    const escapes = (stat.DBD_Escape || 0) + (stat.DBD_EscapeThroughHatch || 0);
    const hatchEscapes = stat.DBD_EscapeThroughHatch || 0;
    const generators = Math.round(stat.DBD_GeneratorPct_float || 0);
    const skillChecks = stat.DBD_SkillCheckSuccess || 0;
    const unhookHeal = stat.DBD_UnhookOrHeal || 0;
    const hitsNearHook = stat.DBD_HitNearHook || 0;
    const maxPrestige = stat.DBD_BloodwebMaxPrestigeLevel || 0;
    const kill4 = stat.DBD_SlasherPowerKillAllCampers || 0;

    const nf = new Intl.NumberFormat("ru-RU");
    const plural = (n, one, few, many) => {
      n = Math.abs(n) % 100;
      const n1 = n % 10;
      if (n > 10 && n < 20) return many;
      if (n1 > 1 && n1 < 5) return few;
      if (n1 === 1) return one;
      return many;
    };

    const funFacts = [];
    if (playtimeHours !== null) {
      const h = Math.round(playtimeHours);
      funFacts.push(`⏱ ${nf.format(h)} ${plural(h, "час", "часа", "часов")} в DBD — это ${Math.round(playtimeHours / 24)} суток без сна. Ты буквально живёшь в тумане.`);
    }
    funFacts.push(`🩸 ${formatNumber(bloodpoints)} очков крови — если бы это были деньги, ты уже миллионер.`);
    funFacts.push(`🔪 ${nf.format(totalKills)} ${plural(totalKills, "убийство", "убийства", "убийств")} — больше, чем у половины киллеров из фильмов ужасов.`);
    funFacts.push(`🏃 ${nf.format(escapes)} ${plural(escapes, "побег", "побега", "побегов")} — ты сбегал от киллера чаще, чем некоторые выходят из дома.`);
    if (skillChecks > 0) funFacts.push(`🎯 ${nf.format(skillChecks)} ${plural(skillChecks, "скиллчек", "скиллчека", "скиллчеков")} — реакция быстрее, чем у Пищевого Бота.`);
    if (unhookHeal > 0) funFacts.push(`🤝 ${nf.format(unhookHeal)} ${plural(unhookHeal, "спасение", "спасения", "спасений")} — личный ангел-хранитель команды.`);
    if (hitsNearHook > 0) funFacts.push(`⛺ ${nf.format(hitsNearHook)} ${plural(hitsNearHook, "удар", "удара", "ударов")} возле крюка — кемпинг-метрика, которая говорит сама за себя.`);
    if (generators > 0) funFacts.push(`⚙️ ${nf.format(generators)} ${plural(generators, "генератор", "генератора", "генераторов")} — этим можно запитать небольшой город.`);
    if (hatchEscapes > 0) funFacts.push(`🕳 ${nf.format(hatchEscapes)} ${plural(hatchEscapes, "побег", "побега", "побегов")} через люк — мастер неожиданных исчезновений.`);
    if (maxPrestige > 0) funFacts.push(`⭐ ${maxPrestige} престиж — на это ушло примерно полжизни.`);
    if (kill4 > 0) funFacts.push(`☠️ ${kill4} ${plural(kill4, "раз", "раза", "раз")} вырезал всю команду силой киллера — безжалостно.`);

    const fact = funFacts[Math.floor(Math.random() * funFacts.length)];

    return res.status(200).send(`🎲 ${nickname}: ${fact}`);
  } catch (error) {
    console.error(error);
    return res.status(200).send(`❌ Внутренняя ошибка: ${STEAM_HELP_URL}`);
  }
}
