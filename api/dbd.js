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
    const steamId = await resolveSteamId(input);

    console.log("=================================");
    console.log("INPUT:", input);
    console.log("STEAM ID:", steamId);

    if (!steamId) {
      return res.status(200).send(
        "❌ Ссылка на профиль недействительна или профиль закрыт"
      );
    }

    /*
     * Получаем ник, часы и DBD параллельно.
     */
    const [
      nickname,
      hours,
      dbd
    ] = await Promise.all([
      getSteamNickname(steamId),
      getSteamHours(steamId),
      getDbdStats(steamId)
    ]);

    console.log("FINAL NICKNAME:", nickname);
    console.log("FINAL HOURS:", hours);
    console.log("FINAL DBD:", dbd);

    /*
     * DBD PRIVATE
     */
    if (dbd?.private === true) {
      return res.status(200).send(
        `🎮 Статистика игрока [${nickname}] | ` +
        `⏱ ${hours} | ` +
        `🔒 Статистика DBD скрыта`
      );
    }

    /*
     * DBD ERROR
     */
    if (!dbd) {
      return res.status(200).send(
        "❌ Не удалось получить статистику профиля"
      );
    }

    const survivor =
      rankName(dbd.survivor_rank);

    const killer =
      rankName(dbd.killer_rank);

    const gens =
      toNumber(dbd.gensrepaired);

    const escapes =
      toNumber(dbd.escaped);

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


/*
 * ==========================================
 * НАСТРОЙКИ
 * ==========================================
 */

const TIMEOUT = 5000;


/*
 * ==========================================
 * FETCH С TIMEOUT
 * ==========================================
 */

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


/*
 * ==========================================
 * ОЧИСТКА ВХОДА
 * ==========================================
 */

function cleanInput(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(
      /^https?:\/\//i,
      "https://"
    )
    .replace(
      /\/+$/,
      ""
    );
}


/*
 * ==========================================
 * ПОЛУЧЕНИЕ STEAM ID
 * ==========================================
 */

async function resolveSteamId(input) {

  /*
   * Если уже SteamID64
   */
  if (isSteamId(input)) {
    return input;
  }

  let value = input;

  /*
   * Steam Community URL
   */
  if (
    /steamcommunity\.com/i.test(value)
  ) {
    try {
      const url =
        new URL(value);

      const parts =
        url.pathname
          .split("/")
          .filter(Boolean);

      if (parts.length < 2) {
        return null;
      }

      const type =
        parts[0].toLowerCase();

      value =
        parts[1];

      /*
       * /profiles/7656119...
       */
      if (type === "profiles") {

        return isSteamId(value)
          ? value
          : null;
      }

      /*
       * /id/nickname
       */
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

  /*
   * Пробуем XML
   */
  const encoded =
    encodeURIComponent(value);

  const xmlId =
    await fetchSteamId(
      `https://steamcommunity.com/id/${encoded}/?xml=1`
    );

  if (xmlId) {
    return xmlId;
  }

  /*
   * Запасной вариант
   */
  return fetchSteamId(
    `https://steamcommunity.com/id/${encoded}/`
  );
}


/*
 * ==========================================
 * ПОЛУЧЕНИЕ STEAM ID ИЗ STEAM
 * ==========================================
 */

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

    /*
     * Иногда Steam делает redirect
     * прямо на /profiles/7656119...
     */
    const urlId =
      extractSteamId(
        response.url
      );

    if (urlId) {
      return urlId;
    }

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


/*
 * ==========================================
 * ИЗВЛЕЧЕНИЕ STEAM ID
 * ==========================================
 */

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
    String(value || "")
  );
}


/*
 * ==========================================
 * STEAM НИК
 * ==========================================
 */

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


    /*
     * 1. OG TITLE
     */
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


    /*
     * 2. Steam XML
     */
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


    /*
     * 3. TITLE
     */
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


/*
 * ==========================================
 * ОЧИСТКА НИКА
 * ==========================================
 */

function cleanNickname(value) {

  return decodeHtml(value)
    .replace(
      /^Steam Community\s*::\s*/i,
      ""
    )
    .replace(
      /\s*::\s*Steam Community.*$/i,
      ""
    )
    .trim();
}


