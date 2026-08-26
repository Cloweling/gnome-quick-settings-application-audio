/* streamMonitor.js
 *
 * Watches the shell's Gvc mixer control and keeps track of the audio streams
 * that belong to applications. The same code path works with PulseAudio and
 * with PipeWire's PulseAudio compatibility layer, because both are consumed
 * through libgvc.
 */

import GObject from 'gi://GObject';
import Gvc from 'gi://Gvc';

import * as AppInfo from './appInfo.js';

export const StreamMonitor = GObject.registerClass({
    Signals: {
        'stream-added': {param_types: [Gvc.MixerStream.$gtype]},
        'stream-removed': {param_types: [Gvc.MixerStream.$gtype]},
        'stream-updated': {param_types: [Gvc.MixerStream.$gtype]},
    },
}, class StreamMonitor extends GObject.Object {
    _init(control, settings) {
        super._init();

        this._control = control;
        this._settings = settings;
        this._streams = new Map();

        this._settings.connectObject('changed::show-input-streams',
            () => this._syncAll(), this);

        this._control.connectObject(
            'state-changed', () => this._onStateChanged(),
            'stream-added', (c, id) => this._onStreamAdded(id),
            'stream-removed', (c, id) => this._onStreamRemoved(id),
            'stream-changed', (c, id) => this._onStreamChanged(id),
            this);

        this._onStateChanged();
    }

    /**
     * @returns {Gvc.MixerStream[]} the currently tracked streams
     */
    get streams() {
        return [...this._streams.values()];
    }

    _isReady() {
        return this._control.get_state() === Gvc.MixerControlState.READY;
    }

    _shouldTrack(stream) {
        if (!stream || stream.is_event_stream || AppInfo.isBlocked(stream))
            return false;

        if (stream instanceof Gvc.MixerSinkInput)
            return true;

        if (stream instanceof Gvc.MixerSourceOutput)
            return this._settings.get_boolean('show-input-streams');

        return false;
    }

    _onStateChanged() {
        if (this._isReady())
            this._syncAll();
        else
            this._removeAll();
    }

    /**
     * Rebuilds the tracked set from scratch. Used on startup, when the
     * connection to the audio server is (re-)established, and whenever the
     * filtering settings change.
     */
    _syncAll() {
        if (!this._isReady()) {
            this._removeAll();
            return;
        }

        const current = new Map();
        const candidates = [
            ...this._control.get_sink_inputs(),
            ...this._control.get_source_outputs(),
        ];

        for (const stream of candidates) {
            if (this._shouldTrack(stream))
                current.set(stream.get_id(), stream);
        }

        for (const [id, stream] of this._streams) {
            if (!current.has(id)) {
                this._streams.delete(id);
                this.emit('stream-removed', stream);
            }
        }

        for (const [id, stream] of current) {
            if (!this._streams.has(id)) {
                this._streams.set(id, stream);
                this.emit('stream-added', stream);
            }
        }
    }

    _removeAll() {
        const streams = [...this._streams.values()];
        this._streams.clear();
        streams.forEach(stream => this.emit('stream-removed', stream));
    }

    _onStreamAdded(id) {
        if (this._streams.has(id))
            return;

        const stream = this._control.lookup_stream_id(id);
        if (!this._shouldTrack(stream))
            return;

        this._streams.set(id, stream);
        this.emit('stream-added', stream);
    }

    _onStreamRemoved(id) {
        const stream = this._streams.get(id);
        if (!stream)
            return;

        this._streams.delete(id);
        this.emit('stream-removed', stream);
    }

    _onStreamChanged(id) {
        const stream = this._control.lookup_stream_id(id);
        const tracked = this._streams.get(id);

        if (tracked && !this._shouldTrack(stream)) {
            this._onStreamRemoved(id);
            return;
        }

        if (tracked)
            this.emit('stream-updated', tracked);
        else
            this._onStreamAdded(id);
    }

    destroy() {
        this._control.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._streams.clear();
        this._control = null;
        this._settings = null;
    }
});
