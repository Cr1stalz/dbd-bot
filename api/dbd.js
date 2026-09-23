export default async function handler(req, res) {
  const DEFAULT_STEAMID = "76561199849381839";
  const appid = "381210";

  let userInput = req.query.user || req.query.steamid || req.query.id;

  try {
    let steamid = DEFAULT_STEAMID;

    if (userInput && userInput.trim() !== "") {
      // Многократное декодирование URL на случай двойного encode от Moobot
      let rawInput = userInput.trim();
      try {
        rawInput = decodeURIComponent(rawInput);
        rawInput = decodeURIComponent(rawInput);
      } catch (e) {}

      // 1. Ищем 17 цифр прямо в тексте (если передали SteamID64 или ссылку /profiles/7656119...)
      const directIdMatch = rawInput.match(/\d{17}/);

      if (directIdMatch) {
        steamid = directIdMatch[0];
      } else {
        // 2. Если 17 цифр нет, значит передан кастомный никнейм или ссылка /id/
        const customName = extractCustomName(rawInput);

        if (customName) {
          const resolvedId = await resolveCustomName(customName);
          if (resolvedId) {
            steamid = resolvedId;
          } else {
            return res
              .status(200)
              .setHeader("Content-Type", "text/plain; charset=utf-8")
              .send("❌ Не удалось найти SteamID для данного профиля");
          }
        } else {
          return res
            .status(200)
            .setHeader("Content-Type", "text/plain; charset=utf-8")
            .send("❌ Некорректный SteamID или ссылка на профиль");
        }
      }
    }

    // 1. Получаем наигранные часы из Steam
    let steamHours = "Неизвестно";
    try {
      const steamResponse = await fetch(
        `https://decapi.me/steam/hours/${steamid}/${appid}`
      );
      const steamText = (await steamResponse.text()).trim();
      const match = steamText.match(/[\d.,]+/);

      if (match) {
        const hours = parseFloat(match[0].replace(",", "."));
        if (!isNaN(hours)) {
          steamHours = hours.toFixed(1).replace(".0", "");
        }
      }
    } catch (e) {}

    // 2. Получаем DBD статистику через tricky.lol
    const dbdResponse = await fetch(
      `https://dbd.tricky.lol/api/playerstats?steamid=${steamid}`
    );

    if (!dbdResponse.ok) {
      return res
        .status(200)
        .setHeader("Content-Type", "text/plain; charset=utf-8")
        .send("❌ Статистика DBD недоступна (профиль скрыт или не найден)");
    }

    const data = await dbdResponse.json();

    const survivor = rankName(data.survivor_rank);
    const killer = rankName(data.killer_rank);

    const gens = data.gensrepaired || 0;
    const escapes = data.escaped || 0;
    const totalKills = (Number(data.sacrificed) || 0) + (Number(data.killed) || 0);

    const result =
      `🎮 DBD | ⏱ ${steamHours} ч | 🧑 ${survivor} | 🔪 ${killer} | 🛠 Гены: ${gens} | 🚪 Побеги: ${escapes} | 💀 Убито: ${totalKills}`;

    res
      .status(200)
      .setHeader("Content-Type", "text/plain; charset=utf-8")
      .send(result);

  } catch (error) {
    res
      .status(200)
      .setHeader("Content-Type", "text/plain; charset=utf-8")
      .send("❌ Ошибка сервера при обработке запроса");
  }
}

// Вытаскиваем чистое имя профиля из любых вариантов ввода
function extractCustomName(input) {
  // Если это URL вида .../id/cr1stalz_kz/ или .../id/cr1stalz_kz
  const idMatch = input.match(/id\/([^\/\?#]+)/i);
  if (idMatch) {
    return idMatch[1];
  }

  // Если это просто ник без слэшей и точек
  const clean = input.trim().replace(/\/$/, "");
  if (!clean.includes("/") && !clean.includes(".")) {
    return clean;
  }

  return null;
}

// Преобразуем имя в SteamID64
async function resolveCustomName(customName) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  // Попытка 1: Через XML профиля Steam
  try {
    const res = await fetch(`https://steamcommunity.com/id/${encodeURIComponent(customName)}/?xml=1`, { headers });
    if (res.ok) {
      const xmlText = await res.text();
      const match = xmlText.match(/<steamID64>(\d{17})<\/steamID64>/);
      if (match) return match[1];
    }
  } catch (e) {}

  // Попытка 2: Через HTML профиля Steam (ищем g_rgProfileData)
  try {
    const res = await fetch(`https://steamcommunity.com/id/${encodeURIComponent(customName)}/`, { headers });
    if (res.ok) {
      const htmlText = await res.text();
      const match = htmlText.match(/"steamid":"(\d{17})"/);
      if (match) return match[1];
    }
  } catch (e) {}

  // Попытка 3: Через API dbd.tricky.lol напрямую
  try {
    const res = await fetch(`https://dbd.tricky.lol/api/playerstats?steamid=${encodeURIComponent(customName)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.steamid) return data.steamid;
    }
  } catch (e) {}

  return null;
}

function rankName(rank) {
  const ranks = {
    20: "Пепел IV", 19: "Пепел III", 18: "Пепел II", 17: "Пепел I",
    16: "Бронза IV", 15: "Бронза III", 14: "Бронза II", 13: "Бронза I",
    12: "Серебро IV", 11: "Серебро III", 10: "Серебро II", 9: "Серебро I",
    8: "Золото IV", 7: "Золото III", 6: "Золото II", 5: "Золото I",
    4: "Радужный IV", 3: "Радужный III", 2: "Радужный II", 1: "Радужный I"
  };

  return ranks[rank] || "Неизвестно";
}
