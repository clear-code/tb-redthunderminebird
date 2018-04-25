var CustomFields = {
	buildUI: function(custom_fields) {
		var fixedRows = Array.slice(document.querySelectorAll('.fixed-row'));
		var range = document.createRange();
		range.setStartAfter(fixedRows[fixedRows.length - 1]);
		range.setEndAfter(fixedRows[0].parentNode.lastChild);
		range.deleteContents();

		var all_custom_fields = redmine.customFields();
		custom_fields = custom_fields || all_custom_fields;
		logger.info('custom_fields', custom_fields);

		var rows = document.createDocumentFragment();
		for (let custom_field of custom_fields) {
			logger.info('custom_field', custom_field);
			let row = document.createElement('row');
			row.setAttribute('align', 'center');

			let label = row.appendChild(document.createElement('label'));
			label.setAttribute('value', custom_field.name);
			label.setAttribute('control', 'custom-field-' + custom_field.id);

			let field;
			//if (custom_field.field_format == 'text') {
				field = row.appendChild(document.createElement('textbox'));
				field.setAttribute('value', custom_field.value || '');
			//}
			field.setAttribute('id', 'custom-field-' + custom_field.id);
			field.setAttribute('class', 'custom-field');

			rows.appendChild(row);
		}

		range.insertNode(rows);
		range.detach();
	}
};
