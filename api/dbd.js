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

  // Исправляем Https:// / HTTP:// -> https://
  rawInput = rawInput.replace(/^https?:\/\//i, "https://");

  try {
    // ========================================
    // 1. Получаем SteamID64
    // ========================================

    const resolvedSteamId = await resolveSteamId(rawInput);

    if (!resolvedSteamId) {
      return res.status(200).send(
        "❌ Ссылка на профиль недействительна или профиль закрыт"
      );
    }

    // ========================================
    // 2. Получаем отображаемый ник из Steam
    // ========================================

    let steamNickname = "Неизвестно";

    try {
      const profileResponse = await fetch(
        `https://steamcommunity.com/profiles/${resolvedSteamId}/?xml=1`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0"
          }
        }
      );

      if (profileResponse.ok) {
        const profileXml = await profileResponse.text();

        // Steam может вернуть:
        // <steamID><![CDATA[Cr1stalz_]]></steamID>
        const nicknameMatch = profileXml.match(
          /<steamID>([\s\S]*?)<\/steamID>/
        );

        if (nicknameMatch && nicknameMatch[1]) {
          steamNickname = decodeHtml(
            nicknameMatch[1].trim()
          );
        }
      }
    } catch (error) {
      console.error(
        "Ошибка получения ника Steam:",
        error
      );
    }

    if (!steamNickname) {
      steamNickname = "Неизвестно";
    }

    // ========================================
    // 3. Получаем часы DBD
    // ========================================

    // Если часы скрыты, показываем:
    // "Время игры скрыто"
    let steamHours = "Время игры скрыто";

    try {
      const steamResponse = await fetch(
        `https://decapi.me/steam/hours/${encodeURIComponent(
          resolvedSteamId
        )}/${appid}`
      );

      if (steamResponse.ok) {
        const steamText = (
          await steamResponse.text()
        ).trim();

        const match = steamText.match(/[\d.,]+/);

        if (match) {
          const hours = parseFloat(
            match[0].replace(",", ".")
          );

          // Показываем часы только если они больше 0
          if (!isNaN(hours) && hours > 0) {
            steamHours = hours
              .toFixed(1)
              .replace(/\.0$/, "");
          }
        }
      }
    } catch (error) {
      console.error(
        "Ошибка получения часов:",
        error
      );
    }

    // ========================================
    // 4. Получаем статистику DBD
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
    // 5. Ранги
    // ========================================

    const survivor = rankName(
      data.survivor_rank
    );

    const killer = rankName(
      data.killer_rank
    );

    // ========================================
    // 6. Статистика
    // ========================================

    const gens =
      Number(data.gensrepaired) || 0;

    const escapes =
      Number(data.escaped) || 0;

    const totalKills =
      (Number(data.sacrificed) || 0) +
      (Number(data.killed) || 0);

    // ========================================
    // 7. Итог
    // ========================================

    const hoursText =
      steamHours === "Время игры скрыто"
        ? "Время игры скрыто"
        : `${steamHours} ч`;

    const result =
      `🎮 Статистика игрока [${steamNickname}] | ` +
      `⏱ ${hoursText} | ` +
      `🧑 ${survivor} | ` +
      `🔪 ${killer} | ` +
      `🛠 Гены: ${gens} | ` +
      `🚪 Побеги: ${escapes} | ` +
      `💀 Убито: ${totalKills}`;

    return res.status(200).send(result);

  } catch (error) {
    console.error(
      "Общая ошибка:",
      error
    );

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
  cleaned = cleaned.replace(
    /^["']|["']$/g,
    ""
  );

  // Исправляем регистр HTTPS
  cleaned = cleaned.replace(
    /^https?:\/\//i,
    "https://"
  );

  // ========================================
  // Если это Steam-ссылка
  // ========================================

  if (
    cleaned.includes(
      "steamcommunity.com"
    )
  ) {
    try {
      const url = new URL(cleaned);

      const parts = url.pathname
        .split("/")
        .filter(Boolean);

      if (parts.length < 2) {
        return null;
      }

      const type = parts[0];
      const value = parts[1];

      // /profiles/76561198134964248/
      if (
        type === "profiles" &&
        /^\d{17}$/.test(value)
      ) {
        return value;
      }

      // /id/cr1stalz_kz/
      if (type === "id") {
        cleaned = value;
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
  // Определяем SteamID через Steam
  // ========================================

  try {
    const steamUrl =
      `https://steamcommunity.com/id/${encodeURIComponent(
        cleaned
      )}/`;

    const response = await fetch(
      steamUrl,
      {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      }
    );

    // Проверяем редирект
    const location =
      response.headers.get("location");

    if (location) {
      const match =
        location.match(
          /\/profiles\/(\d{17})/
        );

      if (match) {
        return match[1];
      }
    }

    // ====================================
    // Пробуем Steam XML
    // ====================================

    const xmlResponse = await fetch(
      `https://steamcommunity.com/id/${encodeURIComponent(
        cleaned
      )}/?xml=1`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      }
    );

    if (xmlResponse.ok) {
      const xml =
        await xmlResponse.text();

      // Ищем SteamID64
      let match = xml.match(
        /<steamID64>(\d{17})<\/steamID64>/
      );

      if (match) {
        return match[1];
      }

      // Дополнительный поиск SteamID64
      match = xml.match(
        /7656119\d{10}/
      );

      if (match) {
        return match[0];
      }
    }

  } catch (error) {
    console.error(
      "Ошибка определения SteamID:",
      error
    );
  }

  return null;
}


// ========================================
// Обработка ника Steam
// ========================================

function decodeHtml(text) {
  return text
    // Убираем CDATA
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")

    // HTML-сущности
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
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

  return (
    ranks[Number(rank)] ||
    "Неизвестно"
  );
}
