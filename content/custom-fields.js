var CustomFields = {
	buildUI: function({ custom_fields = null, message = null }) {
		console.log('building custom fields UI for ', custom_fields);
		var fixedRows = Array.from(document.querySelectorAll('.fixed-row'));
		var range = document.createRange();
		range.setStartAfter(fixedRows[fixedRows.length - 1]);
		range.setEndAfter(fixedRows[0].parentNode.lastChild);
		range.deleteContents();

		var all_custom_fields = redmine.customFields();
		custom_fields = custom_fields || all_custom_fields;
		logger.info('custom_fields', custom_fields);
		logger.info('all_custom_fields', all_custom_fields);

		var rows = document.createDocumentFragment();
		for (let custom_field of custom_fields) {
			logger.info('custom_field', custom_field);
			let row = document.createXULElement('row');
			row.setAttribute('align', 'center');

			let label = row.appendChild(document.createXULElement('label'));
			label.setAttribute('value', custom_field.name);
			label.setAttribute('control', 'custom-field-' + custom_field.id);

			let field_definition = all_custom_fields.filter(field => field.id == custom_field.id)[0];
			let field;
			let value = custom_field.value || '';
			if (!value &&
				message &&
				field_definition.default_value &&
				/%header:(.+)%/.test(field_definition.default_value)) {
				value = field_definition.default_value.replace(/%header:(.+)%/g, matched => {
					return message.getHeader(RegExp.$1) || '';
				});
			}
			switch (field_definition.field_format) {
				default:
				case 'date':
					field = row.appendChild(document.createXULElement('textbox'));
					field.setAttribute('value', value);
					field.originalValue = value;
					if (custom_field.field_format == 'date')
						field.setAttribute('placeholder', 'YYYY-MM-DD');
					break;
				case 'list':
					let possible_values = field_definition.possible_values;
					if (field_definition.multiple) {
						field = row.appendChild(document.createXULElement('hbox'));
						field.originalValues = [];
						for (let possible_value of possible_values) {
							let item = field.appendChild(document.createXULElement('checkbox'));
							item.setAttribute('label', possible_value.value);
							if (value &&
								value.indexOf(possible_value.value) > -1) {
								item.setAttribute('checked', true);
								field.originalValues.push(possible_value.value);
							}
						}
					}
					else {
						field = row.appendChild(document.createXULElement('menulist'));
						field.setAttribute('value', value);
						if (value)
							field.originalValue = value;
						let popup = field.appendChild(document.createXULElement('menupopup'));
						for (let possible_value of possible_values) {
							let item = popup.appendChild(document.createXULElement('menuitem'));
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
		var fields = Array.from(document.querySelectorAll('.custom-field'));
		if (fields.length == 0)
		  return null;
		var values = fields.map(field => {
			let value = field.value;
			if (field.localName == 'hbox') {
				value = Array.from(field.querySelectorAll('checkbox[checked="true"]')).map(item => item.getAttribute('label'));
				if (JSON.stringify(value) == JSON.stringify(field.originalValues))
					return null;
			}
			else if (value == field.originalValue) {
				return null;
			}
			return {
				id:    parseInt(field.getAttribute('id').replace('custom-field-', '')),
				value: value
			};
		}).filter(value => !!value);
		return values.length == 0 ? null : values;
	}
};
