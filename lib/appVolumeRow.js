/* appVolumeRow.js
 *
 * A single application entry: icon, name, volume percentage, mute button and
 * slider. The volume handling mirrors the shell's own StreamSlider so that the
 * behaviour (muting at the bottom of the slider, amplification, ...) is
 * consistent with the system volume control.
 */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gvc from 'gi://Gvc';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as AppInfo from './appInfo.js';

const UNMUTE_DEFAULT_VOLUME = 0.25;

const OUTPUT_ICONS = [
    'audio-volume-muted-symbolic',
    'audio-volume-low-symbolic',
    'audio-volume-medium-symbolic',
    'audio-volume-high-symbolic',
    'audio-volume-overamplified-symbolic',
];

const INPUT_ICONS = [
    'microphone-sensitivity-muted-symbolic',
    'microphone-sensitivity-low-symbolic',
    'microphone-sensitivity-medium-symbolic',
    'microphone-sensitivity-high-symbolic',
];

export const AppVolumeRow = GObject.registerClass({
    Signals: {
        'order-changed': {},
    },
}, class AppVolumeRow extends St.BoxLayout {
    _init(stream, control, settings, store) {
        super._init({
            style_class: 'app-volume-row',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });

        this._stream = stream;
        this._control = control;
        this._settings = settings;
        this._store = store;
        this._isInput = stream instanceof Gvc.MixerSourceOutput;
        this._icons = this._isInput ? INPUT_ICONS : OUTPUT_ICONS;
        this._info = AppInfo.describeStream(stream);
        this._maxLevel = 1;

        const titleBox = new St.BoxLayout({
            style_class: 'app-volume-row-title',
            x_expand: true,
        });
        this.add_child(titleBox);

        this._appIcon = new St.Icon({
            style_class: 'app-volume-app-icon',
            gicon: this._info.icon,
            y_align: Clutter.ActorAlign.CENTER,
        });
        titleBox.add_child(this._appIcon);

        this._nameLabel = new St.Label({
            style_class: 'app-volume-app-name',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._nameLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        titleBox.add_child(this._nameLabel);

        this._percentageLabel = new St.Label({
            style_class: 'app-volume-percentage',
            y_align: Clutter.ActorAlign.CENTER,
        });
        titleBox.add_child(this._percentageLabel);

        const sliderBox = new St.BoxLayout({
            style_class: 'app-volume-row-slider',
            x_expand: true,
        });
        this.add_child(sliderBox);

        this._muteIcon = new St.Icon({icon_name: this._icons[0]});
        this._muteButton = new St.Button({
            style_class: 'icon-button flat',
            child: this._muteIcon,
            can_focus: true,
            x_expand: false,
            y_expand: true,
        });
        this._muteButton.connect('clicked', () => this._toggleMuted());
        sliderBox.add_child(this._muteButton);

        this._slider = new Slider(0);
        this._sliderChangedId = this._slider.connect('notify::value',
            () => this._onSliderChanged());

        // A bin around the slider, matching the shell's QuickSlider, so that
        // keyboard focus is drawn the same way.
        const sliderBin = new St.Bin({
            style_class: 'slider-bin',
            child: this._slider,
            reactive: true,
            can_focus: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        sliderBin.connect('event', (bin, event) => this._slider.event(event, false));
        sliderBox.add_child(sliderBin);

        const sliderAccessible = this._slider.get_accessible();
        sliderAccessible.set_parent(sliderBin.get_parent().get_accessible());
        sliderBin.set_accessible(sliderAccessible);

        this._stream.connectObject(
            'notify::volume', () => this._updateVolume(),
            'notify::is-muted', () => this._updateVolume(),
            'notify::name', () => this.refresh(),
            'notify::description', () => this.refresh(),
            'notify::icon-name', () => this.refresh(),
            'notify::application-id', () => this.refresh(),
            this);

        this._settings.connectObject(
            'changed::show-percentage', () => this._updateLabels(),
            'changed::show-media-name', () => this._updateLabels(),
            this);

        this.connect('destroy', () => this._onDestroy());

        this._updateLabels();
        this._restoreStoredVolume();
        this._updateVolume();
    }

    /**
     * @returns {Gvc.MixerStream} the stream controlled by this row
     */
    get stream() {
        return this._stream;
    }

    /**
     * @returns {number} the id of the controlled stream
     */
    get streamId() {
        return this._stream.get_id();
    }

    /**
     * A key used to keep the list sorted: alphabetically by application name,
     * with the stream id as a tie breaker so that the order of two streams of
     * the same application never flips around.
     *
     * @returns {string} the sort key
     */
    get sortKey() {
        return `${this._info.name.toLowerCase()}\u0000${`${this.streamId}`.padStart(10, '0')}`;
    }

    /**
     * @param {number} maxLevel - the maximum slider value, where 1 is the
     *   normal (100%) volume
     */
    setMaxLevel(maxLevel) {
        this._maxLevel = maxLevel;

        this._slider.maximum_value = maxLevel;
        this._slider.clearMarks();
        if (maxLevel > 1)
            this._slider.addMark(1);

        this._updateVolume();
    }

    /**
     * Re-reads the application metadata, for instance after an application
     * changed the title of the media it is playing.
     */
    refresh() {
        const previousSortKey = this.sortKey;

        this._info = AppInfo.describeStream(this._stream);
        this._appIcon.gicon = this._info.icon;
        this._updateLabels();

        if (this.sortKey !== previousSortKey)
            this.emit('order-changed');
    }

    _updateLabels() {
        const {name, description} = this._info;
        const showDescription =
            description && this._settings.get_boolean('show-media-name');

        this._nameLabel.text = showDescription
            ? `${name} — ${description}`
            : name;
        this._slider.accessible_name = this._isInput
            ? _('%s input volume').format(name)
            : _('%s volume').format(name);

        this._percentageLabel.visible =
            this._settings.get_boolean('show-percentage');
        this._updatePercentage();
    }

    _updatePercentage() {
        if (!this._percentageLabel.visible)
            return;

        const level = this._stream.is_muted ? 0 : this._level;
        this._percentageLabel.text = `${Math.round(level * 100)}%`;
    }

    get _level() {
        const maxNorm = this._control.get_vol_max_norm();
        return maxNorm > 0 ? this._stream.volume / maxNorm : 0;
    }

    _restoreStoredVolume() {
        const stored = this._store.lookup(this._info.key);
        if (!stored)
            return;

        const volume = Math.clamp(stored.volume, 0, this._maxLevel) *
            this._control.get_vol_max_norm();

        if (this._stream.set_volume(volume))
            this._stream.push_volume();
        this._stream.change_is_muted(stored.muted);
    }

    _rememberVolume() {
        this._store.remember(this._info.key, this._level, this._stream.is_muted);
    }

    _toggleMuted() {
        const {is_muted: isMuted} = this._stream;

        if (isMuted && this._stream.volume === 0) {
            this._stream.volume =
                UNMUTE_DEFAULT_VOLUME * this._control.get_vol_max_norm();
            this._stream.push_volume();
        }

        this._stream.change_is_muted(!isMuted);
    }

    _onSliderChanged() {
        const volume = this._slider.value * this._control.get_vol_max_norm();
        const wasMuted = this._stream.is_muted;

        let volumeChanged;
        if (volume < 1) {
            volumeChanged = this._stream.set_volume(0);
            if (!wasMuted)
                this._stream.change_is_muted(true);
        } else {
            volumeChanged = this._stream.set_volume(volume);
            if (wasMuted)
                this._stream.change_is_muted(false);
        }

        if (volumeChanged)
            this._stream.push_volume();

        this._updatePercentage();
        this._rememberVolume();
    }

    _updateVolume() {
        const muted = this._stream.is_muted;
        const level = muted ? 0 : this._level;

        this._slider.block_signal_handler(this._sliderChangedId);
        this._slider.value = Math.clamp(level, 0, this._maxLevel);
        this._slider.unblock_signal_handler(this._sliderChangedId);

        this._muteIcon.icon_name = this._getVolumeIconName();
        this._muteButton.accessible_name = muted ? _('Unmute') : _('Mute');
        this._updatePercentage();
        this._rememberVolume();
    }

    _getVolumeIconName() {
        if (this._stream.is_muted || this._level <= 0)
            return this._icons[0];

        const n = Math.clamp(Math.ceil(3 * this._level), 1, this._icons.length - 1);
        return this._icons[n];
    }

    _onDestroy() {
        this._stream.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._stream = null;
        this._control = null;
        this._settings = null;
        this._store = null;
    }
});
