# homebridge-pitboss

[![npm](https://img.shields.io/npm/v/homebridge-pitboss)](https://www.npmjs.com/package/homebridge-pitboss)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

A Homebridge plugin for **Pit Boss pellet smokers** that communicates directly over your local WiFi network.

- No cloud account required
- No Python bridge process
- No Bluetooth
- Auto-discovers your grill on the network
- Sleep mode reduces network traffic when grill is off
- Full Siri voice control and HomeKit automations

> **Tested on:** PBV4PS2 Pro Series 4 V2. Other WiFi-enabled Pit Boss models using the same Mongoose OS controller should also work.

---

## What you can do

| Say to Siri | What happens |
|---|---|
| *"What's my grill temperature?"* | Reads current cabinet temp |
| *"Set the grill to 250 degrees"* | Sets target cook temperature |
| *"What's meat probe 1 temperature?"* | Reads probe 1 live temp |
| *"Turn off the grill"* | Sends shutdown command |
| *"Is the grill running?"* | Reports whether grill is on |

**HomeKit automations:**
- *"When Meat Probe 1 reaches 165°F → send notification"* (brisket is done)
- *"When Pellets Empty sensor opens → send notification"* (add pellets!)
- *"When Grill Running turns on → turn on the back porch light"*

---

## Requirements

- Homebridge v1.6.0 or later
- Node.js 18 or later
- Pit Boss grill with WiFi (must be connected to your local network via the SmokeIT app first)
- Homebridge server on the same local network as the grill

---

## Installation

### Via Homebridge UI (recommended)

1. Open the Homebridge web interface
2. Go to **Plugins** and search for `homebridge-pitboss`
3. Click **Install**
4. Click **Settings** on the plugin and configure it (see below)
5. Restart Homebridge

### Via command line

```bash
sudo npm install -g homebridge-pitboss
```

---

## Configuration

Open **Plugin Settings** in the Homebridge UI. All fields except **Name** are optional if autodiscovery is enabled.

| Field | Default | Description |
|---|---|---|
| **Name** | `Pit Boss Smoker` | Name shown in the Home app |
| **Grill IP Address** | *(auto)* | Local IP of your grill. **Recommended** — assign a static IP in your router and enter it here. Skips network scanning entirely. |
| **Automatic Discovery** | `true` | Find the grill automatically via mDNS and network scan if no IP is set |
| **Device ID** | *(auto)* | Optional. E.g. `PBL-30C922A57F70`. Speeds up discovery. Find it at `http://<grill-ip>/conf9.json` |
| **Active Poll Interval** | `5000` ms | How often to fetch state while grill is ON |
| **Sleep Poll Interval** | `60000` ms | How often to check state while grill is OFF |
| **Sleep Mode Delay** | `0` ms | Delay before entering sleep mode after grill turns off |
| **Grill Model** | `PBV4PS2` | Your Pit Boss model |
| **Grill Password** | *(blank)* | Only needed if you set a password in the SmokeIT app |
| **Request Timeout** | `8000` ms | HTTP timeout for grill requests |

### Minimal config.json example

```json
{
  "platforms": [
    {
      "platform": "PitBoss",
      "name": "Pit Boss Smoker"
    }
  ]
}
```

### Recommended config.json example (with static IP)

```json
{
  "platforms": [
    {
      "platform": "PitBoss",
      "name": "Pit Boss Smoker",
      "grillIp": "192.168.1.50",
      "pollInterval": 5000,
      "sleepInterval": 60000
    }
  ]
}
```

---

## HomeKit Accessories

After adding to Apple Home, you'll see these accessories:

| Accessory | Type | Notes |
|---|---|---|
| **Grill Temperature** | Thermostat | Current + target cabinet temp. Set temp via Siri or Home app. |
| **Meat Probe 1** | Temperature Sensor | Live probe reading. Shows inactive when probe is unplugged. |
| **Meat Probe 2** | Temperature Sensor | Live probe reading. Shows inactive when probe is unplugged. |
| **Grill Running** | Occupancy Sensor | Active when `moduleIsOn = true`. Use for automations. |
| **Pellets Empty** | Contact Sensor | Opens when hopper runs low. Set up a notification automation. |
| **Grill Shutdown** | Switch | Momentary — sends power-off command to the grill. |
| **Primer Motor** | Switch | Toggles the pellet primer motor. |

> **Note:** The grill can only be powered **on** physically at the unit. This is a hardware safety requirement — remote power-on is not supported by the controller.

---

## Adding to Apple Home

1. Open the **Home** app
2. Tap **+** → **Add Accessory** → **More options...**
3. Select **Pit Boss Smoker** from the list
4. Assign it to a room and tap **Done**

All accessories come through the Homebridge bridge — you're pairing with Homebridge, not the grill directly.

---

## Setting Up Automations

**Probe temperature alert (meat is done):**
1. Home app → **Automations** → **+**
2. *"A sensor detects something"*
3. Select **Meat Probe 1** → *"rises above"* → set your target (e.g. 74°C = 165°F for chicken)
4. Action: **Send notification**

**Pellets empty alert:**
1. Home app → **Automations** → **+**
2. *"An accessory is controlled"* → **Pellets Empty** → *"opens"*
3. Action: **Send notification** → *"Add pellets to smoker!"*

**Temperature conversion reference:**

| °F | °C |
|---|---|
| 225 | 107 |
| 250 | 121 |
| 275 | 135 |
| 300 | 149 |
| 325 | 163 |
| 350 | 177 |
| 165 (chicken) | 74 |
| 145 (pork/beef) | 63 |
| 203 (brisket) | 95 |

---

## Sleep Mode

When the grill is off (`moduleIsOn = false`), the plugin automatically reduces polling from every 5 seconds to every 60 seconds (configurable). This keeps your network quiet between cooks.

The moment the grill turns on, polling immediately switches back to the active rate so HomeKit reflects the new state within seconds.

---

## First-Time Setup: Connect Your Grill to WiFi

Before this plugin can work, the grill must be connected to your local WiFi network via the **SmokeIT app**:

1. Download the **SmokeIT** app on your phone
2. Power on your grill
3. Follow the in-app WiFi setup wizard
4. The grill needs a **2.4 GHz** network — it does not support 5 GHz
5. Once connected, verify by opening `http://<grill-ip>/` in a browser — you should see a Mongoose OS file listing

**Antenna tip (PBV4PS2):** If you're having trouble connecting the grill to WiFi, the antenna may be tucked under the controller PCB. Carefully peel it up and re-route it to the front of the display housing for dramatically better signal.

---

## Finding Your Grill's IP Address

If autodiscovery doesn't work, find your grill's IP manually:

1. Log into your router's admin interface
2. Look for a device named `PBL-XXXXXXXXXXXX` or check the device list for an unknown device around the time you connected it
3. Assign it a static/reserved IP in your router settings
4. Enter that IP as **Grill IP Address** in the plugin config

Or from a computer on the same network:
```bash
# macOS / Linux
ping PBL-30C922A57F70.local   # replace with your device ID

# Windows PowerShell
ping PBL-30C922A57F70.local
```

Your device ID is printed on a sticker inside the hopper, or available at `http://<grill-ip>/conf9.json`.

---

## Troubleshooting

**Accessories not appearing in Home app:**
- Make sure the plugin is listed in Homebridge with no errors
- Open Home app → + → Add Accessory → More options → look for Pit Boss Smoker
- Try restarting Homebridge

**Grill not found during autodiscovery:**
- Ensure grill is powered on and connected to WiFi
- Check that your Homebridge server is on the same network/subnet as the grill
- Try setting `grillIp` manually in config (most reliable)
- Verify the grill is reachable: `curl http://<grill-ip>/conf9.json`

**Temperatures not updating:**
- Check Homebridge logs for `[PitBoss]` errors
- Verify `curl http://<grill-ip>/rpc/PB.GetState` returns JSON from the same machine running Homebridge

**Commands (set temp, shutdown) not working:**
- Verify `curl -X POST http://<grill-ip>/rpc/PB.SendMCUCommand -H "Content-Type: application/json" -d '{"command":"FE0B01FF"}'` returns `null` from the Pi
- Check the grill is fully booted (display showing temperature, not just plugged in)

---

## Technical Details

This plugin communicates directly with the **Mongoose OS 6.16** firmware running on the grill's WiFi controller using its local HTTP RPC interface:

- `GET  http://<grill-ip>/rpc/PB.GetState` — fetch status + temperatures
- `POST http://<grill-ip>/rpc/PB.SendMCUCommand` + `{"command":"<hex>"}` — send control commands

The hex command protocol was reverse-engineered from the [pytboss](https://github.com/dknowles2/pytboss) library's `grills.json` firmware definitions.

---

## Disclaimer

This plugin has no official relationship with Pit Boss or Dansons. Use at your own risk. This plugin sends commands to a live fire appliance — always follow normal safety practices when operating your smoker.

---

## License

Apache 2.0 © mudlife318
