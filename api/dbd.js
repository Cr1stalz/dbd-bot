export default async function handler(req, res) {
  res.setHeader(
    "Content-Type",
    "text/plain; charset=utf-8"
  );

  let input = String(
    req.query?.steamid || ""
  ).trim();

  if (!input) {
    return res.status(200).send(
      "⚠️ Укажите SteamID или ссылку на профиль!"
    );
  }

  input = cleanInput(input);

  try {
    // ========================================================
    // STEAMID64
    // ========================================================

    const steamId = await resolveSteamId(input);

    console.log("INPUT:", input);
    console.log("STEAM ID:", steamId);

    if (!steamId) {
      return res.status(200).send(
        "❌ Ссылка на профиль недействительна или профиль закрыт."
      );
    }

    // ========================================================
    // НИК + ЧАСЫ STEAM + DBD
    // ========================================================

    const [
      nickname,
      hours,
      dbd
    ] = await Promise.all([
      getSteamNickname(steamId),
      getSteamHours(steamId),
      getDbdStats(steamId)
    ]);

    if (!dbd) {
      return res.status(200).send(
        "❌ Не удалось получить статистику профиля"
      );
    }

    // ========================================================
    // РАНГИ
    // ========================================================

    const survivor =
      rankName(dbd.survivor_rank);

    const killer =
      rankName(dbd.killer_rank);

    // ========================================================
    // СТАТИСТИКА
    // ========================================================

    const gens =
      toNumber(dbd.gensrepaired);

    const escapes =
      toNumber(dbd.escaped);

    const totalKills =
      toNumber(dbd.sacrificed) +
      toNumber(dbd.killed);

    // ========================================================
    // ВЫВОД
    // ========================================================

    const result =
      `🎮 Статистика игрока [${nickname}] | ` +
      `⏱ ${hours} | ` +
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
      "❌ Не удалось получить статистику профиля"
    );
  }
}


/* =========================================================
   ОЧИСТКА INPUT
========================================================= */

