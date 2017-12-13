var EXPORTED_SYMBOLS = [ 'Message' ];

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource:///modules/gloda/mimemsg.js");

Components.utils.import("resource://redthunderminebird/common.js");

load("resource://redthunderminebird/preference.js", this);
load("resource://redthunderminebird/utility.js", this);

var Message = function(message, selection) {
	this.message = message;
	this.dbview = message.folder.msgDatabase;
	this.selection = selection;

	//MIMEメッセージ変換(syncにできない？)
	var subject = null;
	var headers = {};
	var body = null;
	var attachments = null;
	this.encode = function(callback) {
		MsgHdrToMimeMessage(this.message, null, function(message, mimemessage) {
			subject = message.mime2DecodedSubject;
			headers = mimemessage.headers;
			body = mimemessage.coerceBodyToPlaintext();
			attachments = [];
			for (var i = 0; i < mimemessage.allAttachments.length; i++)
			{
				var attachment = mimemessage.allAttachments[i];

				//添付ファイルストリーム
				// declare?
				// https://developer.mozilla.org/en-US/docs/XPCOM_Interface_Reference/nsIChannel#open()
				var uri = Services.io.newURI(attachment.url, null, null);
				var channel = Services.io.newChannelFromURI(uri);
				var istream = channel.open();
				var bstream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
				bstream.setInputStream(istream);

				//ストリームからバイナリの読み込み(bstream.available() is max 32768?)
				var bytes = bstream.readByteArray(attachment.size);
				istream.close();
				bstream.close();

				attachment.data = new Int8Array(bytes);
				attachments.push(attachment);
			}
			callback();
		});
	};

	this.getId = function() {
		var thread = this.dbview.GetMsgHdrForKey(this.message.threadId);
		var ticketid = thread.getUint32Property('redmineticketid');
		return ticketid;
	};

	this.setId = function(id) {
		var thread = this.dbview.GetMsgHdrForKey(this.message.threadId);
		thread.setUint32Property('redmineticketid', id);
	};

	this.getSubject = function() {
		if (subject === null)
			subject = this.message.mime2DecodedSubject;
		return subject;
	};

	var MIMEHeaderParam = Components
		.classes['@mozilla.org/network/mime-hdrparam;1']
		.getService(Components.interfaces.nsIMIMEHeaderParam);

	this.getHeader = function(name) {
		var value = (headers[name.toLowerCase()] || []).join(', ');
		return value.replace(/=\?[-_a-z0-9]+\?.\?[^?]+\?=/gi, function(matched) {
			return MIMEHeaderParam.getParameter(matched, '', '', false, {});
		});
	};

	//転送メールのヘッダ（mail.show_headers=1の場合）と同等の情報
	this.getHeadersSummary = function(headers) {
		headers = headers.map(function(name) {
			if (!name)
				return null;
			var value = this.getHeader(name);
			if (value)
				return name + ': ' + value;
			else
				return null;
		}, this);
		headers = headers.filter(function(header) {
			return header;
		});
		return headers.join('\n');
	};

	this.getBody = function() {
		if (this.selection && this.selection.rangeCount && this.selection.getRangeAt(0).toString() !== '')
		{
			return this.selection.getRangeAt(0).toString();
		}
		else
		{
			return body;
		}
	};

	this.getProjectId = function() {
		var directorys = preference.getObject('directories');
		var project_id = directorys[this.message.folder.URI];
		if (!project_id)
			project_id = directorys[''];
		return project_id;
	};

	this.getAttachments = function() {
		return attachments;
	};

	this.toObject = function() {
		var result = {
			id : this.getId(),
			subject : this.getSubject(),
		};

		var exp = preference.getString('default_subject');
		if (exp.length > 0)
		{
			var regexp = new RegExp(exp, 'gi');
			result.subject = result.subject.replace(regexp, '');
		}

		result.project_id = this.getProjectId();
		result.tracker_id = preference.getString('default_tracker');

		var body = this.getBody();
		if (body !== null && preference.getBool('default_description'))
		{
			body = body.replace(/^(.*)(\r\n|\r|\n)/mg, function(m, m1, m2) {
				if (m.charAt(0) == '>')
					return m;
				else
					return m1 + '  ' + m2;
			});
		}
		result.description = body;
		result.notes = body;

		var due_length = parseInt(preference.getInt('default_due'));
		if (!isNaN(due_length) && due_length > 0)
			result.due_date = utility.formatDate(new Date(), due_length);

		return result;
	};
};
