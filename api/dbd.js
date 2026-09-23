export default async function handler(req, res) {
  // Устанавливаем заголовки ответа сразу
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  // Извлекаем steamid из параметров запроса
  const steamid = req.query?.steamid ? String(req.query.steamid).trim() : null;
  const appid = "381210";

  // 1. Проверка на отсутствие steamid
  if (!steamid) {
    return res
      .status(200)
      .send("⚠️ Укажите SteamID! Пример команды в чате: !dbd 76561199849381839");
  }

  try {
    // 2. Получение часов из Steam
    let steamHours = "Неизвестно";
    try {
      const steamResponse = await fetch(
        `https://decapi.me/steam/hours/${encodeURIComponent(steamid)}/${appid}`
      );
      if (steamResponse.ok) {
        const steamText = await steamResponse.text();
        const match = steamText.match(/[\d.,]+/);
        if (match) {
          const hours = parseFloat(match[0].replace(",", "."));
          if (!isNaN(hours)) {
            steamHours = hours.toFixed(1).replace(".0", "");
          }
        }
      }
    } catch (e) {
      // Игнорируем сбой получения часов, чтобы выдалась хотя бы DBD статистика
    }

    // 3. Получение DBD статистики
    const dbdResponse = await fetch(
      `https://dbd.tricky.lol/api/playerstats?steamid=${encodeURIComponent(steamid)}`
    );

    if (!dbdResponse.ok) {
      return res
        .status(200)
        .send(`❌ Игрок не найден или профиль скрыт (SteamID: ${steamid})`);
    }

    const data = await dbdResponse.json();

    // Проверка, вернул ли API корректный объект
    if (!data || typeof data !== "object") {
      return res.status(200).send("❌ Не удалось разобрать данные DBD");
    }

    const survivor = rankName(data.survivor_rank);
    const killer = rankName(data.killer_rank);

    // Дополнительные метрики из JSON
    const gens = data.gensrepaired || 0;
    const escapes = data.escaped || 0;

    // Общее количество жертв (жертвы на крюке + убийства мори/навыками)
    const totalKills = (Number(data.sacrificed) || 0) + (Number(data.killed) || 0);

    const result = `🎮 DBD | ⏱ ${steamHours} ч | 🧑 ${survivor} | 🔪 ${killer} | 🛠 Гены: ${gens} | 🚪 Побеги: ${escapes} | 💀 Убито: ${totalKills}`;

    return res.status(200).send(result);

  } catch (error) {
    // Безопасный отлов любых остаточных ошибок без падения сервера (500)
    return res
      .status(200)
      .send("❌ Произошла ошибка при запросе статистики DBD.");
  }
}

