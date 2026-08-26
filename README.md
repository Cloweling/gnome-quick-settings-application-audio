# Application Volume Mixer

A GNOME Shell extension that adds **per-application volume controls** to Quick
Settings. Every application that is currently playing (and optionally
recording) audio gets its own row with an icon, a name, a mute button and a
volume slider.

This is not a replacement for the system volume slider — it only manages the
volume of individual applications, the way `pavucontrol`'s *Playback* tab does,
but without leaving the shell.

## Features

- An **App Volume** entry inside Quick Settings that opens its own popup,
  exactly like the shell's *Background Apps* entry: the rest of the menu is
  dimmed while the popup is focused.
- The entry always sits below every other Quick Settings item, even ones added
  by other extensions — only *Background Apps* stays below it.
- One row per audio stream: application icon, name, live volume slider, mute
  button and (optionally) the volume percentage.
- Rows appear and disappear as applications start and stop playing audio.
- Stable alphabetical ordering, so sliders never jump around under the pointer.
- Optional listing of applications that are *recording* audio.
- Optional per-application volume memory, restored when the application plays
  again.
- Honours the system *Allow volume above 100%* setting, including the 100% mark
  on the slider.
- Works with **PipeWire** and **PulseAudio**: the extension talks to the same
  `libgvc` mixer control the shell itself uses, so whatever GNOME supports is
  supported here too.

## Requirements

- GNOME Shell 50 or later
- A working GNOME audio stack (PipeWire with `pipewire-pulse`, or PulseAudio)

## Installation

### From source

```sh
git clone https://github.com/Cloweling/gnome-quick-settings-application-audio.git
cd gnome-quick-settings-application-audio
make install
```

Then log out and back in (required on Wayland), and enable the extension:

```sh
gnome-extensions enable app-volume-mixer@cloweling.github.io
```

### Building a distributable zip

```sh
make pack
# build/app-volume-mixer@cloweling.github.io.shell-extension.zip
gnome-extensions install --force build/app-volume-mixer@cloweling.github.io.shell-extension.zip
```

## Usage

1. Open Quick Settings (click the system menu in the top-right corner).
2. Find the **App Volume** entry at the bottom of the menu. It only appears
   while at least one application is using audio, unless *Hide when idle* is
   turned off.
3. Click it to open the popup with one row per application; the rest of Quick
   Settings is dimmed while the popup is open.
4. Drag a slider to change that application's volume, or scroll over it.
   Dragging the slider all the way down mutes the application, exactly like the
   system volume slider.
5. Click the speaker icon on the left of a row to mute or unmute the
   application.

Keyboard and screen-reader users can tab to each slider and mute button; the
sliders are labelled with the application they control.

## Preferences

Open the preferences with:

```sh
gnome-extensions prefs app-volume-mixer@cloweling.github.io
```

| Setting | Default | Description |
| --- | --- | --- |
| Show volume percentage | on | Show the current level next to each application |
| Show stream description | off | Append what the application reports it is playing |
| Hide when idle | on | Remove the entry while nothing plays audio |
| Maximum applications | 0 (no limit) | Cap how many rows are listed at once |
| Include recording applications | off | Also list applications capturing audio |
| Remember application volumes | off | Restore the last volume when an application plays again |

`Remember application volumes` is off by default because both PipeWire and
PulseAudio already restore per-application volumes themselves; enable it only
if that is not the behaviour you get.

## How it works

| File | Responsibility |
| --- | --- |
| `extension.js` | Lifecycle: creates the indicator and tears everything down again |
| `lib/streamMonitor.js` | Watches `Gvc.MixerControl` and tracks eligible streams |
| `lib/appInfo.js` | Maps a stream to an application name and icon |
| `lib/appVolumeRow.js` | One application row (slider, mute button, labels) |
| `lib/appVolumeToggle.js` | The Quick Settings entry and its popup menu |
| `lib/indicator.js` | `SystemIndicator` that contributes the entry |
| `lib/volumeStore.js` | Optional persistence of per-application volumes |
| `prefs.js` | Preferences window |

The extension never opens or closes the mixer control: it reuses the singleton
owned by GNOME Shell, so it adds no extra connection to the audio server.

## Troubleshooting

**Nothing shows up.** The entry is hidden while no application is playing
audio. Start some audio, or turn off *Hide when idle*.

**An application is missing.** Applications that only monitor audio levels
(`pavucontrol`, the Sound settings panel) and system event sounds are filtered
out on purpose.

**An application shows a generic icon.** The audio stream did not report an
application id that matches an installed `.desktop` file. The extension falls
back to the stream's own icon and then to a generic one.

Logs:

```sh
journalctl -f -o cat /usr/bin/gnome-shell
```

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).
