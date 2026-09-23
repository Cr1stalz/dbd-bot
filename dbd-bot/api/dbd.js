export default async function handler(req, res) {
  const steamid = "76561199849381839";

  try {
    const response = await fetch(
      `https://dbd.tricky.lol/api/playerstats?steamid=${steamid}`
    );

    if (!response.ok) {
      return res.status(200).send("DBD API error");
    }

    const data = await response.json();
    const hours = (Number(data.playtime) / 60).toFixed(1);

    res.status(200).send(
      `⏱ ${hours} ч | 🧑 Survivor: ${rankName(data.survivor_rank)} | 🔪 Killer: ${rankName(data.killer_rank)}`
    );
  } catch (error) {
    res.status(200).send("Не удалось получить DBD статистику");
  }
}

function rankName(rank) {
  const ranks = {
    20:"Ash IV",19:"Ash III",18:"Ash II",17:"Ash I",
    16:"Bronze IV",15:"Bronze III",14:"Bronze II",13:"Bronze I",
    12:"Silver IV",11:"Silver III",10:"Silver II",9:"Silver I",
    8:"Gold IV",7:"Gold III",6:"Gold II",5:"Gold I",
    4:"Iridescent IV",3:"Iridescent III",2:"Iridescent II",1:"Iridescent I"
  };
  return ranks[rank] || "Unknown";
}