Components.utils.import("resource://redthunderminebird/common.js");

load("resource://redthunderminebird/preference.js", this);
load("resource://redthunderminebird/redmine.js", this);
load("resource://redthunderminebird/utility.js", this);

function _build() {
	//トラッカーselectboxのリフレッシュ
	var holder = document.querySelector('#redthunderminebird-default_tracker menupopup');
	utility.removeChildren(holder);
	var trackers = redmine.trackers();
	for (var i = 0; i < trackers.length; i++)
	{
		utility.appendMenuitem(holder, trackers[i].id, trackers[i].name);
	}

	//アカウントのディレクトリ取得
	var accountURI = preference.getString('account');
	var rdf_service = Cc['@mozilla.org/rdf/rdf-service;1'].getService(Ci.nsIRDFService);
	var root_folder = rdf_service.GetResource(accountURI);
	root_folder.QueryInterface(Ci.nsIMsgFolder);

	//フォルダURI：フォルダ名を生成
	var folders = JSON.parse('{"" : "' + bundle.getLocalString("value.defaultfolder") + '"}');
	var filter = new RegExp(preference.getString('filter_directory'), 'i');
	var ignores = [ 'Archives', 'Drafts', 'Sent', 'Templates', 'Trash' ];
	(function(parent, it) {
		while (it.hasMoreElements())
		{
			//次のフォルダ取得
			var folder = it.getNext();
			folder.QueryInterface(Ci.nsIMsgFolder);

			//無視フォルダなら次へ
			if (ignores.indexOf(folder.URI.replace(accountURI + '/', '')) != -1)
				continue;

			//表示フォルダのみ結果配列へ代入
			if ((parent + folder.prettyName).match(filter))
				folders[folder.URI] = parent + folder.prettyName;

			//サブフォルダを持っているなら再帰
			if (folder.hasSubFolders)
				arguments.callee(folder.prettyName + '/', folder.subFolders);
		}
	})('', root_folder.subFolders);

	//マッピングrowsのリフレッシュ
	var holder = document.getElementById('directory_rows');
	utility.removeChildren(holder);
	var projects = redmine.projects();
	for ( var k in folders)
	{
		//必要ノードをあらかじめ生成
		var row = document.createXULElement("row");
		var label = document.createXULElement("label");
		var menulist = document.createXULElement("menulist");
		var menupopup = document.createXULElement("menupopup");

		//属性設定
		label.setAttribute('value', folders[k]);
		menulist.setAttribute('class', 'directory_data');
		menulist.setAttribute('name', k);
		row.setAttribute('align', 'center');

		//デフォルトだったら特殊なselectboxになる
		if (k !== '')
		{
			utility.appendMenuitem(menupopup, '', bundle.getLocalString("value.dependdefault"));
		}
		else
		{
			utility.appendMenuitem(menupopup, '', '');
		}
		menupopup.value = '';

		//プロジェクト分ループしてitemを追加
		for ( var i in projects)
		{
			utility.appendMenuitem(menupopup, projects[i].id, projects[i].fullname);
		}

		//親子関係設定
		menulist.appendChild(menupopup);
		row.appendChild(label);
		row.appendChild(menulist);
		holder.appendChild(row);
	}

	//設定値読み込み(デフォルト系)
	document.getElementById('redthunderminebird-default_tracker').value = preference.getString('default_tracker');
	document.getElementById('redthunderminebird-default_due').value = preference.getInt('default_due');
	document.getElementById('redthunderminebird-default_subject').value = preference.getString('default_subject');
	document.getElementById('redthunderminebird-default_upload_attachments').checked = preference.getBool('default_upload_attachments');

	//設定値読み込み(マッピング系)
	var directorys = preference.getObject('directories');
	var elements = document.getElementsByClassName('directory_data');
	for (var i = 0; i < elements.length; i++)
	{
		var name = elements[i].getAttribute('name');
		if (directorys[name] !== undefined)
		{
			elements[i].value = directorys[name];
		}
	}

	document.getElementById('template_description').value = preference.getString('template.description');
	document.getElementById('template_notes').value = preference.getString('template.notes');

	preference.getChildList('field_visibility').forEach(function(key) {
		var field = document.getElementById('field_visibility_' + key.split('.')[1]);
		if (field)
			field.checked = preference.getBool(key);
	});

	//中途半端な状態を出さないためにここまで到達できて初めて表示する
	document.getElementById('advance_option').style.visibility = '';
}

function onLoad() {
	//初期表示時は保存されている情報が正しい時のみページ構築する
	if (redmine.ping() && preference.getString('account') !== '')
	{
		_build();
	}
	//正しくないならフタをする
	else
	{
		document.getElementById('advance_option').style.visibility = 'hidden';
	}
};

function onRedmine() {
	//redmine設定ボックスを開いてページ構築する
	window.openDialog("chrome://redthunderminebird/content/input.xul", "redmineDialog", "chrome,centerscreen,modal", function() {
		redmine.recache();
		_build();
	});
}

function onCommit() {
	//設定値保存(デフォルト系)
	preference.setString('default_tracker', document.getElementById('redthunderminebird-default_tracker').value);
	preference.setInt('default_due', document.getElementById('redthunderminebird-default_due').value);
	preference.setString('default_subject', document.getElementById('redthunderminebird-default_subject').value);
	preference.setBool('default_upload_attachments', document.getElementById('redthunderminebird-default_upload_attachments').checked);

	//設定値保存(マッピング系)
	var directorys = {};
	var elements = document.getElementsByClassName('directory_data');
	for (var i = 0; i < elements.length; i++)
	{
		var name = elements[i].getAttribute('name');
		var val = elements[i].value;
		directorys[name] = val;
	}
	preference.setObject('directories', directorys);

	preference.setString('template.description', document.getElementById('template_description').value);
	preference.setString('template.notes', document.getElementById('template_notes').value);

	preference.getChildList('field_visibility').forEach(function(key) {
		var field = document.getElementById('field_visibility_' + key.split('.')[1]);
		if (field)
			preference.setBool(key, field.checked);
	});

	//終了
	close();
}

function onReset() {
	//preference.reset('redmine');
	//preference.reset('apikey');
	//preference.reset('account');
	preference.reset('directories');
	preference.reset('default_tracker');
	preference.reset('default_due');
	preference.reset('default_subject');
	preference.reset('default_description_header.headers');
	preference.reset('default_notes_header.headers');
	preference.reset('default_upload_attachments');
	preference.reset('target_project');
	preference.reset('filter_project');
	preference.reset('filter_directory');
	preference.reset('template.description');
	preference.reset('template.notes');
	preference.reset("field_visibility.project");
	preference.reset("field_visibility.tracker");
	preference.reset("field_visibility.subject");
	preference.reset("field_visibility.description");
	preference.reset("field_visibility.parent_issue");
	preference.reset("field_visibility.status");
	preference.reset("field_visibility.assigned");
	preference.reset("field_visibility.watcher");
	preference.reset("field_visibility.version");
	preference.reset("field_visibility.period");
	preference.reset("field_visibility.file");
	preference.reset("field_visibility.relations");
	preference.reset("field_visibility.other");
	preference.reset("field_visibility.issue");
	preference.reset("field_visibility.notes");
	close();
}
