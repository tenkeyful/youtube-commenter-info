const container = document.querySelector(".container");

function createCard(column) {
	const card = document.createElement("div");
	card.className = "card";

	const title = document.createElement("h3");
	title.textContent = column.title;
	card.appendChild(title);

	for (const item of column.items) {
		const row = document.createElement("div");
		row.className = "checkbox-item";

		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.id = item.key;
		checkbox.setAttribute("checked", ""); // on until the saved value is loaded

		const label = document.createElement("label");
		label.htmlFor = item.key;
		label.textContent = item.label;

		const symbol = document.createElement("span");
		symbol.className = "symbol";
		symbol.textContent = item.symbol;

		row.append(checkbox, label, symbol);
		card.appendChild(row);
	}
	return card;
}

function createCards() {
	const cells = []; // each cell is a list of cards
	for (const column of Settings.columns) {
		const card = createCard(column);
		if (column.stackWithPrevious && cells.length > 0) {
			cells[cells.length - 1].push(card);
		} else {
			cells.push([card]);
		}
	}

	return cells.map((cards) => {
		if (cards.length === 1) return cards[0];
		const stack = document.createElement("div");
		stack.className = "stack";
		stack.append(...cards);
		return stack;
	});
}

const checkboxes = () =>
	Array.from(document.querySelectorAll('input[type="checkbox"]'));

// shows the saved values
async function showSavedSettings() {
	const saved = await Settings.load();
	checkboxes().forEach((checkbox) => {
		checkbox.checked = saved[checkbox.id];
	});

	const position =
		saved.infoBoxPosition === Settings.POSITIONS.NEXT_TO_HANDLE
			? "positionAdjacent"
			: "positionBelow";
	document.getElementById(position).checked = true;
}

function saveSettings() {
	const values = {};
	checkboxes().forEach((checkbox) => {
		values[checkbox.id] = checkbox.checked;
	});

	const position = document.querySelector(
		'input[name="infoBoxPosition"]:checked',
	);
	if (position) values.infoBoxPosition = position.value;

	Settings.save(values);
}

document.addEventListener("DOMContentLoaded", () => {
	container.prepend(...createCards());
	showSavedSettings();

	// at least one checkbox must always stay checked
	checkboxes().forEach((checkbox) => {
		checkbox.addEventListener("change", (event) => {
			const anyChecked = checkboxes().some((other) => other.checked);
			if (!event.target.checked && !anyChecked) {
				event.target.checked = true;
				return;
			}
			saveSettings();
		});
	});

	document
		.querySelectorAll('input[name="infoBoxPosition"]')
		.forEach((radio) => {
			radio.addEventListener("change", saveSettings);
		});
});
