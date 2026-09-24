export default async function handler(req, res) {
  res.setHeader(
    "Content-Type",
    "text/plain; charset=utf-8"
  );

  const input = cleanInput(req.query?.steamid);

  if (!input) {
    return res.status(200).send(
      "⚠️ Укажите SteamID или ссылку на профиль!"
    );
  }

  try {
    // Получаем SteamID
    const steamId = await resolveSteamId(input);

    console.log("INPUT:", input);
    console.log("STEAM ID:", steamId);

    if (!steamId) {
      return res.status(200).send(
        "❌ Ссылка на профиль недействительна или профиль закрыт"
      );
    }

    // Получаем всё параллельно
    const [nickname, hours, dbd] = await Promise.all([
      getSteamNickname(steamId),
      getSteamHours(steamId),
      getDbdStats(steamId)
    ]);

    // DBD закрыт
    if (dbd?.private) {
      return res.status(200).send(
        `🎮 Статистика игрока [${nickname}] | ` +
        `⏱ ${hours} | ` +
        `🔒 Статистика DBD скрыта`
      );
    }

    // DBD не отвечает
    if (!dbd) {
      return res.status(200).send(
        "❌ Не удалось получить статистику профиля"
      );
    }

    const survivor = rankName(
      dbd.survivor_rank
    );

    const killer = rankName(
      dbd.killer_rank
    );

    const gens = toNumber(
      dbd.gensrepaired
    );

    const escapes = toNumber(
      dbd.escaped
    );

    const kills =
      toNumber(dbd.sacrificed) +
      toNumber(dbd.killed);

    return res.status(200).send(
      `🎮 Статистика игрока [${nickname}] | ` +
      `⏱ ${hours} | ` +
      `🧑 ${survivor} | ` +
      `🔪 ${killer} | ` +
      `🛠 Гены: ${gens} | ` +
      `🚪 Побеги: ${escapes} | ` +
      `💀 Убито: ${kills}`
    );

  } catch (error) {
    console.error(
      "GENERAL ERROR:",
      error
    );

    return res.status(200).send(
      "❌ Не удалось получить статистику профиля"
    );
  }
}


/* =========================================================
   НАСТРОЙКИ
========================================================= */

const TIMEOUT = 4000;


/* =========================================================
   FETCH С ТАЙМАУТОМ
========================================================= */

async function fetchWithTimeout(
  url,
  options = {},
  timeout = TIMEOUT
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeout
    );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: "no-store"
    });

  } finally {
    clearTimeout(timer);
  }
}


/* =========================================================
   INPUT
========================================================= */

function cleanInput(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(
      /^https?:\/\//i,
      "https://"
    );
}


/* =========================================================
   ПОЛУЧЕНИЕ STEAMID
========================================================= */

async function resolveSteamId(input) {
  if (isSteamId(input)) {
    return input;
  }

  let value = input;

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
        "STEAM URL ERROR:",
        error
      );

      return null;
    }
  }

  const encoded =
    encodeURIComponent(value);

  // Сначала XML
  const xmlId =
    await fetchSteamId(
      `https://steamcommunity.com/id/${encoded}/?xml=1`
    );

  if (xmlId) {
    return xmlId;
  }

  // Затем обычная страница
  return fetchSteamId(
    `https://steamcommunity.com/id/${encoded}/`
  );
}


/* =========================================================
   ПОИСК STEAMID НА СТРАНИЦЕ
========================================================= */

async function fetchSteamId(url) {
  try {
    const response =
      await fetchWithTimeout(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0"
          }
        }
      );

    console.log(
      "STEAM STATUS:",
      response.status
    );

    console.log(
      "STEAM URL:",
      response.url
    );

    // SteamID из URL
    const urlId =
      extractSteamId(
        response.url
      );

    if (urlId) {
      return urlId;
    }

    // SteamID из страницы
    const body =
      await response.text();

    return extractSteamId(body);

  } catch (error) {
    console.error(
      "STEAM ID ERROR:",
      error.name === "AbortError"
        ? "TIMEOUT"
        : error
    );

    return null;
  }
}


/* =========================================================
   EXTRACT STEAMID
========================================================= */

