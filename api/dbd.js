export default async function handler(req, res) {
  // Ваш SteamID по умолчанию (если команда вызвана без параметров)
  const DEFAULT_STEAMID = "76561199849381839";
  const appid = "381210";

  // Берем значение из ?user=, ?steamid= или ?id=
  let userInput = req.query.user || req.query.steamid || req.query.id;

  try {
    let steamid = DEFAULT_STEAMID;

    if (userInput && userInput.trim() !== "") {
      try {
        userInput = decodeURIComponent(userInput.trim());
      } catch (e) {
        userInput = userInput.trim();
      }

      // 1. Проверяем, передан ли уже готовый SteamID64 (17 цифр) или ссылка /profiles/
      let parsedId = extractSteamId(userInput);

      // 2. Если это ссылка /id/ или просто кастомный никнейм
      if (!parsedId) {
        const customUrlName = extractCustomUrl(userInput);
        if (customUrlName) {
          // Получаем SteamID64 напрямую со страницы профиля Steam
          parsedId = await resolveSteamCustomUrl(customUrlName);
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
    } catch (e) {
      // Игнорируем ошибки часов
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

// Извлечение SteamID64 из текста или ссылки profiles/
function extractSteamId(input) {
  if (/^\d{17}$/.test(input)) {
    return input;
  }
  const match = input.match(/profiles\/(\d{17})/);
  return match ? match[1] : null;
}

// Извлечение кастомного ника из ссылки id/ или чистого текста
function extractCustomUrl(input) {
  const clean = input.trim().replace(/\/$/, "");

  const match = clean.match(/id\/([^\/]+)/);
  if (match) {
    return match[1];
  }

  if (!clean.includes("/") && !clean.includes(".")) {
    return clean;
  }

  return null;
}

// Преобразование кастомного ника в SteamID64 путем чтения XML-страницы профиля Steam
async function resolveSteamCustomUrl(customName) {
  try {
    const response = await fetch(`https://steamcommunity.com/id/${encodeURIComponent(customName)}/?xml=1`);
    if (!response.ok) return null;
    
    const text = await response.text();
    const match = text.match(/<steamID64>(\d{17})<\/steamID64>/);
    if (match) {
      return match[1];
    }
  } catch (e) {
    console.error("Steam XML resolve error:", e);
  }
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
