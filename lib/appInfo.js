/* appInfo.js
 *
 * Resolves a Gvc mixer stream to a human readable name and an icon, using the
 * shell's application database when possible and falling back to whatever
 * metadata the audio server exposes.
 */

import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const FALLBACK_ICON = 'application-x-executable-symbolic';

/** Applications that only monitor audio and should never be listed. */
const BLOCKED_APPLICATION_IDS = new Set([
    'org.gnome.VolumeControl',
    'org.gnome.Settings',
    'org.PulseAudio.pavucontrol',
]);

let _iconTheme = null;

/**
 * @returns {St.IconTheme} a shared icon theme used to test icon availability
 */
function getIconTheme() {
    _iconTheme ??= new St.IconTheme();
    return _iconTheme;
}

/**
 * @param {string} id - an application id, with or without the .desktop suffix
 * @returns {Shell.App|null} the matching application, or null
 */
function lookupById(id) {
    if (!id)
        return null;

    const appSystem = Shell.AppSystem.get_default();
    return appSystem.lookup_app(id.endsWith('.desktop') ? id : `${id}.desktop`);
}

/**
 * @param {string} name - a stream or window class name
 * @returns {Shell.App|null} the matching application, or null
 */
function lookupByName(name) {
    if (!name)
        return null;

    const appSystem = Shell.AppSystem.get_default();
    return appSystem.lookup_startup_wmclass(name) ??
        appSystem.lookup_desktop_wmclass(name) ??
        appSystem.lookup_heuristic_basename(`${name.toLowerCase()}.desktop`);
}

/**
 * @param {Gio.Icon} gicon - the icon to check
 * @returns {boolean} whether the icon can be drawn with the current theme
 */
function iconIsAvailable(gicon) {
    if (!(gicon instanceof Gio.ThemedIcon))
        return true;

    const iconTheme = getIconTheme();
    return gicon.get_names().some(name => iconTheme.has_icon(name));
}

/**
 * Collects everything the UI needs to know about the application behind a
 * stream. Metadata is resolved in a single pass because looking applications
 * up is comparatively expensive.
 *
 * @param {Gvc.MixerStream} stream - the stream to describe
 * @returns {{key: string, name: string, description: string, icon: Gio.Icon}}
 *   the resolved metadata
 */
export function describeStream(stream) {
    const applicationId = stream.get_application_id();
    const streamName = stream.get_name() ?? '';
    const streamDescription = stream.get_description() ?? '';

    const app = lookupById(applicationId) ?? lookupByName(streamName);

    const name = app?.get_name() || streamName || streamDescription ||
        _('Unknown application');

    let icon = app?.get_icon() ?? null;
    if (!icon || !iconIsAvailable(icon))
        icon = stream.get_gicon();
    if (!icon || !iconIsAvailable(icon))
        icon = new Gio.ThemedIcon({name: FALLBACK_ICON});

    return {
        key: applicationId || app?.get_id() || streamName || name,
        name,
        description: streamDescription === name ? '' : streamDescription,
        icon,
    };
}

/**
 * @param {Gvc.MixerStream} stream - the stream to check
 * @returns {boolean} whether the stream belongs to an application that should
 *   never be listed
 */
export function isBlocked(stream) {
    return BLOCKED_APPLICATION_IDS.has(stream.get_application_id());
}

/**
 * Drops cached helpers, so that nothing survives the extension being disabled.
 */
export function clearCache() {
    _iconTheme = null;
}
