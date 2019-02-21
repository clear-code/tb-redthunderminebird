function fillTemplate(template, params) {
	var bodyForMarkdown = params.body.trim().replace(/^(.*)(\r\n|\r|\n)/mg, function(m, m1, m2) {
		if (m.charAt(0) == '>')
			return m;
		else
			return m1 + '  ' + m2;
	});
	return template
		.replace(/\%headers?\%/i, params.headers.trim() || '')
		.replace(/\%body_?for_?markdown\%/i, bodyForMarkdown || '')
		.replace(/\%body\%/i, params.body.trim() || '');
}
