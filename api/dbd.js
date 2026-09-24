export default async function handler(req, res) {
  res.setHeader(
    "Content-Type",
    "text/plain; charset=utf-8"
  );

  let rawInput = req.query?.steamid
    ? String(req.query.steamid).trim()
    : "";

  const appid = "381210";

  // ========================================
  // Проверка аргумента
  // ========================================

  if (!rawInput) {
    return res.status(200).send(
      "⚠️ Укажите SteamID или ссылку на профиль!"
    );
  }

  // Убираем кавычки
  rawInput = rawInput.replace(
    /^["']|["']$/g,
    ""
  );

  // Исправляем HTTP / Https / HTTPS
  rawInput = rawInput.replace(
    /^https?:\/\//i,
    "https://"
  );

  try {
    // ========================================
    // 1. Получаем SteamID64
    // ========================================

    const steamId =
      await resolveSteamId(rawInput);

    if (!steamId) {
      return res.status(200).send(
        "❌ Ссылка на профиль недействительна или профиль закрыт"
      );
    }

    console.log(
      `SteamID64: ${steamId}`
    );

    // ========================================
    // 2. Получаем ник Steam
    // ========================================

    let steamNickname = "Неизвестно";

    try {
      const profileResponse =
        await fetch(
          `https://steamcommunity.com/profiles/${steamId}/?xml=1`,
          {
            method: "GET",
            headers: {
              "User-Agent":
                "Mozilla/5.0"
            },
            cache: "no-store"
          }
        );

      if (profileResponse.ok) {
        const profileXml =
          await profileResponse.text();

        const nicknameMatch =
          profileXml.match(
            /<steamID>([\s\S]*?)<\/steamID>/
          );

        if (
          nicknameMatch &&
          nicknameMatch[1]
        ) {
          steamNickname =
            decodeHtml(
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

    let steamHours =
      "Время игры скрыто";

    try {
      const steamResponse =
        await fetch(
          `https://decapi.me/steam/hours/${encodeURIComponent(
            steamId
          )}/${appid}`,
          {
            method: "GET",
            cache: "no-store"
          }
        );

      if (steamResponse.ok) {
        const steamText =
          (
            await steamResponse.text()
          ).trim();

        const match =
          steamText.match(
            /[\d.,]+/
          );

        if (match) {
          const hours =
            parseFloat(
              match[0].replace(
                ",",
                "."
              )
            );

          if (
            !isNaN(hours) &&
            hours > 0
          ) {
            steamHours =
              hours
                .toFixed(1)
                .replace(
                  /\.0$/,
                  ""
                );
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

    let data;

    try {
      const response =
        await fetch(
          `https://dbd.tricky.lol/api/playerstats?steamid=${encodeURIComponent(
            steamId
          )}`,
          {
            method: "GET",
            headers: {
              "User-Agent":
                "Mozilla/5.0",
              "Accept":
                "application/json"
            },
            cache: "no-store"
          }
        );

      // Просто читаем JSON.
      // Никаких проверок dbdResponse.status
      // и никаких добавлений профиля.

      data =
        await response.json();

    } catch (error) {
      console.error(
        "Ошибка получения статистики DBD:",
        error
      );

      return res.status(200).send(
        "❌ Не удалось получить статистику профиля"
      );
    }

    // ========================================
    // 5. Проверяем данные JSON
    // ========================================

    if (
      !data ||
      typeof data !== "object"
    ) {
      return res.status(200).send(
        "❌ Не удалось получить статистику профиля"
      );
    }

    // ========================================
    // 6. Ранги
    // ========================================

    const survivor =
      rankName(
        data.survivor_rank
      );

    const killer =
      rankName(
        data.killer_rank
      );

    // ========================================
    // 7. Статистика
    // ========================================

    const gens =
      Number(
        data.gensrepaired
      ) || 0;

    const escapes =
      Number(
        data.escaped
      ) || 0;

    const sacrificed =
      Number(
        data.sacrificed
      ) || 0;

    const killed =
      Number(
        data.killed
      ) || 0;

    const totalKills =
      sacrificed + killed;

    // ========================================
    // 8. Часы
    // ========================================

    const hoursText =
      steamHours ===
      "Время игры скрыто"
        ? "Время игры скрыто"
        : `${steamHours} ч`;

    // ========================================
    // 9. Финальный ответ
    // ========================================

    const result =
      `🎮 Статистика игрока [${steamNickname}] | ` +
      `⏱ ${hoursText} | ` +
      `🧑 ${survivor} | ` +
      `🔪 ${killer} | ` +
      `🛠 Гены: ${gens} | ` +
      `🚪 Побеги: ${escapes} | ` +
      `💀 Убито: ${totalKills}`;

    return res.status(200).send(
      result
    );

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
  let cleaned =
    String(input).trim();

  // Убираем кавычки
  cleaned = cleaned.replace(
    /^["']|["']$/g,
    ""
  );

  // Нормализуем протокол
  cleaned = cleaned.replace(
    /^https?:\/\//i,
    "https://"
  );

  // ========================================
  // Steam URL
  // ========================================

  if (
    cleaned
      .toLowerCase()
      .includes(
        "steamcommunity.com"
      )
  ) {
    try {
      const url =
        new URL(cleaned);

      const parts =
        url.pathname
          .split("/")
          .filter(Boolean);

      if (
        parts.length < 2
      ) {
        return null;
      }

      const type =
        parts[0].toLowerCase();

      const value =
        parts[1];

      // --------------------------------------
      // /profiles/7656119...
      // --------------------------------------

      if (
        type === "profiles"
      ) {
        if (
          /^\d{17}$/.test(
            value
          )
        ) {
          return value;
        }

        return null;
      }

      // --------------------------------------
      // /id/username
      // --------------------------------------

      if (
        type === "id"
      ) {
        cleaned = value;
      } else {
        return null;
      }

    } catch (error) {
      console.error(
        "Ошибка разбора Steam URL:",
        error
      );

      return null;
    }
  }

  // ========================================
  // Уже SteamID64
  // ========================================

  if (
    /^\d{17}$/.test(
      cleaned
    )
  ) {
    return cleaned;
  }

  // ========================================
  // Steam username
  // ========================================

  try {
    // --------------------------------------
    // Пробуем редирект
    // --------------------------------------

    const steamUrl =
      `https://steamcommunity.com/id/${encodeURIComponent(
        cleaned
      )}/`;

    const response =
      await fetch(
        steamUrl,
        {
          method: "GET",
          redirect: "manual",
          headers: {
            "User-Agent":
              "Mozilla/5.0"
          }
        }
      );

    const location =
      response.headers.get(
        "location"
      );

    if (location) {
      const match =
        location.match(
          /\/profiles\/(\d{17})/
        );

      if (match) {
        return match[1];
      }
    }

    // --------------------------------------
    // Пробуем XML
    // --------------------------------------

    const xmlResponse =
      await fetch(
        `https://steamcommunity.com/id/${encodeURIComponent(
          cleaned
        )}/?xml=1`,
        {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0"
          }
        }
      );

    if (xmlResponse.ok) {
      const xml =
        await xmlResponse.text();

      // <steamID64>765...</steamID64>

      let match =
        xml.match(
          /<steamID64>(\d{17})<\/steamID64>/
        );

      if (match) {
        return match[1];
      }

      // Запасной вариант

      match =
        xml.match(
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
    .replace(
      /^<!\[CDATA\[/,
      ""
    )
    .replace(
      /\]\]>$/,
      ""
    )
    .replace(
      /&amp;/g,
      "&"
    )
    .replace(
      /&lt;/g,
      "<"
    )
    .replace(
      /&gt;/g,
      ">"
    )
    .replace(
      /&quot;/g,
      '"'
    )
    .replace(
      /&#39;/g,
      "'"
    )
    .replace(
      /&#x27;/gi,
      "'"
    );
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
