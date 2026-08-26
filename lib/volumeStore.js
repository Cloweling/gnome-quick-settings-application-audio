/* volumeStore.js
 *
 * Optional persistence of per-application volumes. Values are keyed by
 * application id, so a stream that comes back later (a new song, a new call,
 * a restarted application) picks up where it left off.
 */

import GLib from 'gi://GLib';

const SAVE_TIMEOUT_MS = 1000;
const VARIANT_TYPE = 'a{s(db)}';

export class VolumeStore {
    constructor(settings) {
        this._settings = settings;
        this._pending = new Map();
        this._saveId = 0;
    }

    get enabled() {
        return this._settings.get_boolean('remember-volumes');
    }

    _read() {
        return this._settings.get_value('app-volumes').deepUnpack();
    }

    /**
     * @param {string} key - the application key
     * @returns {{volume: number, muted: boolean}|null} the stored state
     */
    lookup(key) {
        if (!this.enabled || !key)
            return null;

        const pending = this._pending.get(key);
        if (pending)
            return pending;

        const entry = this._read()[key];
        if (!entry)
            return null;

        const [volume, muted] = entry;
        return {volume, muted};
    }

    /**
     * Queues a state update. Writes are batched because sliders emit a lot of
     * intermediate values while being dragged.
     *
     * @param {string} key - the application key
     * @param {number} volume - the volume as a fraction of the normal maximum
     * @param {boolean} muted - whether the application is muted
     */
    remember(key, volume, muted) {
        if (!this.enabled || !key)
            return;

        this._pending.set(key, {volume, muted});

        if (this._saveId)
            return;

        this._saveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE,
            SAVE_TIMEOUT_MS, () => {
                this._saveId = 0;
                this.flush();
                return GLib.SOURCE_REMOVE;
            });
        GLib.Source.set_name_by_id(this._saveId,
            '[app-volume-mixer] save app volumes');
    }

    /**
     * Writes all queued updates to GSettings.
     */
    flush() {
        if (this._pending.size === 0)
            return;

        const stored = this._read();
        for (const [key, {volume, muted}] of this._pending)
            stored[key] = [volume, muted];
        this._pending.clear();

        this._settings.set_value('app-volumes',
            new GLib.Variant(VARIANT_TYPE, stored));
    }

    /**
     * Forgets every stored application volume.
     */
    clear() {
        this._pending.clear();
        this._settings.reset('app-volumes');
    }

    destroy() {
        if (this._saveId) {
            GLib.Source.remove(this._saveId);
            this._saveId = 0;
        }
        this.flush();
        this._settings = null;
    }
}
