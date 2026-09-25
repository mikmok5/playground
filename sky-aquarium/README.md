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

Tap a fish to see its callsign, airline, type, altitude, speed, heading, climb rate and distance from you, plus its scheduled route with progress (from the ADSB.lol route database, falling back to [adsbdb](https://www.adsbdb.com)) and a photo of that exact airframe when adsbdb has one. Tap open water to make ripples and scatter the fish nearby.

## Data

The page polls these sources straight from the browser, in this order:

1. [ADSB.lol](https://api.adsb.lol) (every 6 s)
2. [airplanes.live](https://airplanes.live/api-guide/) (every 7 s)
3. [OpenSky Network](https://openskynetwork.github.io/opensky-api/) (every 15 s, anonymous and rate-limited)

Between polls, each aircraft's position is extrapolated from its speed, track and climb rate, so the fish keep moving smoothly. If none of the sources respond, the tank switches to clearly labeled demo traffic and keeps retrying the live sources.

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
