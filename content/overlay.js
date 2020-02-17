Components.utils.import("resource://redthunderminebird/common.js");

load("resource://redthunderminebird/preference.js", this);
load("resource://redthunderminebird/redmine.js", this);
load("resource://redthunderminebird/message.js", this);
load("resource://redthunderminebird/utility.js", this);

var gRedThunderMineBirdLastSelectionMessage;

function onCreate() {
	//redmineに接続できないならどうしようもない
	if (!redmine.ping())
	{
		alert(bundle.getLocalString("message.invalidredmine"));
		return;
	}

	//メッセージから得られる初期データ
	var message = gRedThunderMineBirdLastSelectionMessage;
	message.encode(function() {
		//作成ダイアログを表示してチケット作成
		window.openDialog("chrome://redthunderminebird/content/create.xul", "createDialog", "chrome,centerscreen,modal,resizable", message, function(ticket) {
			//チケット作成
			var result = redmine.create(ticket);

			//issueがある=すべて成功した
			if (result.issue !== undefined)
			{
				message.setId(parseInt(result.issue.id));

				//@todo apiキーを付加しないとリダイレクトされてしまう
				//・オープン時のクッキー指定ミス？
				//・redmineのバグ？（http://www.redmine.org/issues/15926）
				window.openDialog("chrome://redthunderminebird/content/complete.xul", "completeDialog", "chrome,centerscreen,modal", {
					title : bundle.getLocalString("message.issuecreated"),
					label : redmine.getTicketUrl(result.issue.id),
					value : redmine.getTicketUrl(result.issue.id, true),
				});

				return result.issue;
			}
			//errorsがある=リクエストは成功したが、バリデーションエラーがある
			else if (result.errors !== undefined)
			{
				alert(result.errors.join('\n'));
				return false;
			}
			//htmlがある=リクエストが失敗した
			else if (result.html !== undefined)
			{
				alert(result.html.title);
				return false;
			}
			//それ以外は予測できない
			else
			{
				alert(bundle.getLocalString("message.othererror"));
				return false;
			}
		});
	});

}

function onUpdate() {
	//redmineに接続できないならどうしようもない
	if (!redmine.ping())
	{
		alert(bundle.getLocalString("message.invalidredmine"));
		return;
	}

	//メッセージから得られる初期データ
	var message = gRedThunderMineBirdLastSelectionMessage;
	message.encode(async function() {
		if (!message.getId() &&
			!(await onRefer(message)))
			throw new Error('ticket is not assigned');

		//更新ダイアログを表示してチケット更新
		window.openDialog("chrome://redthunderminebird/content/update.xul", "updateDialog", "chrome,centerscreen,modal,resizable", message, function(ticket) {
			//チケット更新
			try
			{
				var result = redmine.update(ticket);
				logger.debug(result);

				message.setId(parseInt(ticket.id));

				window.openDialog("chrome://redthunderminebird/content/complete.xul", "completeDialog", "chrome,centerscreen,modal", {
					title : bundle.getLocalString("message.issueupdated"),
					label : redmine.getTicketUrl(ticket.id),
					value : redmine.getTicketUrl(ticket.id, true),
				});

				return true;
			}
			catch (e)
			{
				logger.error(e);
				alert(bundle.getLocalString("message.othererror"));
				return false;
			}
		});
	});
}

function onOpen() {
	//メッセージから得られる初期データ
	var message = gRedThunderMineBirdLastSelectionMessage;

	if (message.getId() != 0)
	{
		utility.openBrowser(redmine.getTicketUrl(message.getId(), true));
	}
}

function onRefer(message) {
	return new Promise(resolve => {
	//メッセージから得られる初期データ
	if (!message)
		message = gRedThunderMineBirdLastSelectionMessage;

	//関連付けダイアログを表示してチケット関連付け
	window.openDialog("chrome://redthunderminebird/content/refer.xul", "referDialog", "chrome,centerscreen,modal,resizable", message, function(ticket) {
		if (ticket) {
			message.setId(parseInt(ticket.id));
			resolve(true);
			return true;
		}
		else {
			resolve(false);
			return false;
		}
	});
	});
}

function onWebUI() {
	//メッセージから得られる初期データ
	var message = gRedThunderMineBirdLastSelectionMessage;
	message.encode(function() {
		//ブラウザで開く
		utility.openBrowser(redmine.getCreationUrl(message));
	});
}

window.addEventListener('load', function() {
	const menu = document.getElementById('mailContext');
	menu.addEventListener('popupshowing', function(e) {
		if (e.target != menu)
			return;
		var message = new Message(gFolderDisplay.selectedMessage, document.commandDispatcher.focusedWindow.getSelection());
		var id = message.getId();
		document.getElementById('ticket_open').setAttribute('disabled', id == 0);
		gRedThunderMineBirdLastSelectionMessage = message;
	}, false);
	menu.addEventListener('popuphiding', function(e) {
		if (e.target != menu)
			return;
		gRedThunderMineBirdLastSelectionMessage = null;
	}, false);
}, true);
