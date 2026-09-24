export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  let input = String(req.query?.steamid || "").trim();

  if (!input) {
    return res.status(200).send(
      "⚠️ Укажите SteamID или ссылку на профиль!"
    );
  }

  input = cleanInput(input);

  try {
    // 1. Получаем SteamID64
    const steamId = await resolveSteamId(input);

    console.log("INPUT:", input);
    console.log("STEAM ID:", steamId);

    if (!steamId) {
      return res.status(200).send(
        "❌ Ссылка на профиль недействительна или профиль закрыт"
      );
    }

    // 2. Получаем всё остальное параллельно
    const [nickname, hours, dbd] = await Promise.all([
      getSteamNickname(steamId),
      getSteamHours(steamId),
      getDbdStats(steamId)
    ]);

    if (!dbd) {
      return res.status(200).send(
        "❌ Не удалось получить статистику профиля"
      );
    }

    // 3. Формируем ответ
    const result =
      `🎮 Статистика игрока [${nickname}] | ` +
      `⏱ ${hours} | ` +
      `🧑 ${rankName(dbd.survivor_rank)} | ` +
      `🔪 ${rankName(dbd.killer_rank)} | ` +
      `🛠 Гены: ${toNumber(dbd.gensrepaired)} | ` +
      `🚪 Побеги: ${toNumber(dbd.escaped)} | ` +
      `💀 Убито: ${toNumber(dbd.sacrificed) + toNumber(dbd.killed)}`;

    return res.status(200).send(result);

  } catch (error) {
    console.error("Общая ошибка:", error);

    return res.status(200).send(
      "❌ Не удалось получить статистику профиля"
    );
  }
}


/* =========================
   INPUT
========================= */

function cleanInput(input) {
  return String(input)
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^https?:\/\//i, "https://");
}


/* =========================
   STEAM ID
========================= */

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

      const parts = url.pathname
        .split("/")
        .filter(Boolean);

      if (parts.length < 2) {
        return null;
      }

      const type = parts[0].toLowerCase();
      value = parts[1];

      // /profiles/7656119...
      if (type === "profiles") {
        return isSteamId(value) ? value : null;
      }

      // Нам нужен /id/...
      if (type !== "id") {
        return null;
      }

    } catch (error) {
      console.error("Ошибка URL:", error);
      return null;
    }
  }

  const encoded = encodeURIComponent(value);

  /*
   * Сначала XML.
   * Если Steam редиректит на /profiles/...
   * response.url уже будет содержать настоящий SteamID.
   */
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

    console.log("STEAM STATUS:", response.status);
    console.log("STEAM FINAL URL:", response.url);

    // Проверяем конечный URL после редиректа
    const idFromUrl = extractSteamId(response.url);

    if (idFromUrl) {
      return idFromUrl;
    }

    const body = await response.text();

    // SteamID64 в XML/HTML
    const idFromBody = extractSteamId(body);

    if (idFromBody) {
      return idFromBody;
    }

  } catch (error) {
    console.error("Ошибка Steam XML:", error);
  }

  /*
   * Дополнительный fallback:
   * обычная страница профиля.
   */
  try {
    const response = await fetch(
      `https://steamcommunity.com/id/${encoded}/`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0"
        },
        cache: "no-store"
      }
    );

    console.log("STEAM HTML STATUS:", response.status);
    console.log("STEAM HTML URL:", response.url);

    const idFromUrl = extractSteamId(response.url);

    if (idFromUrl) {
      return idFromUrl;
    }

    const html = await response.text();

    const idFromHtml = extractSteamId(html);

    if (idFromHtml) {
      return idFromHtml;
    }

  } catch (error) {
    console.error("Ошибка Steam HTML:", error);
  }

  return null;
}


function extractSteamId(text) {
  if (!text) {
    return null;
  }

  const match = String(text).match(
    /7656119\d{10}/
  );

  return match ? match[0] : null;
}


function isSteamId(value) {
  return /^7656119\d{10}$/.test(value);
}


/* =========================
   STEAM NICKNAME
========================= */

async function getSteamNickname(steamId) {
  try {
    const response = await fetch(
      `https://steamcommunity.com/profiles/${steamId}/?xml=1`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0"
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return "Неизвестно";
    }

    const xml = await response.text();

    const match = xml.match(
      /<steamID>([\s\S]*?)<\/steamID>/i
    );

    if (!match?.[1]) {
      return "Неизвестно";
    }

    return decodeHtml(match[1].trim());

  } catch (error) {
    console.error("Ошибка ника:", error);
    return "Неизвестно";
  }
}


/* =========================
   STEAM HOURS
========================= */

async function getSteamHours(steamId) {
  try {
    const response = await fetch(
      `https://decapi.me/steam/hours/${encodeURIComponent(
        steamId
      )}/381210`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return "Время игры скрыто";
    }

    const text = (await response.text()).trim();

    const match = text.match(/[\d.,]+/);

    if (!match) {
      return "Время игры скрыто";
    }

    const hours = parseFloat(
      match[0].replace(",", ".")
    );

    if (!Number.isFinite(hours) || hours <= 0) {
      return "Время игры скрыто";
    }

    return `${hours
      .toFixed(1)
      .replace(/\.0$/, "")} ч`;

  } catch (error) {
    console.error("Ошибка часов:", error);
    return "Время игры скрыто";
  }
}


/* =========================
   DBD
========================= */

async function getDbdStats(steamId) {
  try {
    const response = await fetch(
      `https://dbd.tricky.lol/api/playerstats?steamid=${encodeURIComponent(
        steamId
      )}`,
      {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json"
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      console.error(
        "DBD STATUS:",
        response.status
      );

      return null;
    }

    const data = await response.json();

    if (!data || typeof data !== "object") {
      return null;
    }

    return data;

  } catch (error) {
    console.error("Ошибка DBD API:", error);
    return null;
  }
}


/* =========================
   HELPERS
========================= */

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}


function decodeHtml(text) {
  return String(text)
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}


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
