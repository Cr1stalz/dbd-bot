export default async function handler(req, res) {
  res.setHeader(
    "Content-Type",
    "text/plain; charset=utf-8"
  );

  let rawInput = req.query?.steamid
    ? String(req.query.steamid).trim()
    : "";

  const appid = "381210";

  if (!rawInput) {
    return res.status(200).send(
      "⚠️ Укажите SteamID или ссылку на профиль!"
    );
  }

  // ========================================
  // Очистка ввода
  // ========================================

  rawInput = rawInput
    .replace(/^["']|["']$/g, "")
    .trim();

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

    console.log(
      "INPUT:",
      rawInput
    );

    console.log(
      "STEAM ID:",
      steamId
    );

    if (!steamId) {
      return res.status(200).send(
        "❌ Ссылка на профиль недействительна или профиль закрыт"
      );
    }

    // ========================================
    // 2. Получаем ник Steam
    // ========================================

    let steamNickname =
      "Неизвестно";

    try {
      const response =
        await fetch(
          `https://steamcommunity.com/profiles/${steamId}/?xml=1`,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0"
            },
            cache: "no-store"
          }
        );

      if (response.ok) {
        const xml =
          await response.text();

        const match =
          xml.match(
            /<steamID>([\s\S]*?)<\/steamID>/
          );

        if (
          match &&
          match[1]
        ) {
          steamNickname =
            decodeHtml(
              match[1].trim()
            );
        }
      }
    } catch (error) {
      console.error(
        "Ошибка Steam nickname:",
        error
      );
    }

    // ========================================
    // 3. Получаем часы
    // ========================================

    let steamHours =
      "Время игры скрыто";

    try {
      const response =
        await fetch(
          `https://decapi.me/steam/hours/${encodeURIComponent(
            steamId
          )}/${appid}`,
          {
            cache: "no-store"
          }
        );

      if (response.ok) {
        const text =
          (
            await response.text()
          ).trim();

        const match =
          text.match(
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
        "Ошибка часов:",
        error
      );
    }

    // ========================================
    // 4. Получаем DBD статистику
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

      data =
        await response.json();

    } catch (error) {
      console.error(
        "Ошибка DBD API:",
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
    // 5. Ранги
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
    // 6. Статистика
    // ========================================

    const gens =
      Number(
        data.gensrepaired
      ) || 0;

    const escapes =
      Number(
        data.escaped
      ) || 0;

    const totalKills =
      (Number(
        data.sacrificed
      ) || 0) +
      (Number(
        data.killed
      ) || 0);

    // ========================================
    // 7. Финальный ответ
    // ========================================

    const result =
      `🎮 Статистика игрока [${steamNickname}] | ` +
      `⏱ ${
        steamHours ===
        "Время игры скрыто"
          ? "Время игры скрыто"
          : `${steamHours} ч`
      } | ` +
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

  cleaned = cleaned.replace(
    /^["']|["']$/g,
    ""
  );

  cleaned = cleaned.replace(
    /^https?:\/\//i,
    "https://"
  );

  // ========================================
  // Вариант 1 — обычный SteamID64
  // ========================================

  if (
    /^7656119\d{10}$/.test(
      cleaned
    )
  ) {
    return cleaned;
  }

  // ========================================
  // Вариант 2 — Steam URL
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
      // /profiles/765611...
      // --------------------------------------

      if (
        type === "profiles"
      ) {

        if (
          /^7656119\d{10}$/.test(
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
        type !== "id"
      ) {
        return null;
      }

      // Теперь пытаемся определить username
      // через Steam.
      cleaned = value;

    } catch (error) {

      console.error(
        "Ошибка разбора URL:",
        error
      );

      return null;
    }
  }

  // ========================================
  // Вариант 3 — username через Steam redirect
  // ========================================

  try {

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
              "Mozilla/5.0",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
          }
        }
      );

    // ======================================
    // Проверяем Location
    // ======================================

    const location =
      response.headers.get(
        "location"
      );

    console.log(
      "STEAM LOCATION:",
      location
    );

    if (location) {

      const match =
        location.match(
          /\/profiles\/(7656119\d{10})/
        );

      if (match) {
        return match[1];
      }
    }

  } catch (error) {

    console.error(
      "Ошибка Steam redirect:",
      error
    );
  }

  // ========================================
  // Вариант 4 — Steam XML
  // ========================================

  try {

    const xmlUrl =
      `https://steamcommunity.com/id/${encodeURIComponent(
        cleaned
      )}/?xml=1`;

    const response =
      await fetch(
        xmlUrl,
        {
          method: "GET",

          headers: {
            "User-Agent":
              "Mozilla/5.0",
            "Accept":
              "application/xml,text/xml,*/*"
          },

          cache: "no-store"
        }
      );

    console.log(
      "STEAM XML STATUS:",
      response.status
    );

    if (response.ok) {

      const xml =
        await response.text();

      // steamID64
      let match =
        xml.match(
          /<steamID64>\s*(7656119\d{10})\s*<\/steamID64>/i
        );

      if (match) {
        return match[1];
      }

      // Иногда SteamID встречается
      // просто внутри XML
      match =
        xml.match(
          /(7656119\d{10})/
        );

      if (match) {
        return match[1];
      }
    }

  } catch (error) {

    console.error(
      "Ошибка Steam XML:",
      error
    );
  }

  return null;
}


// ========================================
// Обработка ника
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
// Ранги DBD
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
    ranks[
      Number(rank)
    ] ||
    "Неизвестно"
  );
}
