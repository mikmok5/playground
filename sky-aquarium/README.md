# Sky Aquarium

The aircraft flying around you right now, drawn as fish in a live aquarium. Built for phones and installable to the home screen.

## Reading the tank

- **Height** is altitude. The water surface is 45,000 ft and the sand is the ground.
- **Left and right** is west and east of you. The glowing beacon on the sand marks your position.
- **Size and haze** show north and south. Fish to the north are smaller and fainter.
- **Color** is the airline, so flights from the same airline swim in matching schools.
- **Species** is the aircraft class: jumbo jets are blue whales, 737s and A320s are tuna, helicopters are jellyfish (with a rotor), gliders are manta rays, balloons are pufferfish, and anything on the ground is a hermit crab.
- **Bubbles** trail aircraft that are climbing.
- **Sonar** in the corner is the top-down view. Tap it to enlarge it, then tap a blip to select that aircraft.
- **Light** follows the real sun where you are watching. At night the water goes dark, stars come out above the surface and the fish glow. You can pin it to day or night in the menu.
- **Overhead alerts** pop up when an aircraft passes within 4 km of you, so you can look up and spot it. Whales sing as they go over; everything else chimes.

Each fish shows its callsign and, underneath, where the flight came from and where it's heading (like `LHR → JFK`). Tap a fish to see its airline, type, altitude, speed, heading, climb rate and distance from you, plus its route with full airport names and progress and a photo of that exact airframe when adsbdb has one. Tap open water to make ripples and scatter the fish nearby.

## Data

- **Positions** come from [ADSB.lol](https://api.adsb.lol), falling back to [adsb.fi](https://github.com/adsbfi/opendata), every 5 s. Neither API sends CORS headers, so browsers can't read them directly. The page goes through the [Sky Aquarium relay](../relay/README.md), a free Cloudflare Worker you deploy with one click. Put its link in `config.js`, or paste it in the menu under **Live data relay**.
- **Routes** come from [adsbdb](https://www.adsbdb.com), falling back to [hexdb](https://hexdb.io). Both allow browser requests. Every flight in view is looked up, nearest first, and the results are cached on the device for 6 hours. A route is dropped when the aircraft isn't roughly between its two airports, because callsigns get reused and the databases can be stale.

Between polls, each aircraft's position is extrapolated from its speed, track and climb rate, so the fish keep moving smoothly. When live data can't be reached, the tank shows a **Connect live flights** panel instead of making anything up. Demo fish are available from that panel if you just want to look around.

## Running it

It is a static site with no build step:

```sh
cd sky-aquarium
python3 -m http.server 8000
# open http://localhost:8000
```

Location access needs HTTPS or localhost. On any other origin, pick a city from the menu instead.

### Publishing on GitHub Pages

`.github/workflows/pages.yml` deploys this folder. One-time setup: in the repository, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.

- In a **public** repository it deploys automatically whenever changes to this folder land on `main`.
- A **private** repository needs a paid GitHub plan for Pages. There, run the workflow by hand from the **Actions** tab (**Deploy Sky Aquarium to GitHub Pages → Run workflow**).
