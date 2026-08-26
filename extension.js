/* extension.js
 *
 * Application Volume Mixer — per-application audio controls in Quick Settings.
 */

import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Volume from 'resource:///org/gnome/shell/ui/status/volume.js';

import * as AppInfo from './lib/appInfo.js';
import {AppVolumeIndicator} from './lib/indicator.js';
import {StreamMonitor} from './lib/streamMonitor.js';
import {VolumeStore} from './lib/volumeStore.js';

/** Number of columns of the Quick Settings grid, so the entry spans it. */
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

        const quickSettings = Main.panel.statusArea.quickSettings;
        quickSettings.addExternalIndicator(
            this._indicator, QUICK_SETTINGS_COLUMN_SPAN);

        // Keep the entry at the very bottom of the grid, no matter which
        // items other extensions add later; only the shell's background apps
        // entry is allowed to stay below it.
        this._grid = quickSettings.menu?._grid ?? null;
        this._grid?.connectObject(
            'child-added', () => this._queueReposition(),
            'child-removed', () => this._queueReposition(),
            this);
        this._reposition();
    }

    _queueReposition() {
        if (this._repositioning)
            return;

        this._repositioning = true;
        // The shell inserts an item and then sets its layout properties, so
        // let it finish before moving the item around.
        this._repositionId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._repositionId = 0;
            this._repositioning = false;
            this._reposition();
            return GLib.SOURCE_REMOVE;
        });
    }

    _reposition() {
        const item = this._indicator?.quickSettingsItems?.[0];
        if (!this._grid || !item || item.get_parent() !== this._grid)
            return;

        const backgroundApps =
            Main.panel.statusArea.quickSettings._backgroundApps
                ?.quickSettingsItems ?? [];
        const sibling = this._grid.get_children().find(
            child => backgroundApps.includes(child));

        this._repositioning = true;
        if (sibling)
            this._grid.set_child_below_sibling(item, sibling);
        else
            this._grid.set_child_above_sibling(item, null);
        this._repositioning = false;
    }

    disable() {
        if (this._repositionId) {
            GLib.source_remove(this._repositionId);
            this._repositionId = 0;
        }
        this._repositioning = false;

        this._grid?.disconnectObject(this);
        this._grid = null;

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
