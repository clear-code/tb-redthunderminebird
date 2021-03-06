Components.utils.import("resource://redthunderminebird/common.js");

load("resource://redthunderminebird/preference.js", this);
load("resource://redthunderminebird/redmine.js", this);
load("resource://redthunderminebird/utility.js", this);

var message = window.arguments[0];
var gTicket;

function onLoad() {
	preference.getChildList('field_visibility').forEach(function(key) {
		var field = document.querySelector('.field_' + key.split('.')[1]);
		if (field)
			field.style.visibility = preference.getBool(key) ? '' : 'collapse';
	});

	//選択可能なステータス一覧
	var issueStatuses = redmine.issueStatuses();
	var node = document.querySelector('#status_id menupopup');
	for (var i = 0; i < issueStatuses.length; i++)
	{
		utility.appendMenuitem(node, issueStatuses[i].id, issueStatuses[i].name);
	}

	//添付ファイル一覧
	var files = message.getAttachments();
	for (var i = 0; i < files.length; i++)
	{
		var row = document.createXULElement('row');
		var checkbox = document.createXULElement('checkbox');
		var label = document.createXULElement('label');

		checkbox.setAttribute('label', files[i].name);
		checkbox.setAttribute('class', 'attachment_data');
		if (preference.getBool('default_upload_attachments'))
			checkbox.setAttribute('checked', true);

		label.setAttribute('value', utility.formatSize(files[i].size));

		row.appendChild(checkbox);
		row.appendChild(label);

		document.getElementById('ticket_files').appendChild(row);
	}

	//初期データ設定
	var defdata = message.toObject();
	logger.info('defdata from message: ', defdata);
	if (defdata.id == 0)
		defdata.id = '';
	var ticket = redmine.tryTicket(defdata.id, { include: 'relations' });
	console.log('updating UI for ', ticket);
	logger.info('ticket: ', ticket);

	gTicket = ticket;
	onTicket(ticket);

	//フォーム設定
	defdata.assigned_to_id = ticket.assigned_to ? ticket.assigned_to.id : "";
	defdata.fixed_version_id = ticket.fixed_version ? ticket.fixed_version.id : "";
	defdata.description = ticket.description;
	defdata.status_id = ticket.status ? ticket.status.id : "";
	if (ticket.start_date)
		defdata.start_date = ticket.start_date;
	if (ticket.due_date)
		defdata.due_date = ticket.due_date;
	var elements = document.querySelectorAll('*|*.ticket_data');
	utility.jsontoform(defdata, elements);

	var notesField = document.getElementById('notes');
	notesField.value = fillTemplate(preference.getString('template.notes'), {
		headers: message.getHeadersSummary(preference.getString('default_notes_header.headers').split(',')),
		body: notesField.value
	});
}

function onPeriod(sender, target) {
	if (sender.checked)
		document.getElementById(target).removeAttribute('disabled');
	else
		document.getElementById(target).setAttribute('disabled', true);
};

function onToggleDescription(target) {
	var node = document.getElementById(target);
	if (node.style.display === 'none')
	{
		node.style.display = '';
	}
	else
	{
		node.style.display = 'none';
	}
	window.sizeToContent();
}

function onProject() {
	//デフォルト設定用
	var user = redmine.myself();
	var project_id = message.getProjectId();

	//プロジェクト存在確認
	try
	{
		redmine.project(project_id);
	}
	catch (e)
	{
		logger.error(e);
		close();
		return window.opener.alert(bundle.getLocalString("message.notfoundproject"));
	}

	//担当者再構築
	var node = document.querySelector('#assigned_to_id menupopup');
	var current = document.getElementById('assigned_to_id').value;
	utility.removeChildren(node);
	utility.appendMenuitem(node, "", "");
	utility.appendMenuitem(node, user.id, bundle.getLocalString("value.myselfname"));
	var members = redmine.members(project_id);
	for (var i = 0; i < members.length; i++)
	{
		let member_user = members[i].user || {};
		if (user.id == member_user.id)
			continue;
		utility.appendMenuitem(node, member_user.id, member_user.name);
	}
	document.getElementById('assigned_to_id').value = current;

	//対象バージョン再構築
	var node = document.querySelector('#fixed_version_id menupopup');
	var current = document.getElementById('fixed_version_id').value;
	utility.removeChildren(node);
	utility.appendMenuitem(node, "", "");
	var versions = redmine.versions(project_id);
	for (var i = 0; i < versions.length; i++)
	{
		utility.appendMenuitem(node, versions[i].id, versions[i].name);
	}
	document.getElementById('fixed_version_id').value = current;

	window.sizeToContent();
}