function rankName(rank) {
  const ranks = {
    20: "Пепел IV",   19: "Пепел III",  18: "Пепел II",   17: "Пепел I",
    16: "Бронза IV",  15: "Бронза III", 14: "Бронза II",  13: "Бронза I",
    12: "Серебро IV", 11: "Серебро III",10: "Серебро II", 9: "Серебро I",
    8:  "Золото IV",  7:  "Золото III", 6:  "Золото II",  5:  "Золото I",
    4:  "Радужный IV",3:  "Радужный III",2: "Радужный II",1:  "Радужный I"
  };

  return ranks[rank] || "Неизвестно";
}export default async function handler(req, res) {
  // Получаем steamid из query-параметра ?steamid=...
  const { steamid } = req.query;
  const appid = "381210";

  // Если SteamID не передан в URL
  if (!steamid) {
    return res
      .status(200)
      .setHeader("Content-Type", "text/plain; charset=utf-8")
      .send("⚠️ Укажите SteamID! Пример: !dbd 76561199849381839");
  }

  try {
    // 1. Получаем часы из Steam
    const steamResponse = await fetch(
      `https://decapi.me/steam/hours/${encodeURIComponent(steamid)}/${appid}`
    );

    const steamText = (await steamResponse.text()).trim();
    const match = steamText.match(/[\d.,]+/);

    let steamHours = "Неизвестно";

    if (match) {
      const hours = parseFloat(match[0].replace(",", "."));
      if (!isNaN(hours)) {
        steamHours = hours.toFixed(1).replace(".0", "");
      }
    }

    // 2. Получаем DBD статистику
    const dbdResponse = await fetch(
      `https://dbd.tricky.lol/api/playerstats?steamid=${encodeURIComponent(steamid)}`
    );

    if (!dbdResponse.ok) {
      return res
        .status(200)
        .setHeader("Content-Type", "text/plain; charset=utf-8")
        .send(`❌ Ошибка получения DBD API для ID: ${steamid}`);
    }

    const data = await dbdResponse.json();

    const survivor = rankName(data.survivor_rank);
    const killer = rankName(data.killer_rank);

    // Дополнительные метрики из JSON
    const gens = data.gensrepaired || 0;
    const escapes = data.escaped || 0;

    // Общее количество жертв (жертвы на крюке + убийства мори/навыками)
    const totalKills = (Number(data.sacrificed) || 0) + (Number(data.killed) || 0);

    const result = `🎮 DBD | ⏱ ${steamHours} ч | 🧑 ${survivor} | 🔪 ${killer} | 🛠 Гены: ${gens} | 🚪 Побеги: ${escapes} | 💀 Убито: ${totalKills}`;

    res
      .status(200)
      .setHeader("Content-Type", "text/plain; charset=utf-8")
      .send(result);

  } catch (error) {
    res
      .status(200)
      .setHeader("Content-Type", "text/plain; charset=utf-8")
      .send("❌ Не удалось получить статистику DBD");
  }
}

function rankName(rank) {
  const ranks = {
    20: "Пепел IV",   19: "Пепел III",  18: "Пепел II",   17: "Пепел I",
    16: "Бронза IV",  15: "Бронза III", 14: "Бронза II",  13: "Бронза I",
    12: "Серебро IV", 11: "Серебро III",10: "Серебро II", 9: "Серебро I",
    8:  "Золото IV",  7:  "Золото III", 6:  "Золото II",  5:  "Золото I",
    4:  "Радужный IV",3:  "Радужный III",2: "Радужный II",1:  "Радужный I"
  };

  return ranks[rank] || "Неизвестно";
}export default async function handler(req, res) {
  const steamid = "76561199849381839";
  const appid = "381210";

  try {
    // Получаем часы из Steam
    const steamResponse = await fetch(
      `https://decapi.me/steam/hours/${steamid}/${appid}`
    );

    const steamText = (await steamResponse.text()).trim();
    const match = steamText.match(/[\d.,]+/);

    let steamHours = "Неизвестно";

    if (match) {
      const hours = parseFloat(match[0].replace(",", "."));
      if (!isNaN(hours)) {
        steamHours = hours.toFixed(1).replace(".0", "");
      }
    }

    // Получаем DBD статистику
    const dbdResponse = await fetch(
      `https://dbd.tricky.lol/api/playerstats?steamid=${steamid}`
    );

    if (!dbdResponse.ok) {
      return res.status(200).send("❌ Ошибка DBD API");
    }

    const data = await dbdResponse.json();

    const survivor = rankName(data.survivor_rank);
    const killer = rankName(data.killer_rank);

    // Дополнительные метрики из JSON
    const gens = data.gensrepaired || 0;
    const escapes = data.escaped || 0;
    
    // Общее количество жертв (жертвы на крюке + убийства мори/навыками)
    const totalKills = (Number(data.sacrificed) || 0) + (Number(data.killed) || 0);

    const result =
      `🎮 DBD | ⏱ ${steamHours} ч | 🧑 ${survivor} | 🔪 ${killer} | 🛠 Гены: ${gens} | 🚪 Побеги: ${escapes} | 💀 Убито: ${totalKills}`;

    res
      .status(200)
      .setHeader("Content-Type", "text/plain; charset=utf-8")
      .send(result);

  } catch (error) {
    res.status(200).send("❌ Не удалось получить статистику DBD");
  }
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

  return ranks[rank] || "Неизвестно";
}
