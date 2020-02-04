Components.utils.import("resource://redthunderminebird/common.js");

load("resource://redthunderminebird/preference.js", this);
load("resource://redthunderminebird/redmine.js", this);
load("resource://redthunderminebird/utility.js", this);

var message = window.arguments[0];

function onLoad() {
	preference.getChildList('field_visibility').forEach(function(key) {
		var field = document.querySelector('.field_' + key.split('.')[1]);
		if (field)
			field.style.visibility = preference.getBool(key) ? '' : 'collapse';
	});

	//プロジェクト一覧
	var projects = redmine.projects();
	var node = document.querySelector('#project_id menupopup');
	for (var i = 0; i < projects.length; i++)
	{
		utility.appendMenuitem(node, projects[i].id, projects[i].fullname);
	}

	var project_id = document.getElementById('project_id').value;

	//選択可能なステータス一覧
	var issueStatuses = redmine.issueStatuses(project_id);
	var node = document.querySelector('#status_id menupopup');
	for (var i = 0; i < issueStatuses.length; i++)
	{
		utility.appendMenuitem(node, issueStatuses[i].id, issueStatuses[i].name);
	}

	//トラッカー一覧
	var trackers = redmine.trackers(project_id);
	var node = document.querySelector('#tracker_id menupopup');
	for (var i = 0; i < trackers.length; i++)
	{
		utility.appendMenuitem(node, trackers[i].id, trackers[i].name);
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

	CustomFields.buildUI();

	//初期データ
	var defdata = message.toObject();
	var elements = document.getElementsByClassName('ticket_data');
	utility.jsontoform(defdata, elements);

	var descriptionField = document.getElementById('description');
	descriptionField.value = fillTemplate(preference.getString('template.description'), {
		headers: message.getHeadersSummary(preference.getString('default_description_header.headers').split(',')),
		body: descriptionField.value
	});

	onProject();
}

function onPeriod(sender, target) {
	document.getElementById(target).disabled = !sender.checked;
};

function onProject() {
	//デフォルト設定用
	var user = redmine.myself();
	var project_id = document.getElementById('project_id').value;

	//デフォルトは何もしない
	if (project_id === '')
	{
		return;
	}

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

	//トラッカー再構築
	var node = document.querySelector('#tracker_id menupopup');
	utility.removeChildren(node);
	var trackers = redmine.trackers(project_id);
	for (var i = 0; i < trackers.length; i++)
	{
		utility.appendMenuitem(node, trackers[i].id, trackers[i].name);
	}
	if (!node.querySelector('[value="' + node.parentNode.value + '"]'))
	{
		node.parentNode.value = trackers[0].id;
	}

	//担当者再構築
	var node = document.querySelector('#assigned_to_id menupopup');
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
	document.getElementById('assigned_to_id').value = '';

	//対象バージョン再構築
	var node = document.querySelector('#fixed_version_id menupopup');
	utility.removeChildren(node);
	utility.appendMenuitem(node, "", "");
	var versions = redmine.versions(project_id);
	for (var i = 0; i < versions.length; i++)
	{
		utility.appendMenuitem(node, versions[i].id, versions[i].name);
	}
	document.getElementById('fixed_version_id').value = '';

	//ウォッチャー再構築
	var node = document.getElementById('watcher_users');
	utility.removeChildren(node);
	var row = null;
	for (var i = 0; i < members.length; i++)
	{
		if (i % 3 == 0)
		{
			row = document.createXULElement('row');
			node.appendChild(row);
		}
		var checkbox = document.createXULElement('checkbox');

		checkbox.setAttribute('label', members[i].user.name);
		checkbox.setAttribute('class', 'ticket_data array');
		checkbox.setAttribute('name', 'watcher_user_ids');
		checkbox.setAttribute('value', members[i].user.id);

		row.appendChild(checkbox);
	}

	CustomFields.buildUI();

	window.sizeToContent();
}

function onCreate() {
	var elements = document.getElementsByClassName('ticket_data');
	var data = utility.formtojson(elements);
	var customFields = CustomFields.toJSON();
	if (customFields)
		data.custom_fields = customFields;

	//プロジェクト未設定
	if (data.project_id === '')
	{
		return window.opener.alert('project is not selected.');
	}

	//作成時は明示的に指定しないと現在日時が入ってしまうようだs
	if (data.start_date === undefined)
	{
		data.start_date = '';
	}

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

	//コールバック呼び出し(チケット登録できたらissue)
	var issue = window.arguments[1](data);
	if (issue)
	{
		saveRelations(issue.id);
		close();
	}
}
