# 🚂 Railhead

An incremental game about starting with one handcar and ending up with a railway
around the world. No build step, no dependencies — just HTML, CSS, and a handful
of ES modules.

**Play it:** https://connorshea.github.io/increment/

## How it plays

- **Load cargo by hand** to get your first few tonnes moving.
- **Buy rolling stock** — handcars, steam shunters, freight wagons, all the way
  up to an orbital funicular — each of which moves cargo for you forever.
- **Complete works** (upgrades) that double a line's output, make hauling by hand
  worth a share of your whole network, or link one class of stock to another.
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

## Deploying

`.github/workflows/deploy.yml` publishes the repository root to GitHub Pages on
every push to `main`, `master`, or a `claude/**` branch.

One-time setup: in the repository's **Settings → Pages**, set **Source** to
**GitHub Actions**. After that, each push redeploys automatically, and you can
also trigger a deploy by hand from the Actions tab.

## Layout

| Path                | What's in it                                              |
| ------------------- | --------------------------------------------------------- |
| `index.html`        | Page structure                                             |
| `css/style.css`     | All the styling                                            |
| `js/data.js`        | Content: rolling stock, works, spike upgrades, milestones  |
| `js/engine.js`      | Costs, multipliers, buying, regauging, the tick            |
| `js/state.js`       | Save shape, `localStorage`, export/import                  |
| `js/ui.js`          | DOM rendering                                              |
| `js/audio.js`       | Web Audio synthesis: ambience, horns, and interface sounds  |
| `js/background.js`  | The rail network that draws itself behind the page         |
| `js/main.js`        | Wiring and the game loop                                   |
| `js/format.js`      | Number and time formatting                                 |

Adding content is mostly a matter of editing `js/data.js` — generators, upgrades
and milestones are plain data, and `engine.js` knows how to apply each effect
kind (`gen`, `all`, `click`, `haulRate`, `genPer`, `parcelFreq`, `parcelDur`,
`steam`, `spikePower`, `offline`, `headStart`).
