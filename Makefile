all:
	zip -r -0 redthunderminebird.xpi manifest.json chrome.manifest content locale modules defaults >/dev/null 2>/dev/null