function cleanInput(input) {
  return String(input)
    .trim()
    .replace(/^[\"']|[\"']$/g, "")
    .replace(
      /^https?:\/\//i,
      "https://"
    );
}


/* =========================================================
   ПОЛУЧЕНИЕ STEAMID64
========================================================= */

async function resolveSteamId(input) {
  let value = cleanInput(input);

  // Прямой SteamID64
  if (isSteamId(value)) {
    return value;
  }

  // Steam URL
  if (/steamcommunity\.com/i.test(value)) {
    try {
      const url = new URL(value);

      const parts =
        url.pathname
          .split("/")
          .filter(Boolean);

      if (parts.length < 2) {
        return null;
      }

      const type =
        parts[0].toLowerCase();

      value = parts[1];

      // /profiles/7656119...
      if (type === "profiles") {
        return isSteamId(value)
          ? value
          : null;
      }

      // /id/username
      if (type !== "id") {
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

  const encoded =
    encodeURIComponent(value);

  // ========================================================
  // 1. STEAM XML
  // ========================================================

  try {
    const response = await fetch(
      `https://steamcommunity.com/id/${encoded}/?xml=1`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0"
        },
        cache: "no-store"
      }
    );

    console.log(
      "STEAM XML STATUS:",
      response.status
    );

    console.log(
      "STEAM XML URL:",
      response.url
    );

    // SteamID из URL после редиректа
    const idFromUrl =
      extractSteamId(response.url);

    if (idFromUrl) {
      return idFromUrl;
    }

    const body =
      await response.text();

    // SteamID из XML
    const idFromBody =
      extractSteamId(body);

    if (idFromBody) {
      return idFromBody;
    }

  } catch (error) {
    console.error(
      "Ошибка Steam XML:",
      error
    );
  }

  // ========================================================
  // 2. ОБЫЧНАЯ СТРАНИЦА STEAM
  // ========================================================

  try {
    const response = await fetch(
      `https://steamcommunity.com/id/${encoded}/`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",

          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },

        cache: "no-store"
      }
    );

    console.log(
      "STEAM HTML STATUS:",
      response.status
    );

    console.log(
      "STEAM HTML URL:",
      response.url
    );

    // SteamID из URL после редиректа
    const idFromUrl =
      extractSteamId(response.url);

    if (idFromUrl) {
      return idFromUrl;
    }

    const html =
      await response.text();

    // SteamID из HTML
    const idFromHtml =
      extractSteamId(html);

    if (idFromHtml) {
      return idFromHtml;
    }

  } catch (error) {
    console.error(
      "Ошибка Steam HTML:",
      error
    );
  }

  return null;
}


/* =========================================================
   ПОИСК STEAMID64
========================================================= */

function extractSteamId(text) {
  if (!text) {
    return null;
  }

  const match =
    String(text).match(
      /7656119\d{10}/
    );

  return match
    ? match[0]
    : null;
}


function isSteamId(value) {
  return /^7656119\d{10}$/.test(
    value
  );
}


/* =========================================================
   НИК STEAM
========================================================= */

async function getSteamNickname(steamId) {
  try {
    const response = await fetch(
      `https://steamcommunity.com/profiles/${steamId}/`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",

          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },

        cache: "no-store"
      }
    );

    console.log(
      "NICK STATUS:",
      response.status
    );

    if (!response.ok) {
      return "Неизвестно";
    }

    const html =
      await response.text();

    // ======================================================
    // 1. OG TITLE
    // ======================================================

    let match = html.match(
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i
    );

    if (!match?.[1]) {
      match = html.match(
        /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*>/i
      );
    }

    if (match?.[1]) {
      let nickname =
        decodeHtml(
          match[1].trim()
        );

      nickname =
        nickname.replace(
          /^Steam Community\s*::\s*/i,
          ""
        ).trim();

      if (nickname) {
        return nickname;
      }
    }

    // ======================================================
    // 2. STEAMID XML
    // ======================================================

    match = html.match(
      /<steamID>([\s\S]*?)<\/steamID>/i
    );

    if (match?.[1]) {
      let nickname =
        decodeHtml(
          match[1].trim()
        );

      nickname =
        nickname.replace(
          /^Steam Community\s*::\s*/i,
          ""
        ).trim();

      if (nickname) {
        return nickname;
      }
    }

    // ======================================================
    // 3. TITLE
    // ======================================================

    match = html.match(
      /<title>([\s\S]*?)<\/title>/i
    );

    if (match?.[1]) {
      let nickname =
        decodeHtml(
          match[1].trim()
        );

      nickname =
        nickname
          .replace(
            /^Steam Community\s*::\s*/i,
            ""
          )
          .replace(
            /\s*::\s*Steam Community.*$/i,
            ""
          )
          .trim();

      if (
        nickname &&
        !/^Steam Community$/i.test(
          nickname
        )
      ) {
        return nickname;
      }
    }

  } catch (error) {
    console.error(
      "Ошибка получения ника:",
      error
    );
  }

  return "Неизвестно";
}


/* =========================================================
   ЧАСЫ — ТОЛЬКО STEAM
========================================================= */

