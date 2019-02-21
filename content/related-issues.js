function onParentTicket(ticket) {
	var idField = document.getElementById('parent_issue_id');
	var id = idField.value;
	if (!ticket)
		ticket = redmine.tryTicket(id);
	var ticket_title = ticket.id ? utility.formatTicketSubject(ticket) : bundle.getLocalString("message.notfoundissue", id);
	idField.style.width = (String(id || '000').length + 3) + 'ch';

	var titleField = document.getElementById('parent_ticket_title');
	titleField.setAttribute('tooltiptext', titleField.value = ticket_title.replace(/^#[0-9]+:/, ''));
}

function onReferParent() {
	window.openDialog("chrome://redthunderminebird/content/refer.xul", "referDialog", "chrome,centerscreen,modal", message, function(ticket) {
		document.getElementById('parent_issue_id').value = ticket.id;
		onParentTicket(ticket);
		return true;
	});
}

function addRelation() {
  var rows = document.getElementById('relations');
  var template = document.getElementById('relation_template').firstChild;
  rows.appendChild(template.cloneNode(true));
}

function onChangeRelation(row, ticket) {
	var idField = row.querySelector('.relation_issue_id');
	var id = idField.value;
	if (!ticket)
		ticket = redmine.tryTicket(id);
	var ticket_title = ticket.id ? utility.formatTicketSubject(ticket) : bundle.getLocalString("message.notfoundissue", id);
	idField.style.width = (String(id || '000').length + 3) + 'ch';

	var titleField = row.querySelector('.relation_issue_title');
	titleField.setAttribute('tooltiptext', titleField.value = ticket_title.replace(/^#[0-9]+:/, ''));
}

function onReferRelation(row) {
	window.openDialog("chrome://redthunderminebird/content/refer.xul", "referDialog", "chrome,centerscreen,modal", message, function(ticket) {
		row.querySelector('.relation_issue_id').value = ticket.id;
		onChangeRelation(row, ticket);
		return true;
	});
}

function onRemoveRelation(row) {
	var rows = row.parentNode;
	rows.removeChild(row);
}
