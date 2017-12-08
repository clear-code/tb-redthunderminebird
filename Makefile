all:
	zip -r -0 redthunderbirdmine.xpi *.rdf *.manifest content locale modules defaults >/dev/null 2>/dev/null