async function getSteamHours(steamId) {
  try {
    const response = await fetch(
      `https://steamcommunity.com/profiles/${steamId}/games?xml=1`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",

          "Accept":
            "application/xml,text/xml,text/html,*/*"
        },

        cache: "no-store"
      }
    );

    console.log(
      "STEAM GAMES STATUS:",
      response.status
    );

    if (!response.ok) {
      return "Время игры скрыто";
    }

    const xml =
      await response.text();

    console.log(
      "STEAM GAMES RESPONSE LENGTH:",
      xml.length
    );

    // ======================================================
    // Ищем Dead by Daylight
    // AppID = 381210
    // ======================================================

    const gameRegex =
      /<game>([\s\S]*?)<\/game>/gi;

    let match;

    while (
      (match = gameRegex.exec(xml)) !== null
    ) {
      const game =
        match[1];

      const appIdMatch =
        game.match(
          /<appID>(\d+)<\/appID>/i
        );

      if (
        !appIdMatch ||
        appIdMatch[1] !== "381210"
      ) {
        continue;
      }

      console.log(
        "STEAM: DEAD BY DAYLIGHT FOUND"
      );

      // ====================================================
      // Часы Steam
      // ====================================================

      const hoursMatch =
        game.match(
          /<hoursOnRecord>([\d.,]+)<\/hoursOnRecord>/i
        );

      if (hoursMatch?.[1]) {
        const hours =
          parseFloat(
            hoursMatch[1]
              .replace(",", ".")
          );

        if (
          Number.isFinite(hours) &&
          hours >= 0 &&
          hours < 100000
        ) {
          return `${hours
            .toFixed(1)
            .replace(/\.0$/, "")} ч`;
        }
      }

      // ====================================================
      // Если Steam отдаёт минуты
      // ====================================================

      const minutesMatch =
        game.match(
          /<minutesOnRecord>(\d+)<\/minutesOnRecord>/i
        );

      if (minutesMatch?.[1]) {
        const minutes =
          Number(
            minutesMatch[1]
          );

        if (
          Number.isFinite(minutes) &&
          minutes >= 0
        ) {
          const hours =
            minutes / 60;

          return `${hours
            .toFixed(1)
            .replace(/\.0$/, "")} ч`;
        }
      }

      return "Время игры скрыто";
    }

    console.log(
      "STEAM: DBD НЕ НАЙДЕН"
    );

    return "Время игры скрыто";

  } catch (error) {
    console.error(
      "Ошибка получения часов из Steam:",
      error
    );

    return "Время игры скрыто";
  }
}


/* =========================================================
   DBD СТАТИСТИКА
========================================================= */

async function getDbdStats(steamId) {
  const statsUrl =
    `https://dbd.tricky.lol/api/playerstats?steamid=${encodeURIComponent(
      steamId
    )}`;

  try {
    // ======================================================
    // 1. Обычный запрос
    // ======================================================

    const response = await fetch(
      statsUrl,
      {
        method: "GET",

        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json"
        },

        cache: "no-store"
      }
    );

    console.log(
      "DBD STATS STATUS:",
      response.status
    );

    if (response.ok) {
      try {
        const data =
          await response.json();

        if (
          data &&
          typeof data === "object"
        ) {
          return data;
        }

      } catch (error) {
        console.error(
          "Ошибка JSON DBD:",
          error
        );
      }
    }

    // ======================================================
    // 2. PROFILE REQUEST
    // ======================================================

    const profileUrl =
      `https://dbd.tricky.lol/?json=profile&profile=${encodeURIComponent(
        steamId
      )}`;

    console.log(
      "DBD PROFILE REQUEST:",
      profileUrl
    );

    try {
      const profileResponse =
        await fetch(
          profileUrl,
          {
            method: "GET",

            headers: {
              "User-Agent":
                "Mozilla/5.0",

              "Accept":
                "application/json,text/plain,*/*",

              "Referer":
                "https://dbd.tricky.lol/"
            },

            cache: "no-store"
          }
        );

      console.log(
        "DBD PROFILE STATUS:",
        profileResponse.status
      );

      await profileResponse.text();

    } catch (error) {
      console.error(
        "Ошибка DBD profile:",
        error
      );
    }

    // ======================================================
    // 3. Повторный запрос
    // ======================================================

    try {
      const retryResponse =
        await fetch(
          statsUrl,
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

      console.log(
        "DBD RETRY STATUS:",
        retryResponse.status
      );

      if (retryResponse.ok) {
        const data =
          await retryResponse.json();

        if (
          data &&
          typeof data === "object"
        ) {
          return data;
        }
      }

    } catch (error) {
      console.error(
        "Ошибка повторного DBD:",
        error
      );
    }

  } catch (error) {
    console.error(
      "Ошибка DBD API:",
      error
    );
  }

  return null;
}


/* =========================================================
   ЧИСЛА
========================================================= */

function toNumber(value) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}


/* =========================================================
   HTML / CDATA
========================================================= */

function decodeHtml(text) {
  return String(text)
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


/* =========================================================
   РАНГИ DBD
========================================================= */

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
