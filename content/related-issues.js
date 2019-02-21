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


var relationsToBeDeleted = [];

function saveRelations(issueId) {
	for (var relationId of relationsToBeDeleted) {
		redmine.deleteRelation(relationId);
	}
	relationsToBeDeleted = [];

	var rows = document.getElementById('relations');
	for (var row of rows.childNodes) {
		var issueToId = row.querySelector('.relation_issue_id').value;
		var relation = {
			id:            row.relationId,
			relation_type: row.querySelector('.relation_type').value,
			issue_id:      issueId,
			issue_to_id:   issueToId
		};
		if (relation.relation_type == 'precedes' ||
			relation.relation_type == 'follows')
			relation.delay = parseInt(row.querySelector('.relation_delay').value);
		if (row.relationId &&
			row.originalRelation.relation_type == relation.relation_type &&
			row.originalRelation.issue_to_id == relation.issue_to_id &&
			row.originalRelation.delay == relation.delay)
			continue;
		if (issueToId) {
			redmine.saveRelation(relation);
		}
		else if (row.relationId) {
			redmine.deleteRelation(row.relationId);
			delete row.relationId;
			delete row.originalRelation;
		}
	}
}

function clearRelations() {
	var rows = document.getElementById('relations');
	var range = document.createRange();
	range.selectNodeContents(rows);
	range.deleteContents();
	range.detach();
}

function addRelation(relation) {
	var rows = document.getElementById('relations');
	var template = document.getElementById('relation_template').firstChild;
	var row = rows.appendChild(template.cloneNode(true));
	if (relation) {
		row.relationId = relation.id;
		row.originalRelation = relation;
		row.querySelector('.relation_type').value = relation.relation_type;
		row.querySelector('.relation_issue_id').value = relation.issue_to_id;
		onChangeRelationType(row);
		onChangeRelation(row, redmine.tryTicket(relation.issue_to_id));
	}
}

function onChangeRelationType(row) {
	var type = row.querySelector('.relation_type').value;
	var container = row.querySelector('.relation_delay_container');
	if (type == 'precedes' ||
		type == 'follows')
		container.removeAttribute('collapsed');
	else
		container.setAttribute('collapsed', true);
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
	if (row.relationId)
		relationsToBeDeleted.push(row.relationId);
	var rows = row.parentNode;
	rows.removeChild(row);
}
