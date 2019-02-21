function onParentTicket(ticket) {
	var idField = document.getElementById('parent_issue_id');
	var id = idField.value;
	if (!ticket)
		ticket = redmine.tryTicket(id);
	var ticket_title = ticket.id ? utility.formatTicketSubject(ticket) : bundle.getLocalString("message.notfoundissue", id);
	idField.style.width = (String(id || '000').length + 3) + 'ch';

	document.getElementById('parent_ticket_title').value = ticket_title;
}

function onReferParent() {
	window.openDialog("chrome://redthunderminebird/content/refer.xul", "referDialog", "chrome,centerscreen,modal", message, function(ticket) {
		document.getElementById('parent_issue_id').value = ticket.id;
		onParentTicket(ticket);
		return true;
	});
}
