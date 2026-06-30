# 🦸 Adididi vs Koszty Azure ☁️💸

Prosta gierka arcade: DevOps **Adididi** strzela skryptami optymalizacji w spadające
koszty Azure (idle VM-ki, dyski, egress, GPU…), zanim trafią na **rachunek miesięczny**.
Przekroczysz budżet → CFO Cię zwalnia. Dodatkowo wyskakują **tickety Jira** z odliczaniem
SLA — kliknij je, zanim wybuchną.

Stack: **Node.js** (zero-zależnościowy serwer HTTP) + **JS / HTML / CSS** (Canvas).

## Uruchomienie lokalne

```bash
node server.js      # albo: npm start
# → http://localhost:3000
```

## Sterowanie

- `←` `→` / `A` `D` / mysz — ruch
- `Spacja` / klik — strzał
- klik w ticket Jira — RESOLVE (bonus)
- działa też dotyk (auto-fire)

## Mechanika

- Zestrzelony koszt → **oszczędności**. Koszt, który dotrze na dół → ląduje na **rachunku**.
- Budżet $1000 = pasek życia. Przekroczenie → koniec gry (z rankingiem od stażysty po CTO).
- Power-upy: 🧯 FinOps audit (czyści ekran), ⚡ Auto-scaling (szybkostrzelność),
  💵 Reserved Instance (zbija rachunek).
- Tickety Jira: bonus za rozwiązanie w czasie SLA, kara za przekroczenie.

## Deploy

Hostowane na LAN-owym stacku (Gitea + Coolify): **http://adididi.cool.local**
Push do `master` → automatyczny rebuild (webhook push-to-deploy).
