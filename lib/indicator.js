/* indicator.js
 *
 * A Quick Settings indicator without a panel icon: it only contributes the
 * application volume entry to the Quick Settings menu.
 */

import GObject from 'gi://GObject';

import {SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {AppVolumeToggle} from './appVolumeToggle.js';

export const AppVolumeIndicator = GObject.registerClass(
class AppVolumeIndicator extends SystemIndicator {
    _init(control, monitor, settings, store) {
        super._init();

        this._toggle = new AppVolumeToggle(control, monitor, settings, store);
        this.quickSettingsItems.push(this._toggle);
    }

    destroy() {
        this.quickSettingsItems.forEach(item => item.destroy());
        this.quickSettingsItems.length = 0;
        this._toggle = null;

        super.destroy();
    }
});
