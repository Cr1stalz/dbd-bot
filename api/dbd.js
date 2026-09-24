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
 *
 * ТОЛЬКО DECAPI
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

      console.log(
        "DECAPI NOT OK:",
        response.status
      );

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

    /*
     * Примеры:
     *
     * 746.53 hours
     * 746.5 hours
     * 746 hours
     */
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

    /*
     * 746.53 -> 746.5
     * 746.50 -> 746.5
     * 746.00 -> 746
     */
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
 *
 * ЛОГИКА:
 *
 * 1. profile
 * 2. если profile говорит PRIVATE:
 *       сразу private
 * 3. иначе playerstats
 * 4. если playerstats содержит
 *    больше 10 нулевых значений:
 *       PRIVATE
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
   * ========================================
   * ЕСЛИ ПРОФИЛЬ ЯВНО PRIVATE
   * ========================================
   */

  if (
    isDbdPrivateProfile(
      profile
    )
  ) {

    console.log(
      ">>> DBD PRIVATE DETECTED BY PROFILE <<<"
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
   * Если API не ответил
   */
  if (!stats) {
    return null;
  }


  /*
   * Обрабатываем JSON.
   */
  return parseDbdResponse(
    stats
  );
}


/*
 * ==========================================
 * ПРОВЕРКА PRIVATE ПО PROFILE API
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

  console.log(
    "PROFILE RESULT VALUE:",
    data.result
  );

  console.log(
    "PROFILE MESSAGE:",
    message
  );


  /*
   * Основной ответ Tricky:
   *
   * result = 0
   * message содержит:
   * "appears to be private"
   */
  if (
    Number(data.result) === 0 &&
    message.includes(
      "appears to be private"
    )
  ) {
    return true;
  }


  /*
   * Дополнительная защита
   */
  if (
    Number(data.result) === 0 &&
    message.includes(
      "don't have any stats for this profile"
    )
  ) {
    return true;
  }


  /*
   * Если API напишет просто private
   */
  if (
    Number(data.result) === 0 &&
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

      console.log(
        "FETCH NOT OK:",
        response.status
      );

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
 *
 * > 10 НУЛЕЙ = PRIVATE
 * ==========================================
 */

function parseDbdResponse(data) {

  if (
    !data ||
    typeof data !== "object"
  ) {
    return null;
  }


  /*
   * ========================================
   * PRIVATE ПО СООБЩЕНИЮ API
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

    console.log(
      ">>> DBD PRIVATE BY MESSAGE <<<"
    );

    return {
      private: true
    };
  }


  /*
   * ========================================
   * СЧИТАЕМ НУЛИ ВО ВСЁМ JSON
   * ========================================
   */

  const zeroCount =
    countZerosInJson(data);

  console.log(
    "DBD ZERO COUNT:",
    zeroCount
  );


  /*
   * ========================================
   * БОЛЬШЕ 10 НУЛЕЙ = PRIVATE
   *
   * 10  -> НЕ private
   * 11+ -> private
   * ========================================
   */

  if (zeroCount > 10) {

    console.log(
      ">>> DBD PRIVATE: MORE THAN 10 ZEROS <<<"
    );

    return {
      private: true
    };
  }


  /*
   * ========================================
   * ПРОВЕРЯЕМ НАЛИЧИЕ СТАТИСТИКИ
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
   * Нулевые значения разрешены,
   * если их 10 или меньше.
   */
  return data;
}


/*
 * ==========================================
 * ПОДСЧЁТ НУЛЕЙ В JSON
 * ==========================================
 */

function countZerosInJson(data) {

  let count = 0;


  function walk(value) {

    /*
     * Числовой 0
     */
    if (value === 0) {
      count++;
      return;
    }


    /*
     * Строковый "0"
     */
    if (
      typeof value === "string" &&
      value.trim() === "0"
    ) {
      count++;
      return;
    }


    /*
     * Массив
     */
    if (Array.isArray(value)) {

      for (const item of value) {
        walk(item);
      }

      return;
    }


    /*
     * Объект
     */
    if (
      value !== null &&
      typeof value === "object"
    ) {

      for (const key of Object.keys(value)) {
        walk(value[key]);
      }
    }
  }


  walk(data);

  return count;
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
