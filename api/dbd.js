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

async function resolveSteamId(input) {
  let cleaned = String(input).trim();

  // Убираем кавычки, если они случайно попали в аргумент
  cleaned = cleaned.replace(/^["']|["']$/g, "");

  // Если передана Steam-ссылка
  if (
    cleaned.includes("steamcommunity.com/id/") ||
    cleaned.includes("steamcommunity.com/profiles/")
  ) {
    try {
      const url = new URL(cleaned);

      const parts = url.pathname
        .split("/")
        .filter(Boolean);

      if (parts.length >= 2) {
        const type = parts[0];
        const value = parts[1];

        // Прямая ссылка /profiles/7656119...
        if (
          type === "profiles" &&
          /^7656\d{13}$/.test(value)
        ) {
          return value;
        }

        // /id/custom_name
        if (type === "id") {
          cleaned = value;
        }
      }
    } catch (e) {
      // Если URL не удалось разобрать,
      // попробуем обработать его вручную
      const parts = cleaned
        .replace(/\/+$/, "")
        .split("/");

      cleaned = parts[parts.length - 1];
    }
  }

  // Если это уже SteamID64
  if (/^7656\d{13}$/.test(cleaned)) {
    return cleaned;
  }

  // Если это custom URL
  try {
    const response = await fetch(
      `https://decapi.me/steam/id/${encodeURIComponent(cleaned)}`
    );

    if (response.ok) {
      const text = (await response.text()).trim();

      if (/^7656\d{13}$/.test(text)) {
        return text;
      }
    }
  } catch (e) {
    console.error("Ошибка DecAPI:", e);
  }

  // Не возвращаем custom_name как SteamID
  return null;
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