function extractSteamId(text) {
  const match =
    String(text || "").match(
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
    const response =
      await fetchWithTimeout(
        `https://steamcommunity.com/profiles/${steamId}/`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0",

            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
          }
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

    // =====================================================
    // OG TITLE
    // =====================================================

    let match =
      html.match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
      );

    if (!match) {
      match =
        html.match(
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i
        );
    }

    if (match?.[1]) {
      const nickname =
        cleanNickname(
          match[1]
        );

      if (nickname) {
        return nickname;
      }
    }

    // =====================================================
    // STEAMID XML
    // =====================================================

    match =
      html.match(
        /<steamID>([\s\S]*?)<\/steamID>/i
      );

    if (match?.[1]) {
      const nickname =
        cleanNickname(
          match[1]
        );

      if (nickname) {
        return nickname;
      }
    }

    // =====================================================
    // TITLE
    // =====================================================

    match =
      html.match(
        /<title>([\s\S]*?)<\/title>/i
      );

    if (match?.[1]) {
      const nickname =
        cleanNickname(
          match[1].replace(
            /\s*::\s*Steam Community.*$/i,
            ""
          )
        );

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
      "NICK ERROR:",
      error.name === "AbortError"
        ? "TIMEOUT"
        : error
    );
  }

  return "Неизвестно";
}


function cleanNickname(value) {
  return decodeHtml(value)
    .replace(
      /^Steam Community\s*::\s*/i,
      ""
    )
    .trim();
}


/* =========================================================
   ЧАСЫ STEAM — DECAPI
========================================================= */

async function getSteamHours(steamId) {
  try {
    const url =
      `https://decapi.me/steam/hours/${encodeURIComponent(
        steamId
      )}/381210`;

    const response =
      await fetchWithTimeout(
        url,
        {
          headers: {
            "User-Agent": "Mozilla/5.0"
          }
        }
      );

    console.log(
      "DECAPI STATUS:",
      response.status
    );

    if (!response.ok) {
      return "Время игры скрыто";
    }

    const text = (
      await response.text()
    ).trim();

    console.log(
      "DECAPI HOURS RESPONSE:",
      text
    );

    // Ищем число в ответе DecAPI:
    // 746.53 hours
    // 746.53
    // 746,53 hours
    const match = text.match(
      /(\d+(?:[.,]\d+)?)/
    );

    if (!match) {
      return "Время игры скрыто";
    }

    const hours = Number(
      match[1].replace(",", ".")
    );

    if (
      !Number.isFinite(hours) ||
      hours < 0 ||
      hours >= 100000
    ) {
      return "Время игры скрыто";
    }

    return `${hours
      .toFixed(1)
      .replace(/\.0$/, "")} ч`;

  } catch (error) {
    console.error(
      "DECAPI ERROR:",
      error.name === "AbortError"
        ? "TIMEOUT"
        : error
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

  // =====================================================
  // 1. PLAYERSTATS
  // =====================================================

  const first =
    await fetchJson(statsUrl);

  if (first) {
    const result =
      parseDbdResponse(first);

    if (result) {
      return result;
    }
  }

  // =====================================================
  // 2. PROFILE FALLBACK
  // =====================================================

  const profileUrl =
    `https://dbd.tricky.lol/?json=profile&profile=${encodeURIComponent(
      steamId
    )}`;

  console.log(
    "DBD PROFILE REQUEST:",
    profileUrl
  );

  const profile =
    await fetchJson(profileUrl);

  if (profile) {
    return parseDbdResponse(
      profile
    );
  }

  return null;
}


/* =========================================================
   JSON FETCH С ТАЙМАУТОМ
========================================================= */

async function fetchJson(url) {
  try {
    const response =
      await fetchWithTimeout(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0",

            "Accept":
              "application/json,text/plain,*/*"
          }
        }
      );

    console.log(
      "FETCH STATUS:",
      response.status,
      url
    );

    if (!response.ok) {
      return null;
    }

    const text =
      await response.text();

    console.log(
      "FETCH RESPONSE:",
      text
    );

    try {
      return JSON.parse(text);
    } catch (error) {
      console.error(
        "JSON PARSE ERROR:",
        error
      );

      return null;
    }

  } catch (error) {
    console.error(
      "FETCH ERROR:",
      error.name === "AbortError"
        ? "TIMEOUT"
        : error
    );

    return null;
  }
}


/* =========================================================
   ОБРАБОТКА DBD RESPONSE
========================================================= */

function parseDbdResponse(data) {
  if (
    !data ||
    typeof data !== "object"
  ) {
    return null;
  }

  // Закрытая статистика
  if (
    Number(data.result) === 0
  ) {
    const message =
      String(
        data.message || ""
      ).toLowerCase();

    if (
      message.includes("private") ||
      message.includes(
        "don't have any stats"
      ) ||
      message.includes(
        "no stats"
      )
    ) {
      return {
        private: true
      };
    }

    return null;
  }

  // Нормальная статистика
  return data;
}


/* =========================================================
   NUMBER
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
  return String(text || "")
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
