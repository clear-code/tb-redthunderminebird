PACKAGE_NAME = redthunderminebird

.PHONY: xpi lint

all: xpi

xpi:
	zip -r -0 $(PACKAGE_NAME).xpi manifest.json chrome.manifest content locale modules defaults >/dev/null 2>/dev/null
	cd webextensions && make && cp ./*.xpi ../

lint:
	cd webextensions && make lint
