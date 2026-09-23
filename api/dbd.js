export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  // Получаем аргумент из Moobot
  const rawInput = req.query?.steamid
    ? String(req.query.steamid).trim()
    : null;

  const appid = "381210";

  if (!rawInput) {
    return res.status(200).send(
      "⚠️ Укажите SteamID или ссылку на профиль! Пример: !dbd 76561199849381839 или !dbd https://steamcommunity.com/id/custom_name"
    );
  }

  try {
    // Определяем SteamID64
    const resolvedSteamId = await resolveSteamId(rawInput);

    if (!resolvedSteamId) {
      return res.status(200).send(
        `❌ Не удалось найти SteamID по переданным данным: ${rawInput}`
      );
    }

    // Получаем часы DBD через Steam/DecAPI
    let steamHours = "Неизвестно";

    try {
      const steamResponse = await fetch(
        `https://decapi.me/steam/hours/${encodeURIComponent(
          resolvedSteamId
        )}/${appid}`
      );

      if (steamResponse.ok) {
        const steamText = (await steamResponse.text()).trim();

        // Ищем число часов
        const match = steamText.match(/[\d.,]+/);

        if (match) {
          const hours = parseFloat(match[0].replace(",", "."));

          if (!isNaN(hours)) {
            steamHours = hours.toFixed(1).replace(/\.0$/, "");
          }
        }
      }
    } catch (e) {
      steamHours = "Неизвестно";
    }

    // Получаем статистику Dead by Daylight
    const dbdResponse = await fetch(
      `https://dbd.tricky.lol/api/playerstats?steamid=${encodeURIComponent(
        resolvedSteamId
      )}`
    );

    if (!dbdResponse.ok) {
      return res.status(200).send(
        `❌ Игрок не найден или профиль скрыт (SteamID: ${resolvedSteamId})`
      );
    }

    const data = await dbdResponse.json();

    if (!data || typeof data !== "object") {
      return res.status(200).send(
        "❌ Не удалось получить статистику DBD"
      );
    }

    // Ранги
    const survivor = rankName(data.survivor_rank);
    const killer = rankName(data.killer_rank);

    // Статистика
    const gens = Number(data.gensrepaired) || 0;
    const escapes = Number(data.escaped) || 0;

    // Общее количество убийств
    const totalKills =
      (Number(data.sacrificed) || 0) +
      (Number(data.killed) || 0);

    // Итоговая строка
    const result =
      `🎮 DBD | ` +
      `⏱ ${steamHours} ч | ` +
      `🧑 ${survivor} | ` +
      `🔪 ${killer} | ` +
      `🛠 Гены: ${gens} | ` +
      `🚪 Побеги: ${escapes} | ` +
      `💀 Убито: ${totalKills}`;

    return res.status(200).send(result);

  } catch (error) {
    console.error(error);

    return res.status(200).send(
      "❌ Произошла ошибка при запросе статистики DBD."
    );
  }
}


