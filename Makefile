.PHONY: all build install uninstall enable disable pack schemas lint clean

UUID = app-volume-mixer@cloweling.github.io
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SOURCES = extension.js prefs.js metadata.json stylesheet.css lib schemas
BUILD_DIR = build

all: schemas

schemas:
	glib-compile-schemas schemas/

install: schemas
	mkdir -p $(INSTALL_DIR)
	cp -r $(SOURCES) $(INSTALL_DIR)/

uninstall:
	rm -rf $(INSTALL_DIR)

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

pack: schemas
	rm -rf $(BUILD_DIR)
	mkdir -p $(BUILD_DIR)
	gnome-extensions pack \
		--force \
		--out-dir=$(BUILD_DIR) \
		--extra-source=lib \
		--schema=schemas/org.gnome.shell.extensions.app-volume-mixer.gschema.xml \
		.

lint:
	@command -v eslint >/dev/null 2>&1 && eslint . || \
		echo "eslint is not installed, skipping"

clean:
	rm -rf $(BUILD_DIR) schemas/gschemas.compiled
