/* appVolumeList.js
 *
 * The Quick Settings entry itself: a collapsible section that holds one row
 * per application. Everything lives in a single grid item so that rows can
 * appear and disappear without ever reshuffling the Quick Settings grid.
 */

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {QuickSettingsItem} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {gettext as _, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';

import {AppVolumeRow} from './appVolumeRow.js';

const ALLOW_AMPLIFIED_VOLUME_KEY = 'allow-volume-above-100-percent';

export const AppVolumeList = GObject.registerClass(
class AppVolumeList extends QuickSettingsItem {
    _init(control, monitor, settings, store) {
        super._init({
            style_class: 'app-volume-list',
            hasMenu: false,
            can_focus: false,
            reactive: false,
            x_expand: true,
        });

        this._control = control;
        this._monitor = monitor;
        this._settings = settings;
        this._store = store;
        this._rows = new Map();

        const box = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        this.set_child(box);

        this._header = this._createHeader();
        box.add_child(this._header);

        this._rowsBox = new St.BoxLayout({
            style_class: 'app-volume-rows',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        box.add_child(this._rowsBox);

        this._placeholder = new St.Label({
            style_class: 'app-volume-placeholder',
            text: _('No application is playing audio'),
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._rowsBox.add_child(this._placeholder);

        this._soundSettings = new Gio.Settings({
            schema_id: 'org.gnome.desktop.sound',
        });
        this._soundSettings.connectObject(
            `changed::${ALLOW_AMPLIFIED_VOLUME_KEY}`,
            () => this._updateMaxLevel(), this);

        this._settings.connectObject(
            'changed::expanded', () => this._syncExpanded(),
            'changed::hide-when-empty', () => this._sync(),
            'changed::max-visible-apps', () => this._sync(),
            this);

        this._monitor.connectObject(
            'stream-added', (m, stream) => this._addStream(stream),
            'stream-removed', (m, stream) => this._removeStream(stream),
            'stream-updated', (m, stream) => this._updateStream(stream),
            this);

        this.connect('destroy', () => this._onDestroy());

        this._monitor.streams.forEach(stream => this._addStream(stream));
        this._syncExpanded();
        this._sync();
    }

    _createHeader() {
        const header = new St.Button({
            style_class: 'app-volume-header',
            can_focus: true,
            x_expand: true,
        });

        const box = new St.BoxLayout({x_expand: true});
        header.set_child(box);

        box.add_child(new St.Icon({
            style_class: 'app-volume-header-icon',
            icon_name: 'audio-volume-high-symbolic',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        this._headerLabel = new St.Label({
            style_class: 'app-volume-header-title',
            text: _('Application Volume'),
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        box.add_child(this._headerLabel);

        this._countLabel = new St.Label({
            style_class: 'app-volume-header-count',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._countLabel);

        this._expanderIcon = new St.Icon({
            style_class: 'app-volume-header-expander',
            icon_name: 'pan-end-symbolic',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._expanderIcon);

        header.connect('clicked', () => {
            this._settings.set_boolean('expanded',
                !this._settings.get_boolean('expanded'));
        });

        return header;
    }

    get _expanded() {
        return this._settings.get_boolean('expanded');
    }

    _syncExpanded() {
        const expanded = this._expanded;

        this._rowsBox.visible = expanded;
        this._expanderIcon.icon_name = expanded
            ? 'pan-down-symbolic'
            : 'pan-end-symbolic';
        this._header.accessible_name = expanded
            ? _('Collapse application volume list')
            : _('Expand application volume list');

        this._sync();
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
        this._rowsBox.add_child(row);
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
        // The placeholder label is always the first child of the box.
        this._sortedRows().forEach((row, index) => {
            this._rowsBox.set_child_at_index(row, index + 1);
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

    _sync() {
        const count = this._rows.size;
        const limit = this._settings.get_uint('max-visible-apps');

        this._sortedRows().forEach((row, index) => {
            row.visible = limit === 0 || index < limit;
        });

        const hidden = limit === 0 ? 0 : Math.max(0, count - limit);
        let summary = '';
        if (!this._expanded && count > 0)
            summary = ngettext('%d app', '%d apps', count).format(count);
        else if (hidden > 0)
            summary = _('%d more').format(hidden);

        this._countLabel.set({
            text: summary,
            visible: summary !== '',
        });

        this._placeholder.visible = count === 0;
        this.visible =
            count > 0 || !this._settings.get_boolean('hide-when-empty');
    }

    _onDestroy() {
        this._monitor.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._soundSettings.disconnectObject(this);
        this._rows.clear();
        this._control = null;
        this._monitor = null;
        this._settings = null;
        this._soundSettings = null;
        this._store = null;
    }
});
