const fs = require("fs");
const path = require("path");

function initialize() {}

function serveBrowse() {
	const generate = (p, indent, indentEach) => {
		let res = [];
		let items = fs.readdirSync(p, { withFileTypes: true });
		items.forEach(item => {
			let front = new Array(indent).fill("|"+new Array(indentEach).fill(" ").join("")).join("");
			if (item.isDirectory()) {
				res.push(front+"+ "+item.name);
				res.push(generate(path.join(p, item.name), indent+1, indentEach));
			} else {
				res.push(front+"  "+item.name);
			}
		});
		return res.filter(l => l.length > 0).join("\n");
	};
	return "<pre>"+path.join(__dirname, "../../")+"</pre><pre>"+generate(path.join(__dirname, "../../"), 0, 4)+"</pre>";
}
function serveBasic() {
	const fPath = path.join(__dirname, "web", "index.html");
	const fContent = fs.readFileSync(fPath, "utf-8");
	return fContent;
}
function serveListLevels() {
	const fPath = path.join(__dirname, "web", "data", "levels");
	const fList = fs.readdirSync(fPath);
	return fList.map(name => name.split(".")).map(nameSplit => nameSplit.slice(0, nameSplit.length-1)).map(nameSplit => nameSplit.join(".")).filter(name => name.length > 0);
}

function addRoutes(app) {
	app.get("/", (req, res, next) => {
		res.send(serveBasic());
	});
	app.get("/login", (req, res, next) => {
		res.send(serveBasic());
	});
	app.get("/join", (req, res, next) => {
		res.send(serveBasic());
	});
	app.get("/browse", (req, res, next) => {
		res.send(serveBasic());
	});
	app.get("/settings", (req, res, next) => {
		res.send(serveBasic());
	});
	app.get("/tuner", (req, res, next) => {
		res.send(serveBasic());
	});
	app.get("/game", (req, res, next) => {
		res.send(serveBasic());
	});
	app.get("/list-levels", (req, res, next) => {
		res.send(serveListLevels());
	});
}

module.exports = {
	initialize, addRoutes
}