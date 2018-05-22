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

			let field_definition = all_custom_fields.filter(field => field.id == custom_field.id)[0];
			let field;
			switch (field_definition.field_format) {
				default:
				case 'date':
					field = row.appendChild(document.createElement('textbox'));
					field.setAttribute('value', custom_field.value || '');
					if (custom_field.field_format == 'date')
						field.setAttribute('placeholder', 'YYYY-MM-DD');
					break;
				case 'list':
					let possible_values = field_definition.possible_values;
					if (field_definition.multiple) {
						field = row.appendChild(document.createElement('hbox'));
						for (let possible_value of possible_values) {
							let item = field.appendChild(document.createElement('checkbox'));
							item.setAttribute('label', possible_value.value);
							if (custom_field.value &&
								custom_field.value.indexOf(possible_value.value) > -1)
								item.setAttribute('checked', true);
						}
					}
					else {
						field = row.appendChild(document.createElement('menulist'));
						field.setAttribute('value', custom_field.value || '');
						let popup = field.appendChild(document.createElement('menupopup'));
						for (let possible_value of possible_values) {
							let item = popup.appendChild(document.createElement('menuitem'));
							item.setAttribute('label', possible_value.value);
							item.setAttribute('value', possible_value.value);
						}
					}
					break;
			}
			field.setAttribute('id', 'custom-field-' + custom_field.id);
			field.setAttribute('class', 'custom-field');

			rows.appendChild(row);
		}

		range.insertNode(rows);
		range.detach();
	},

	toJSON: function() {
		var fields = Array.slice(document.querySelectorAll('.custom-field'));
		if (fields.length == 0)
		  return null;
		return fields.map(field => {
			let value = field.value;
			if (field.localName == 'hbox') {
				value = Array.slice(field.querySelectorAll('checkbox[checked="true"]')).map(item => item.value);
			}
			return {
				id:    parseInt(field.getAttribute('id').replace('custom-field-', '')),
				value: value
			};
		});
	}
};
