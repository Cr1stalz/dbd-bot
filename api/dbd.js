export default async function handler(req, res) {
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

    // Обработка даты обновления (исправлен пересчёт миллисекунд)
    let updatedAt = "Неизвестно";
    const rawUpdated = data.updated || data.updated_at;

    if (rawUpdated) {
      const num = Number(rawUpdated);
      // Если timestamp в секундах, переводим в ms; если уже ms, оставляем как есть
      const timestamp = num < 10000000000 ? num * 1000 : num;
      const date = new Date(timestamp);

      if (!isNaN(date.getTime())) {
        updatedAt = date.toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    }

    const result =
      `🎮 DBD | ⏱ ${steamHours} ч | 🧑 ${survivor} | 🔪 ${killer} | 🔄 Обновлено: ${updatedAt}`;

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