// ========================================
// Определение SteamID64
// ========================================

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  // 1. Извлекаем входящее значение (это может быть ID, логин, кастомный URL или полная ссылка)
  const rawInput = req.query?.steamid ? String(req.query.steamid).trim() : null;
  const appid = "381210";

  if (!rawInput) {
    return res
      .status(200)
      .send("⚠️ Укажите SteamID или ссылку на профиль! Пример: !dbd 76561199849381839 или !dbd https://steamcommunity.com/id/custom_name");
  }

  try {
    // 2. Преобразуем ввод (ссылку, кастомный URL или ID) в чистый SteamID64
    const resolvedSteamId = await resolveSteamId(rawInput);

    if (!resolvedSteamId) {
      return res
        .status(200)
        .send(`❌ Не удалось найти SteamID по переданным данным: ${rawInput}`);
    }

    // 3. Получаем часы из Steam
    let steamHours = "Неизвестно";
    try {
      const steamResponse = await fetch(
        `https://decapi.me/steam/hours/${encodeURIComponent(resolvedSteamId)}/${appid}`
      );
      if (steamResponse.ok) {
        const steamText = await steamResponse.text();
        const match = steamText.match(/[\d.,]+/);
        if (match) {
          const hours = parseFloat(match[0].replace(",", "."));
          if (!isNaN(hours)) {
            steamHours = hours.toFixed(1).replace(".0", "");
          }
        }
      }
    } catch (e) {
      // Игнорируем сбой получения часов, чтобы выдать остальную статистику
    }

    // 4. Получаем DBD статистику
    const dbdResponse = await fetch(
      `https://dbd.tricky.lol/api/playerstats?steamid=${encodeURIComponent(resolvedSteamId)}`
    );

    if (!dbdResponse.ok) {
      return res
        .status(200)
        .send(`❌ Игрок не найден или профиль скрыт (SteamID: ${resolvedSteamId})`);
    }

    const data = await dbdResponse.json();

    if (!data || typeof data !== "object") {
      return res.status(200).send("❌ Не удалось разобрать данные DBD");
    }

    const survivor = rankName(data.survivor_rank);
    const killer = rankName(data.killer_rank);

    const gens = data.gensrepaired || 0;
    const escapes = data.escaped || 0;

    // Общее количество жертв (жертвы на крюке + убийства мори/навыками)
    const totalKills = (Number(data.sacrificed) || 0) + (Number(data.killed) || 0);

    const result = `🎮 DBD | ⏱ ${steamHours} ч | 🧑 ${survivor} | 🔪 ${killer} | 🛠 Гены: ${gens} | 🚪 Побеги: ${escapes} | 💀 Убито: ${totalKills}`;

    return res.status(200).send(result);

  } catch (error) {
    return res
      .status(200)
      .send("❌ Произошла ошибка при запросе статистики DBD.");
  }
}

// Вспомогательная функция для распознавания ссылки / кастомного имени
async function resolveSteamId(input) {
  // Очищаем от случайных кавычек и пробелов
  let cleaned = input.trim();

  // Если передана полная ссылка на профиль (например, https://steamcommunity.com/id/username/ или /profiles/765611...)
  if (cleaned.includes("steamcommunity.com")) {
    const urlParts = cleaned.replace(/\/+$/, "").split("/");
    cleaned = urlParts[urlParts.length - 1]; // Берем последний сегмент URL
  }

  // Если это уже чистый 17-значный SteamID64 (начинается на 7656...)
  if (/^7656\d{13}$/.test(cleaned)) {
    return cleaned;
  }

  // Если это Custom URL (кастомный логин профиля), запрашиваем его преобразование в ID64
  try {
    const response = await fetch(`https://decapi.me/steam/id/${encodeURIComponent(cleaned)}`);
    if (response.ok) {
      const text = (await response.text()).trim();
      if (/^7656\d{13}$/.test(text)) {
        return text;
      }
    }
  } catch (e) {
    // В случае сбоя DecAPI возвращаем исходную строку
  }

  return cleaned;
}

function rankName(rank) {
  const ranks = {
    20: "Пепел IV",   19: "Пепел III",  18: "Пепел II",   17: "Пепел I",
    16: "Бронза IV",  15: "Бронза III", 14: "Бронза II",  13: "Бронза I",
    12: "Серебро IV", 11: "Серебро III",10: "Серебро II", 9: "Серебро I",
    8:  "Золото IV",  7:  "Золото III", 6:  "Золото II",  5:  "Золото I",
    4:  "Радужный IV",3:  "Радужный III",2: "Радужный II",1:  "Радужный I"
  };

  return ranks[rank] || "Неизвестно";
}

// ========================================
// Ранги DBD на русском
// ========================================

function rankName(rank) {
  const rankNumber = Number(rank);

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

  return ranks[rankNumber] || "Неизвестно";
}