/*
 * ==========================================
 * STEAM HOURS
 * ==========================================
 */

async function getSteamHours(steamId) {

  try {

    const url =
      `https://decapi.me/steam/hours/${encodeURIComponent(
        steamId
      )}/381210`;

    console.log(
      "DECAPI REQUEST:",
      url
    );

    const response =
      await fetchWithTimeout(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0",

            "Accept":
              "text/plain,text/html,*/*"
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

    const text =
      (
        await response.text()
      ).trim();

    console.log(
      "DECAPI HOURS RESPONSE:",
      text
    );

    const match =
      text.match(
        /(\d+(?:[.,]\d+)?)/
      );

    if (!match) {

      return "Время игры скрыто";
    }

    const hours =
      Number(
        match[1].replace(
          ",",
          "."
        )
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


/*
 * ==========================================
 * DBD
 * ==========================================
 */

async function getDbdStats(steamId) {

  /*
   * ========================================
   * ШАГ 1 — PROFILE
   * ========================================
   */

  const profileUrl =
    `https://dbd.tricky.lol/?json=profile&profile=${encodeURIComponent(
      steamId
    )}`;

  console.log(
    "================================="
  );

  console.log(
    "DBD PROFILE REQUEST:",
    profileUrl
  );

  const profile =
    await fetchJson(
      profileUrl
    );

  console.log(
    "DBD PROFILE RESULT:",
    profile
  );


  /*
   * Если profile API явно сообщает,
   * что профиль приватный.
   */
  if (
    isDbdPrivateProfile(profile)
  ) {

    console.log(
      ">>> DBD PRIVATE BY PROFILE <<<"
    );

    return {
      private: true
    };
  }


  /*
   * ========================================
   * ШАГ 2 — PLAYERSTATS
   * ========================================
   */

  const statsUrl =
    `https://dbd.tricky.lol/api/playerstats?steamid=${encodeURIComponent(
      steamId
    )}`;

  console.log(
    "DBD STATS REQUEST:",
    statsUrl
  );

  const stats =
    await fetchJson(
      statsUrl
    );

  console.log(
    "DBD STATS RESULT:",
    stats
  );


  /*
   * API не ответил
   */
  if (!stats) {
    return null;
  }


  /*
   * Обрабатываем playerstats.
   */
  return parseDbdResponse(
    stats,
    profile
  );
}


/*
 * ==========================================
 * PROFILE PRIVATE
 * ==========================================
 */

function isDbdPrivateProfile(data) {

  if (
    !data ||
    typeof data !== "object"
  ) {
    return false;
  }

  const message =
    String(
      data.message || ""
    ).toLowerCase()
    .trim();


  /*
   * ВАЖНО:
   *
   * result = 1 означает,
   * что профиль найден.
   *
   * Поэтому result = 1
   * никогда не считаем private.
   */
  if (
    Number(data.result) === 1
  ) {
    return false;
  }


  /*
   * Явное сообщение private.
   */
  if (
    message.includes(
      "appears to be private"
    )
  ) {
    return true;
  }


  if (
    message.includes(
      "don't have any stats for this profile"
    )
  ) {
    return true;
  }


  if (
    message === "private"
  ) {
    return true;
  }


  return false;
}


/*
 * ==========================================
 * FETCH JSON
 * ==========================================
 */

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

    if (!text) {
      return null;
    }

    try {

      return JSON.parse(
        text
      );

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


/*
 * ==========================================
 * ОБРАБОТКА PLAYERSTATS
 * ==========================================
 */

function parseDbdResponse(
  data,
  profile
) {

  if (
    !data ||
    typeof data !== "object"
  ) {
    return null;
  }


  /*
   * ========================================
   * ЕСЛИ PROFILE API СКАЗАЛ result = 1
   *
   * Профиль НЕ private.
   *
   * Никакие нули playerstats
   * здесь не имеют значения.
   * ========================================
   */

  if (
    profile &&
    Number(profile.result) === 1
  ) {

    console.log(
      "DBD PROFILE RESULT = 1 -> PUBLIC"
    );

    return data;
  }


  /*
   * ========================================
   * ЯВНОЕ PRIVATE В PLAYERSTATS
   * ========================================
   */

  const message =
    String(
      data.message || ""
    ).toLowerCase()
    .trim();

  if (
    message.includes(
      "appears to be private"
    ) ||
    message.includes(
      "don't have any stats for this profile"
    ) ||
    message === "private"
  ) {

    return {
      private: true
    };
  }


  /*
   * ========================================
   * ПРОВЕРКА ПУСТОГО PLAYERSTATS
   *
   * Теперь мы НЕ считаем все нули.
   *
   * Смотрим именно на характерную
   * комбинацию приватного профиля.
   * ========================================
   */

  if (
    isEmptyPrivateDbdStats(data)
  ) {

    console.log(
      ">>> DBD PRIVATE EMPTY STATS <<<"
    );

    return {
      private: true
    };
  }


  /*
   * ========================================
   * ПРОВЕРКА НАЛИЧИЯ СТАТИСТИКИ
   * ========================================
   */

  const hasStats =
    data.survivor_rank != null ||
    data.killer_rank != null ||
    data.gensrepaired != null ||
    data.escaped != null ||
    data.sacrificed != null ||
    data.killed != null ||
    data.playtime != null;


  if (!hasStats) {

    return null;
  }


  /*
   * Нормальная статистика.
   */
  return data;
}


/*
 * ==========================================
 * ОПРЕДЕЛЕНИЕ ПУСТОГО PRIVATE JSON
 * ==========================================
 *
 * Характерный ответ:
 *
 * survivor_rank = 20
 * killer_rank   = 20
 * playtime      = 0
 * updated_at    = 0
 * bloodpoints   = 0
 *
 * И практически все игровые показатели = 0.
 *
 * ВАЖНО:
 *
 * Не проверяем просто количество нулей.
 * ==========================================
 */

function isEmptyPrivateDbdStats(data) {

  /*
   * Должны присутствовать основные поля.
   */
  if (
    data.survivor_rank == null ||
    data.killer_rank == null ||
    data.playtime == null ||
    data.updated_at == null
  ) {
    return false;
  }


  /*
   * Приватный пустой профиль обычно
   * имеет оба ранга на 20.
   */
  const ranksAreEmpty =
    Number(data.survivor_rank) === 20 &&
    Number(data.killer_rank) === 20;


  if (!ranksAreEmpty) {
    return false;
  }


  /*
   * Время игры должно быть 0.
   */
  if (
    Number(data.playtime) !== 0
  ) {
    return false;
  }


  /*
   * updated_at должен быть 0.
   */
  if (
    Number(data.updated_at) !== 0
  ) {
    return false;
  }


  /*
   * Считаем только реальные игровые
   * статистические поля.
   *
   * Не учитываем:
   *
   * steamid
   * hash
   * created_at
   * updated_at
   * playtime
   * banstate
   */

  const ignoredFields = new Set([
    "steamid",
    "hash",
    "created_at",
    "updated_at",
    "playtime",
    "banstate"
  ]);


  let statisticFields = 0;
  let zeroStatistics = 0;


  for (
    const [key, value]
    of Object.entries(data)
  ) {

    if (
      ignoredFields.has(key)
    ) {
      continue;
    }


    /*
     * Учитываем только числовые
     * статистические значения.
     */
    if (
      typeof value !== "number"
    ) {
      continue;
    }


    statisticFields++;


    if (
      value === 0
    ) {
      zeroStatistics++;
    }
  }


  console.log(
    "DBD STATISTIC FIELDS:",
    statisticFields
  );

  console.log(
    "DBD ZERO STATISTIC FIELDS:",
    zeroStatistics
  );


  /*
   * Для приватного JSON почти все
   * статистические поля нулевые.
   *
   * Используем 95%.
   */
  if (
    statisticFields > 50 &&
    (
      zeroStatistics /
      statisticFields
    ) >= 0.95
  ) {

    return true;
  }


  return false;
}


/*
 * ==========================================
 * ЧИСЛО
 * ==========================================
 */

function toNumber(value) {

  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}


/*
 * ==========================================
 * HTML / CDATA
 * ==========================================
 */

function decodeHtml(text) {

  return String(
    text || ""
  )
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


/*
 * ==========================================
 * РАНГИ
 * ==========================================
 */

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
