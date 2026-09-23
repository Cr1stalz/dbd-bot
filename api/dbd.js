export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  let rawInput = req.query?.steamid
    ? String(req.query.steamid).trim()
    : null;

  const appid = "381210";

  if (!rawInput) {
    return res.status(200).send(
      "⚠️ Укажите SteamID или ссылку на профиль!"
    );
  }

  // Исправляем Https:// → https://
  rawInput = rawInput.replace(/^https?:\/\//i, "https://");

  try {
    // ========================================
    // Определяем SteamID64
    // ========================================

    const resolvedSteamId = await resolveSteamId(rawInput);

    if (!resolvedSteamId) {
      return res.status(200).send(
        "❌ Ссылка на профиль недействительна или профиль закрыт"
      );
    }

    // ========================================
    // Получаем часы DBD
    // ========================================

    let steamHours = "Неизвестно";

    try {
      const steamResponse = await fetch(
        `https://decapi.me/steam/hours/${encodeURIComponent(
          resolvedSteamId
        )}/${appid}`
      );

      if (steamResponse.ok) {
        const steamText = (await steamResponse.text()).trim();

        const match = steamText.match(/[\d.,]+/);

        if (match) {
          const hours = parseFloat(
            match[0].replace(",", ".")
          );

          if (!isNaN(hours)) {
            steamHours = hours
              .toFixed(1)
              .replace(/\.0$/, "");
          }
        }
      }
    } catch (error) {
      console.error("Ошибка получения часов:", error);
    }

    // ========================================
    // Получаем статистику DBD
    // ========================================

    const dbdResponse = await fetch(
      `https://dbd.tricky.lol/api/playerstats?steamid=${encodeURIComponent(
        resolvedSteamId
      )}`
    );

    if (!dbdResponse.ok) {
      return res.status(200).send(
        "❌ Профиль не найден или закрыт"
      );
    }

    const data = await dbdResponse.json();

    if (!data || typeof data !== "object") {
      return res.status(200).send(
        "❌ Профиль не найден или закрыт"
      );
    }

    // ========================================
    // Ранги
    // ========================================

    const survivor = rankName(data.survivor_rank);
    const killer = rankName(data.killer_rank);

    // ========================================
    // Статистика
    // ========================================

    const gens = Number(data.gensrepaired) || 0;
    const escapes = Number(data.escaped) || 0;

    const totalKills =
      (Number(data.sacrificed) || 0) +
      (Number(data.killed) || 0);

    // ========================================
    // Результат
    // ========================================

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
      "❌ Профиль не найден или закрыт"
    );
  }
}


// ========================================
// Определение SteamID64
// ========================================

async function resolveSteamId(input) {
  let cleaned = String(input).trim();

  // Убираем кавычки
  cleaned = cleaned.replace(/^["']|["']$/g, "");

  // Исправляем регистр HTTPS
  cleaned = cleaned.replace(/^https?:\/\//i, "https://");

  // ========================================
  // Если это ссылка Steam
  // ========================================

  if (cleaned.includes("steamcommunity.com")) {
    try {
      const url = new URL(cleaned);

      const parts = url.pathname
        .split("/")
        .filter(Boolean);

      if (parts.length >= 2) {
        const type = parts[0];
        const value = parts[1];

        // Прямая SteamID64 ссылка
        // /profiles/76561198134964248/
        if (
          type === "profiles" &&
          /^\d{17}$/.test(value)
        ) {
          return value;
        }

        // Кастомная ссылка
        // /id/cr1stalz_kz/
        if (type === "id") {
          cleaned = value;
        } else {
          return null;
        }
      } else {
        return null;
      }

    } catch (error) {
      return null;
    }
  }

  // ========================================
  // Если уже передан SteamID64
  // ========================================

  if (/^\d{17}$/.test(cleaned)) {
    return cleaned;
  }

  // ========================================
  // Получаем SteamID64 через Steam XML
  // ========================================

  try {
    const response = await fetch(
      `https://steamcommunity.com/id/${encodeURIComponent(
        cleaned
      )}/?xml=1`
    );

    if (!response.ok) {
      return null;
    }

    const xml = await response.text();

    const match = xml.match(
      /<steamID64>(\d{17})<\/steamID64>/
    );

    if (match) {
      return match[1];
    }

  } catch (error) {
    console.error(
      "Ошибка получения SteamID из Steam XML:",
      error
    );
  }

  return null;
}


// ========================================
// Ранги DBD на русском
// ========================================

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

  return ranks[Number(rank)] || "Неизвестно";
}
