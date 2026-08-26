/* extension.js
 *
 * Application Volume Mixer — per-application audio controls in Quick Settings.
 */

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Volume from 'resource:///org/gnome/shell/ui/status/volume.js';

import * as AppInfo from './lib/appInfo.js';
import {AppVolumeIndicator} from './lib/indicator.js';
import {StreamMonitor} from './lib/streamMonitor.js';
import {VolumeStore} from './lib/volumeStore.js';

/** Number of columns of the Quick Settings grid, so the section spans it. */
const QUICK_SETTINGS_COLUMN_SPAN = 2;

export default class AppVolumeMixerExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._store = new VolumeStore(this._settings);

        // The mixer control is a shared singleton owned by the shell; it is
        // used, but never opened or closed, by this extension.
        this._control = Volume.getMixerControl();
        this._monitor = new StreamMonitor(this._control, this._settings);

        this._indicator = new AppVolumeIndicator(this._control, this._monitor,
            this._settings, this._store);

        Main.panel.statusArea.quickSettings.addExternalIndicator(
            this._indicator, QUICK_SETTINGS_COLUMN_SPAN);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;

        this._monitor?.destroy();
        this._monitor = null;

        this._store?.destroy();
        this._store = null;

        AppInfo.clearCache();

        this._control = null;
        this._settings = null;
    }
}
