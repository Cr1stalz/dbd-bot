export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

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

  // Убираем случайные кавычки
  rawInput = rawInput.replace(/^["']|["']$/g, "");

  // Исправляем HTTP / Https / HTTPS
  rawInput = rawInput.replace(
    /^https?:\/\//i,
    "https://"
  );

  try {
    // ========================================
    // 1. Определяем SteamID64
    // ========================================

    const steamId = await resolveSteamId(rawInput);

    if (!steamId) {
      return res.status(200).send(
        "❌ Ссылка на профиль недействительна или профиль закрыт"
      );
    }

    console.log(
      `Используем SteamID64: ${steamId}`
    );

    // ========================================
    // 2. Получаем ник Steam
    // ========================================

    let steamNickname = "Неизвестно";

    try {
      const profileResponse = await fetch(
        `https://steamcommunity.com/profiles/${steamId}/?xml=1`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0"
          }
        }
      );

      if (profileResponse.ok) {
        const xml =
          await profileResponse.text();

        const nicknameMatch = xml.match(
          /<steamID>([\s\S]*?)<\/steamID>/
        );

        if (
          nicknameMatch &&
          nicknameMatch[1]
        ) {
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

    let steamHours =
      "Время игры скрыто";

    try {
      const steamResponse = await fetch(
        `https://decapi.me/steam/hours/${encodeURIComponent(
          steamId
        )}/${appid}`
      );

      if (steamResponse.ok) {
        const text = (
          await steamResponse.text()
        ).trim();

        const match =
          text.match(/[\d.,]+/);

        if (match) {
          const hours = parseFloat(
            match[0].replace(",", ".")
          );

          if (
            !isNaN(hours) &&
            hours > 0
          ) {
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

    let dbdResponse =
      await getDbdStats(steamId);

    // ========================================
    // 5. Если профиля ещё нет в базе
    // ========================================

    if (dbdResponse.status === 404) {
      console.log(
        `Профиль ${steamId} отсутствует в базе. Запускаем добавление.`
      );

      try {
        const addResponse =
          await fetch(
            `https://dbd.tricky.lol/?json=profile&profile=${encodeURIComponent(
              steamId
            )}`,
            {
              method: "GET",
              headers: {
                "User-Agent":
                  "Mozilla/5.0",
                "Accept":
                  "application/json",
                "X-Requested-With":
                  "XMLHttpRequest"
              }
            }
          );

        console.log(
          `Запрос добавления ${steamId}: HTTP ${addResponse.status}`
        );
      } catch (error) {
        console.error(
          "Ошибка добавления профиля:",
          error
        );
      }

      // ========================================
      // 6. Повторные проверки
      // ========================================

      // 5 попыток по 2 секунды.
      // Максимальное ожидание ~10 секунд.

      for (
        let attempt = 1;
        attempt <= 5;
        attempt++
      ) {
        await sleep(2000);

        console.log(
          `Проверка статистики ${attempt}/5: ${steamId}`
        );

        try {
          dbdResponse =
            await getDbdStats(steamId);

          console.log(
            `Попытка ${attempt}: HTTP ${dbdResponse.status}`
          );

          if (dbdResponse.ok) {
            break;
          }
        } catch (error) {
          console.error(
            `Ошибка проверки ${attempt}:`,
            error
          );
        }
      }
    }

    // ========================================
    // 7. Профиль всё ещё не появился
    // ========================================

    if (dbdResponse.status === 404) {
      return res.status(200).send(
        "⏳ Профиль добавляется в базу DBD Tricky. " +
        "Подождите около 5 минут и повторите команду."
      );
    }

    // ========================================
    // 8. Другие ошибки API
    // ========================================

    if (!dbdResponse.ok) {
      return res.status(200).send(
        "❌ Не удалось получить статистику профиля"
      );
    }

    // ========================================
    // 9. Читаем JSON
    // ========================================

    let data;

    try {
      data =
        await dbdResponse.json();
    } catch (error) {
      console.error(
        "Ошибка JSON DBD:",
        error
      );

      return res.status(200).send(
        "❌ Не удалось получить статистику профиля"
      );
    }

    if (
      !data ||
      typeof data !== "object"
    ) {
      return res.status(200).send(
        "❌ Не удалось получить статистику профиля"
      );
    }

    // ========================================
    // 10. Ранги
    // ========================================

    const survivor =
      rankName(data.survivor_rank);

    const killer =
      rankName(data.killer_rank);

    // ========================================
    // 11. Статистика
    // ========================================

    const gens =
      Number(data.gensrepaired) || 0;

    const escapes =
      Number(data.escaped) || 0;

    const sacrificed =
      Number(data.sacrificed) || 0;

    const killed =
      Number(data.killed) || 0;

    const totalKills =
      sacrificed + killed;

    // ========================================
    // 12. Часы
    // ========================================

    const hoursText =
      steamHours ===
      "Время игры скрыто"
        ? "Время игры скрыто"
        : `${steamHours} ч`;

    // ========================================
    // 13. Финальный ответ
    // ========================================

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
// Получение статистики DBD
// ========================================

async function getDbdStats(steamId) {
  return await fetch(
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
}


// ========================================
// Задержка
// ========================================

function sleep(ms) {
  return new Promise(
    resolve => setTimeout(
      resolve,
      ms
    )
  );
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
  // Если это ссылка Steam
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

      // /id/username
      if (
        parts.length >= 2 &&
        parts[0].toLowerCase() === "id"
      ) {
        cleaned = parts[1];
      }

      // /profiles/7656119...
      else if (
        parts.length >= 2 &&
        parts[0].toLowerCase() ===
          "profiles"
      ) {
        const profileId =
          parts[1];

        if (
          /^\d{17}$/.test(
            profileId
          )
        ) {
          return profileId;
        }

        return null;
      }

      else {
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
  // Если уже SteamID64
  // ========================================

  if (
    /^\d{17}$/.test(cleaned)
  ) {
    return cleaned;
  }

  // ========================================
  // Если username
  // ========================================

  try {
    // ----------------------------------------
    // Способ 1: редирект Steam
    // ----------------------------------------

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

    // ----------------------------------------
    // Способ 2: XML Steam
    // ----------------------------------------

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

      // Если Steam вернул ID в другом месте XML
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
    // CDATA
    .replace(
      /^<!\[CDATA\[/,
      ""
    )
    .replace(
      /\]\]>$/,
      ""
    )

    // HTML entities
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
