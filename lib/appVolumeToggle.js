/* appVolumeToggle.js
 *
 * The Quick Settings entry itself: a flat toggle that opens a popup menu with
 * one row per application, mirroring the shell's own "Background Apps" entry.
 */

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {QuickToggle} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {gettext as _, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';

import {AppVolumeRow} from './appVolumeRow.js';

const ALLOW_AMPLIFIED_VOLUME_KEY = 'allow-volume-above-100-percent';

export const AppVolumeToggle = GObject.registerClass(
class AppVolumeToggle extends QuickToggle {
    _init(control, monitor, settings, store) {
        super._init({
            visible: false,
            hasMenu: true,
            // Like the background apps entry, this looks like a flat menu
            // without a separate menu button: fake it with an arrow icon.
            iconName: 'go-next-symbolic',
            title: _('App Volume'),
        });

        this.add_style_class_name('app-volume-quick-toggle');
        this._box.set_child_above_sibling(this._icon, null);

        this._control = control;
        this._monitor = monitor;
        this._settings = settings;
        this._store = store;
        this._rows = new Map();

        this.menu.setHeader('audio-volume-high-symbolic',
            _('App Volume'));

        this._listTitle = new PopupMenu.PopupMenuItem(
            _('Apps currently playing or recording audio'),
            {reactive: false});
        this._listTitle.label.clutter_text.set({line_wrap: true});
        this.menu.addMenuItem(this._listTitle);

        this._placeholder = new PopupMenu.PopupMenuItem(
            _('No app is playing audio'), {reactive: false});
        this._placeholder.label.clutter_text.set({line_wrap: true});
        this.menu.addMenuItem(this._placeholder);

        this._appsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._appsSection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addSettingsAction(_('Sound Settings'),
            'gnome-sound-panel.desktop');

        this._soundSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.sound',
        });
        this._soundSettings.connectObject(
            `changed::${ALLOW_AMPLIFIED_VOLUME_KEY}`,
            () => this._updateMaxLevel(), this);

        this._settings.connectObject(
            'changed::hide-when-empty', () => this._sync(),
            'changed::max-visible-apps', () => this._sync(),
            this);

        this._monitor.connectObject(
            'stream-added', (m, stream) => this._addStream(stream),
            'stream-removed', (m, stream) => this._removeStream(stream),
            'stream-updated', (m, stream) => this._updateStream(stream),
            this);

        this.connect('popup-menu', () => this.menu.open());
        this.menu.connect('open-state-changed', () => this._syncVisibility());
        Main.sessionMode.connectObject('updated',
            () => this._syncVisibility(), this);

        this.connect('destroy', () => this._onDestroy());

        this._monitor.streams.forEach(stream => this._addStream(stream));
        this._sync();
    }

    vfunc_clicked() {
        this.menu.open();
    }

    _addStream(stream) {
        const id = stream.get_id();
        if (this._rows.has(id))
            return;

        const row = new AppVolumeRow(stream, this._control, this._settings,
            this._store);
        row.connectObject('order-changed', () => this._reorder(), this);
        row.setMaxLevel(this._getMaxLevel());

        this._rows.set(id, row);
        this._appsSection.addMenuItem(row);
        this._reorder();
        this._sync();
    }

    _removeStream(stream) {
        const id = stream.get_id();
        const row = this._rows.get(id);
        if (!row)
            return;

        this._rows.delete(id);
        row.destroy();
        this._sync();
    }

    _updateStream(stream) {
        this._rows.get(stream.get_id())?.refresh();
    }

    _sortedRows() {
        return [...this._rows.values()].sort(
            (a, b) => a.sortKey.localeCompare(b.sortKey));
    }

    _reorder() {
        this._sortedRows().forEach((row, index) => {
            this._appsSection.box.set_child_at_index(row, index);
        });
    }

    _getMaxLevel() {
        const amplified =
            this._soundSettings.get_boolean(ALLOW_AMPLIFIED_VOLUME_KEY);
        if (!amplified)
            return 1;

        const maxNorm = this._control.get_vol_max_norm();
        return maxNorm > 0 ? this._control.get_vol_max_amplified() / maxNorm : 1;
    }

    _updateMaxLevel() {
        const maxLevel = this._getMaxLevel();
        this._rows.forEach(row => row.setMaxLevel(maxLevel));
    }

    _syncVisibility() {
        const {isLocked} = Main.sessionMode;
        const count = this._rows.size;
        const keepEmpty = !this._settings.get_boolean('hide-when-empty');

        // The toggle must not be hidden while its menu is open, otherwise the
        // menu ends up positioned at a bogus location.
        this.visible =
            !isLocked && (this.menu.isOpen || count > 0 || keepEmpty);
    }

    _sync() {
        const count = this._rows.size;
        const limit = this._settings.get_uint('max-visible-apps');

        this._sortedRows().forEach((row, index) => {
            row.visible = limit === 0 || index < limit;
        });

        this.title = count === 0
            ? _('No App Playing Audio')
            : ngettext('%d App Playing Audio', '%d Apps Playing Audio',
                count).format(count);

        const hidden = limit === 0 ? 0 : Math.max(0, count - limit);
        this.subtitle = hidden > 0 ? _('%d more').format(hidden) : null;

        this._listTitle.visible = count > 0;
        this._placeholder.visible = count === 0;

        this._syncVisibility();
    }

    _onDestroy() {
        this._monitor.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._soundSettings.disconnectObject(this);
        Main.sessionMode.disconnectObject(this);
        this._rows.clear();
        this._control = null;
        this._monitor = null;
        this._settings = null;
        this._soundSettings = null;
        this._store = null;
    }
});
