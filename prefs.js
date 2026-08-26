/* prefs.js
 *
 * Preferences for the Application Volume Mixer extension.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class AppVolumeMixerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'audio-volume-high-symbolic',
        });
        window.add(page);

        page.add(this._createAppearanceGroup(settings));
        page.add(this._createBehaviourGroup(settings));
    }

    _createAppearanceGroup(settings) {
        const group = new Adw.PreferencesGroup({
            title: _('Appearance'),
            description: _('What the section in Quick Settings shows'),
        });

        const percentage = new Adw.SwitchRow({
            title: _('Show volume percentage'),
            subtitle: _('Display the current level next to each application'),
        });
        settings.bind('show-percentage', percentage, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        group.add(percentage);

        const mediaName = new Adw.SwitchRow({
            title: _('Show stream description'),
            subtitle: _('Append what the application reports it is playing'),
        });
        settings.bind('show-media-name', mediaName, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        group.add(mediaName);

        const hideWhenEmpty = new Adw.SwitchRow({
            title: _('Hide when idle'),
            subtitle: _('Remove the section while no application uses audio'),
        });
        settings.bind('hide-when-empty', hideWhenEmpty, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        group.add(hideWhenEmpty);

        const maxApps = new Adw.SpinRow({
            title: _('Maximum applications'),
            subtitle: _('Limit how many applications are listed at once (0 for no limit)'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 20,
                step_increment: 1,
                page_increment: 5,
            }),
        });
        // Bound by hand because the setting is an unsigned integer while the
        // row exposes a double.
        maxApps.value = settings.get_uint('max-visible-apps');
        maxApps.connect('notify::value',
            row => settings.set_uint('max-visible-apps', row.value));
        settings.connect('changed::max-visible-apps',
            () => (maxApps.value = settings.get_uint('max-visible-apps')));
        group.add(maxApps);

        return group;
    }

    _createBehaviourGroup(settings) {
        const group = new Adw.PreferencesGroup({
            title: _('Behaviour'),
        });

        const inputStreams = new Adw.SwitchRow({
            title: _('Include recording applications'),
            subtitle: _('Also list applications that capture audio'),
        });
        settings.bind('show-input-streams', inputStreams, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        group.add(inputStreams);

        const remember = new Adw.SwitchRow({
            title: _('Remember application volumes'),
            subtitle: _('Restore the last volume when an application plays again. Leave this off if your audio server already does it.'),
        });
        settings.bind('remember-volumes', remember, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        group.add(remember);

        const clearButton = new Gtk.Button({
            label: _('Forget'),
            valign: Gtk.Align.CENTER,
        });
        clearButton.add_css_class('destructive-action');
        clearButton.connect('clicked', () => settings.reset('app-volumes'));

        const clearRow = new Adw.ActionRow({
            title: _('Stored volumes'),
            subtitle: _('Discard every remembered application volume'),
            activatable_widget: clearButton,
        });
        clearRow.add_suffix(clearButton);
        settings.bind('remember-volumes', clearRow, 'sensitive',
            Gio.SettingsBindFlags.GET);
        group.add(clearRow);

        return group;
    }
}
