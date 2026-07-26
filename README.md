# 🚂 Railhead

An incremental game about starting with one handcar and ending up with a railway
around the world. No build step, no dependencies — just HTML, CSS, and a handful
of ES modules.

**Play it:** https://connorshea.github.io/increment/

## How it plays

- **Load cargo by hand** to get your first few tonnes moving — or hold the
  button down and it keeps working on its own, about once a second.
- **Buy rolling stock** — handcars, steam shunters, freight wagons, all the way
  up to an orbital funicular — each of which moves cargo for you forever.
- **Complete works** (upgrades) that double a line's output, make hauling by hand
  worth a share of your whole network, or link one class of stock to another.
- **Hire the Conductor 🎩** (a spike upgrade) and works get signed off for you,
  cheapest first, one every second and a half. There is a toggle in the Works
  header to stand them down again, and a **Buy all** button for doing it by hand.
- **Hire the Superconductor ❄️** (250 spikes, so very much an endgame one) and
  the best rolling stock on the roster is ordered in bulk every two seconds —
  never spending more than half the cargo in hand, so there is always something
  left for works and for the regauge you might be saving towards. It has its own
  toggle in the Rolling stock header.
- **Catch express parcels 📦** that drift across the screen for a temporary
  Full Steam, Rush Hour, or an instant windfall.
- **Regauge** when you have moved enough cargo: you tear up the network and lay
  it again, losing everything on the line but keeping **golden spikes 🔩**. Every
  spike you have ever driven makes all future railways permanently faster, and
  spikes buy permanent upgrades that survive every rebuild.
- **Milestones** each grant +1% to everything, forever.

The soundtrack is synthesised in the browser — there are no audio files in this
repo. A low rumble of rolling stock, wheels ticking over rail joints (the rhythm
picks up as the railway gets busier), and the odd distant horn. Opening an
express parcel sounds like opening a parcel — tape, flap, packing paper — and
reaching a milestone is answered with a soft horn. Browsers block audio until you interact
with the page, so it fades in on your first click; **Sound: on/off** in the
footer turns it off for good, and the choice is saved.

Progress saves to `localStorage` every 20 seconds and whenever you leave the tab,
and the railway keeps running while you are away (8 hours at 50% by default, more
once you have hired the night shift). There are Export and Import buttons if you
want to move a save between browsers.

## Running it locally

The game uses ES modules, so it needs to be served over HTTP rather than opened
as a `file://` URL:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

The game itself still ships with no dependencies and no build step — nothing in
`node_modules` reaches the browser. The tooling below is for working on it.

## Tests, linting and formatting

```sh
npm install       # dev tooling only
npm test          # vitest, once
npm run test:watch
npm run lint      # oxlint  (--fix variant: npm run lint:fix)
npm run fmt       # oxfmt   (--check variant: npm run fmt:check)
```

oxlint and oxfmt both run on their defaults, so there is no config file to keep
in sync.

The tests in `test/` cover the parts that decide whether a save is correct:
number formatting, the engine (costs, multipliers, buying, regauging, parcels,
away progress, milestones), the save shape (normalising an old or hand-edited
save, export/import round-trips), and the integrity of the content in
`js/data.js` — unique ids, a ladder that never goes backwards, and no effect
aimed at a generator that does not exist. Rendering is not covered; `js/ui.js`
and `js/background.js` are exercised by hand in a browser.

## Deploying

`.github/workflows/deploy.yml` publishes the repository root to GitHub Pages on
every push to `main`, `master`, or a `claude/**` branch.

One-time setup: in the repository's **Settings → Pages**, set **Source** to
**GitHub Actions**. After that, each push redeploys automatically, and you can
also trigger a deploy by hand from the Actions tab.

## Layout

| Path               | What's in it                                               |
| ------------------ | ---------------------------------------------------------- |
| `index.html`       | Page structure                                             |
| `css/style.css`    | All the styling                                            |
| `js/data.js`       | Content: rolling stock, works, spike upgrades, milestones  |
| `js/engine.js`     | Costs, multipliers, buying, regauging, the tick            |
| `js/state.js`      | Save shape, `localStorage`, export/import                  |
| `js/ui.js`         | DOM rendering                                              |
| `js/audio.js`      | Web Audio synthesis: ambience, horns, and interface sounds |
| `js/background.js` | The freight map that builds itself behind the page         |
| `js/main.js`       | Wiring and the game loop                                   |
| `js/format.js`     | Number and time formatting                                 |

Adding content is mostly a matter of editing `js/data.js` — generators, upgrades
and milestones are plain data, and `engine.js` knows how to apply each effect
kind (`gen`, `all`, `click`, `haulRate`, `genPer`, `parcelFreq`, `parcelDur`,
`steam`, `spikePower`, `offline`, `headStart`).
