export default async function handler(req, res) {
  // Ваш SteamID по умолчанию (если команда вызвана без параметров)
  const DEFAULT_STEAMID = "76561199849381839";
  const appid = "381210";

  // Берем значение из ?user=, ?steamid= или ?id=
  let userInput = req.query.user || req.query.steamid || req.query.id;

  try {
    let steamid = DEFAULT_STEAMID;

    // Если пользователь передал ссылку или никнейм в чате
    if (userInput && userInput.trim() !== "") {
      userInput = userInput.trim();

      // 1. Проверяем, передан ли уже готовый SteamID64 (или ссылка с profiles/...)
      let parsedId = extractSteamId(userInput);

      // 2. Если это кастомная ссылка (steamcommunity.com/id/...) или просто ник
      if (!parsedId) {
        const customUrlName = extractCustomUrl(userInput);
        if (customUrlName) {
          // Получаем SteamID64 по нику через DecAPI
          const resolveResponse = await fetch(`https://decapi.me/steam/id/${customUrlName}`);
          const resolvedText = (await resolveResponse.text()).trim();
          
          if (/^\d{17}$/.test(resolvedText)) {
            parsedId = resolvedText;
          }
        }
      }

      if (parsedId) {
        steamid = parsedId;
      } else {
        return res
          .status(200)
          .setHeader("Content-Type", "text/plain; charset=utf-8")
          .send("❌ Некорректный SteamID или ссылка на профиль");
      }
    }

    // 1. Получаем наигранные часы из Steam
    const steamResponse = await fetch(
      `https://decapi.me/steam/hours/${steamid}/${appid}`
    );

    const steamText = (await steamResponse.text()).trim();
    const match = steamText.match(/[\d.,]+/);

    let steamHours = "Неизвестно";

    if (match) {
      const hours = parseFloat(match[0].replace(",", "."));
      if (!isNaN(hours)) {
        steamHours = hours.toFixed(1).replace(".0", "");
      }
    }

    // 2. Получаем DBD статистику
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

    // Метрики из JSON
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
      .send("❌ Не удалось получить статистику DBD");
  }
}

// Извлечение SteamID64 из текста или ссылки profiles/
function extractSteamId(input) {
  if (/^\d{17}$/.test(input)) {
    return input;
  }
  const match = input.match(/profiles\/(\d{17})/);
  return match ? match[1] : null;
}

// Извлечение кастомного ника из ссылки id/
function extractCustomUrl(input) {
  // Убираем слеш в конце, если есть
  const clean = input.replace(/\/$/, "");
  const match = clean.match(/id\/([^\/]+)/);
  if (match) {
    return match[1];
  }
  // Если передали просто слово без https://
  if (!clean.includes("/") && !clean.includes(".")) {
    return clean;
  }
  return null;
}

function rankName(rank) {
  const ranks = {
    20: "Пепел IV",
    19: "Пепел III",
    18: "Пепел II",
    17: "Пепел I",

    16: "Бронза IV",
    15: "Бронза III",
    14: "Бронза II",
    13: "Бронза I",

    12: "Серебро IV",
    11: "Серебро III",
    10: "Серебро II",
    9: "Серебро I",

    8: "Золото IV",
    7: "Золото III",
    6: "Золото II",
    5: "Золото I",

    4: "Радужный IV",
    3: "Радужный III",
    2: "Радужный II",
    1: "Радужный I"
  };

  return ranks[rank] || "Неизвестно";
}