function onTicket(ticket) {
	var idField = document.getElementById('id');
	var id = idField.value;
	logger.info('onTicket: id: ', id);
	if (!ticket)
		ticket = redmine.tryTicket(id, { include: 'relations' });
	logger.info('onTicket: ticket: ', ticket);
	var ticket_title = ticket.id ? utility.formatTicketSubject(ticket) : bundle.getLocalString("message.notfoundissue", id);
	idField.style.width = (String(id || '000').length + 3) + 'ch';
	logger.info('onTicket: idField.style.width: ', idField.style.width);

	var titleField = document.getElementById('ticket_title');
	titleField.setAttribute('tooltiptext', titleField.value = ticket_title.replace(/^#[0-9]+:/, ''));

	document.getElementById('description').value = ticket.description ? ticket.description : "";
	document.getElementById('status_id').value = ticket.status ? ticket.status.id : "";
	document.getElementById('assigned_to_id').value = ticket.assigned_to ? ticket.assigned_to.id : "";
	document.getElementById('fixed_version_id').value = ticket.fixed_version ? ticket.fixed_version.id : "";

	if (ticket.parent) {
		document.getElementById('parent_issue_id').value = ticket.parent.id;
		var parentTicket = redmine.tryTicket(ticket.parent.id);
		onParentTicket(parentTicket);
	}
	else {
		document.getElementById('parent_issue_id').value = '';
		onParentTicket();
	}

	clearRelations();
	var relations = ticket.relations || redmine.relations(ticket.id);
	if (relations)
		relations.forEach(addRelation);

    if (ticket.custom_fields)
		CustomFields.buildUI({ custom_fields: ticket.custom_fields, message }); // build only for associated fields
	else
		CustomFields.buildUI({ message }); // build for all custom fields

	onProject();
}

function onRefer() {
	window.openDialog("chrome://redthunderminebird/content/refer.xul", "referDialog", "chrome,centerscreen,modal", message, function(ticket) {
		document.getElementById('id').value = ticket.id;
		// ↑でonchageは呼ばれない
		onTicket(ticket);
		return true;
	});
}

function onUpdate() {
	var id = document.getElementById('id').value;
	if (id == '')
	{
		alert(bundle.getLocalString("message.notselectissue"));
		return;
	}
	if (Object.keys(redmine.tryTicket(id)).length === 0)
	{
		alert(bundle.getLocalString("message.notfoundissue", id));
		return;
	}

	var elements = document.querySelectorAll('*|*.ticket_data');
	var data = utility.formtojson(elements);
	var customFields = CustomFields.toJSON();
	console.log('saving custom fields ', customFields);
	if (customFields)
		data.custom_fields = customFields;

	if (!document.getElementById('start_date_enable').checked)
		data.start_date = gTicket.start_date || '';
	if (!document.getElementById('due_date_enable').checked)
		data.due_date = gTicket.due_date || '';

	data.files = [];
	var attachments = message.getAttachments();
	var fileelems = document.getElementsByClassName('attachment_data');
	for (var i = 0; i < fileelems.length; i++)
	{
		if (fileelems[i].checked)
		{
			data.files.push(attachments[i]);
		}
	}

	//コールバック呼び出し(チケット更新できたらtrue)
	if (window.arguments[1](data))
	{
		saveRelations(id);
		close();
	}
}
