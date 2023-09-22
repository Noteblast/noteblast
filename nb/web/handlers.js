import * as util from "./util.js";
import * as struct from "./struct.js";
import { Note, Song, Level } from "./struct.js";

import * as analyzer from "./analyzer.js";

import bravura from "./bravura.js";

export const DATA = {};

export class Target {
	#handlers;
	
	constructor() {
		this.#handlers = {};
	}

	addHandler(e, f) {
		e = String(e);
		f = util.ensure(f, "func");
		if (!(e in this.#handlers)) this.#handlers[e] = [];
		if (this.#handlers[e].includes(f)) return false;
		this.#handlers[e].push(f);
		return true;
	}
	remHandler(e, f) {
		e = String(e);
		f = util.ensure(f, "func");
		if (!(e in this.#handlers)) return false;
		if (!this.#handlers[e].includes(f)) return false;
		this.#handlers[e].splice(this.#handlers[e].indexOf(f), 1);
		return true;
	}
	hasHandler(e, f) {
		e = String(e);
		f = util.ensure(f, "func");
		if (!(e in this.#handlers)) return false;
		if (!this.#handlers[e].includes(f)) return false;
		return this.#handlers[e].indexOf(f);
	}
	post(e, data) {
		e = String(e);
		data = util.ensure(data, "obj");
		if (!(e in this.#handlers)) return;
		this.#handlers[e].forEach(f => f(data));
	}
}

export class Handler extends Target {
	#app;
	
	#enabled;
	
	constructor(app) {
		super();
		
		this.#app = null;

		this.#enabled = false;

		this.app = app;
	}

	get app() { return this.#app; }
	set app(v) {
		v = ("App" in DATA) ? (v instanceof DATA.App) ? v : null : null;
		if (this.app == v) return;
		this.addHandler("hook-set", { from: this.app, to: v });
		if (this.hasApp()) this.addHandler("unhook", { from: this.app });
		this.#app = v;
		if (this.hasApp()) this.addHandler("hook", { to: this.app });
	}
	hasApp() { return ("App" in DATA) ? (this.app instanceof DATA.App) : false; }

	get enabled() { return this.#enabled; }
	set enabled(v) {
		v = !!v;
		if (this.enabled == v) return;
		this.#enabled = v;
		this.post("able-set", { from: !v, to: v });
		if (v) this.post("enable", {});
		else this.post("disable", {});
	}
	get disabled() { return !this.enabled; }
	set disabled(v) { this.enabled = !v; }
	
	setup(data) {
		this.post("setup", data);
	}

	update(data) {
		if (this.disabled) return;
		this.post("update", data);
	}
}

export class RecorderHandler extends Handler {
	#STREAM;
	#RECORDER;
	#AUDIOCTX;
	#SOURCE;
	#ANALYZER;

	#micOutput;
	#output;
	
	constructor(app) {
		super(app);

		this.#STREAM = null;
		this.#RECORDER = null;
		this.#AUDIOCTX = null;
		this.#SOURCE = null;
		this.#ANALYZER = null;

		this.#micOutput = null;
		this.#output = null;

		// when enabled: request microphone
		// ^ failed? post "enable-fail" and error
		// ^ success? post "enable-success" and handler
		this.addHandler("enable", data => {
			navigator.mediaDevices.getUserMedia({
				audio: {
		            "mandatory": {
		                "googEchoCancellation": "false",
		                "googAutoGainControl": "false",
		                "googNoiseSuppression": "false",
		                "googHighpassFilter": "false"
		            },
		            "optional": []
		        },
			})
				.then((stream) => {
					this.#STREAM = stream;
					this.#RECORDER = new MediaRecorder(this.#STREAM);
					this.#AUDIOCTX = new AudioContext();
					this.#SOURCE = this.#AUDIOCTX.createMediaStreamSource(this.#STREAM);
					this.#ANALYZER = this.#AUDIOCTX.createAnalyser();
					this.#ANALYZER.maxdecibels = -30;
					this.#ANALYZER.mindecibels = -100;
					this.#ANALYZER.fftSize = 2048;
					this.#SOURCE.connect(this.#ANALYZER);
					this.#micOutput = new Float32Array(this.#ANALYZER.fftSize);
					this.post("enable-success", { handler: this });
					this.start();
				})
				.catch((err) => {
					this.post("enable-fail", { handler: this, err: err });
				});
		});
		this.addHandler("disable", data => {
			if (this.has()) {
				this.stop();
				this.#STREAM.getAudioTracks()[0].stop();
				this.#AUDIOCTX.close();
				this.#STREAM = null;
				this.#RECORDER = null;
				this.#AUDIOCTX = null;
				this.#SOURCE = null;
				this.#ANALYZER = null;
			}
			this.post("disable-success", { handler: this });
		});
		this.addHandler("update", data => {
			if (this.started) {
				this.#ANALYZER.getFloatTimeDomainData(this.#micOutput);
				this.#output = analyzer.getDataFromBuffer(this.#micOutput, this.#AUDIOCTX.sampleRate);
			}
		});
	}

	has() { return !!this.#RECORDER; }

	get started() { return this.enabled && this.has() && this.#RECORDER.state == "recording"; }
	get stopped() { return !this.started; }
	start() {
		if (!this.has()) return;
		if (this.started) return;
		this.#RECORDER.start();
	}
	stop() {
		if (!this.has()) return;
		if (this.stopped) return;
		this.#RECORDER.stop();
	}

	get micOutput() { return this.#micOutput; }
	get output() { return this.#output; }
}

export class GameHandler extends Handler {
	#level;

	#notes;

	#assembled;

	#startTime;
	
	constructor(app) {
		super(app);

		this.#level = null;

		this.#notes = [];
		
		this.#assembled = false;

		this.#startTime = null;
	}

	get level() { return this.#level; }
	set level(v) {
		v = (v instanceof Level) ? v : null;
		if (this.level == v) return;
		this.#level = v;
		this.check();
	}
	hasLevel() { return this.level instanceof Level; }

	get assembled() { return this.#assembled; }

	assemble() {
		if (this.disabled) return;
		if (!this.hasLevel()) return;
		this.#assembled = true;
		
		this.notes = [];
	}
	disassemble() {
		this.#assembled = false;
		
		this.notes = [];
	}
	start() {
		if (!this.assembled) return;
		if (this.started) return;
		this.#startTime = util.getTime();
	}
	stop() {
		this.#startTime = null;
	}
	get started() { return util.is(this.startTime, "num"); }
	get startTime() { return this.#startTime; }
	get time() { return this.started ? util.getTime()-this.startTime : null; }
	get timePerBeat() { return (this.hasLevel() && this.level.hasSong()) ? (6000 / this.level.song.tempo) : null; }
	get beat() { return (this.hasLevel() && this.level.hasSong() && this.started) ? (this.time/this.timePerBeat)-(this.countdown*this.level.song.timeSig.top) : null; }
	get beatIndex() { return (this.beat == null) ? null : Math.floor(this.beat); }

	get notes() { return [...this.#notes]; }
	set notes(v) {
		v = util.is(v, "arr") ? Array.from(v) : [];
		this.notes.forEach(note => this.remNote(note));
		v.forEach(note => this.addNote(note));
	}
	addNote(note) {
		if (!(note instanceof GameHandler.Note)) return false;
		if (note.hasHandler()) return false;
		if (this.hasNote(note)) return false;
		this.#notes.push(note);
		note.handler = this;
		return note;
	}
	remNote(note) {
		if (!(note instanceof GameHandler.Note)) return false;
		if (!this.hasNote(note)) return false;
		this.#notes.splice(this.#notes.indexOf(note), 1);
		note.handler = null;
		return note;
	}
	hasNote(note) {
		if (!(note instanceof GameHandler.Note)) return false;
		if (note.handler != this) return false;
		return this.#notes.includes(note);
	}
}
GameHandler.Note = class GameHandlerNote extends Target {
	#note;
	
	constructor(note) {
		super(0, 0, 0, 0);
		
		this.#note = null;
		this.note = note;

		this.addHandler("update", data => {
		});
	}

	get note() { return this.#note; }
	set note(v) {
		v = (v instanceof Note) ? v : null;
		if (this.note == v) return;
		this.#note = v;
	}
	hasNote() { return this.note instanceof Note; }
}

export class SettingsHandler extends Handler {
	#values;
	#valueHooks;
	
	constructor(app) {
		super(app);
		
		this.#values = {};
		this.#valueHooks = {};
	}
	
	get values() { return Object.keys(this.#values); }
	set values(v) {
		v = util.ensure(v, "obj");
		this.clearValues();
		for (let name in v) this.addValue(name, v[name]);
	}
	clearValues() { this.#values = {}; return true; }
	hasValue(v) {
		if (v instanceof SettingsHandler.Value) return Object.values(this.#values).includes(v);
		if (util.is(v, "str")) return v in this.#values;
		return false;
	}
	getValue(name) {
		name = String(name);
		return this.#values[name];
	}
	addValue(name, v) {
		if (!(v instanceof SettingsHandler.Value)) return false;
		if (this.hasValue(name) || this.hasValue(v)) return false;
		this.#values[name] = v;
		this.#valueHooks[name] = {
			"type-change": data => this.post("type-change", { name: name, data: data }),
			"default-change": data => this.post("default-change", { name: name, data: data }),
			"change": data => this.post("change", { name: name, data: data }),
		};
		for (let e in this.#valueHooks[name]) this.#values[name].addHandler(e, this.#valueHooks[name][e]);
		return true;
	}
	remValue(v) {
		if (v instanceof SettingsHandler.Value) return this.remValue(Object.keys(this.#values)[Object.values(this.#values).indexOf(v)]);
		if (util.is(v, "str")) {
			if (!this.hasValue(v)) return false;
			for (let e in this.#valueHooks[name]) this.#values[name].remHandler(e, this.#valueHooks[name][e]);
			let value = this.#values[v];
			delete this.#values[v];
			delete this.#valueHooks[v];
			return value;
		}
		return false;
	}
}
SettingsHandler.Value = class SettingsHandlerValue extends Target {
	#type;
	#default;
	#value;
	#validate;
	
	constructor(type, value) {
		super();
		
		this.#type = null;
		this.#default = null;
		this.#value = null;
		this.#validate = () => true;
		
		this.type = type;
		this.value = value;
	}
	
	get type() { return this.#type; }
	set type(v) {
		v = String(v).toLowerCase();
		if (!util.SUPPORTEDTYPES.includes(v)) return;
		if (["arr", "obj", "func"].includes(v)) return;
		let from = this.type, to = v;
		this.#type = to;
		this.post("type-change", { from: from, to: to });
		this.default = this.default;
		this.value = this.value;
	}
	get default() { return this.#default; }
	set default(v) {
		v = util.ensure(v, this.type);
		if (!this.validate(v)) v = util.ensure(null, this.type);
		if (this.default == v) return;
		let from = this.default, to = v;
		this.#default = to;
		this.value = this.value;
		this.post("default-change", { from: from, to: to });
	}
	get value() { return this.#value; }
	set value(v) {
		v = util.is(v, this.type) ? v : this.default;
		if (!this.validate(v)) v = this.default;
		if (this.value == v) return;
		let from = this.value, to = v;
		this.#value = to;
		this.post("change", { from: from, to: to });
	}
	get validate() { return this.#validate; }
	set validate(v) {
		v = util.ensure(v, "func", () => true);
		if (this.validate == v) return;
		this.#validate = v;
		this.default = this.default;
		this.value = this.value;
	}
}

export class LSHandler extends Handler {
	constructor(app) {
		super(app);
	}

	get(k) { return localStorage.getItem(k); }
	set(k, v) { return localStorage.setItem(k, v); }
	rem(k) {
		let v = this.get(k);
		localStorage.removeItem(k);
		return v;
	}
	getAll() {
		let data = {};
		for (let i = 0; i < localStorage.length; i++)
			data[localStorage.key(i)] = this.get(localStorage.key(i));
		return data;
	}
	setAll(data) {
		data = util.ensure(data, "obj");
		this.remAll();
		for (let k in data)
			this.set(k, data[k]);
		return true;
	}
	remAll() {
		localStorage.clear();
		return true;
	}
	
	getAllLiked() {
		let data = null;
		try {
			data = JSON.parse(this.get("liked"));
		} catch (e) {}
		data = util.ensure(data, "arr");
		return data.map(id => String(id));
	}
	setAllLiked(data) {
		data = util.ensure(data, "arr").map(id => String(id));
		this.set("liked", JSON.stringify(data));
		return data;
	}
	getIsLiked(id) {
		id = String(id);
		return this.getAllLiked().includes(id);
	}
	setIsLiked(id, liked) {
		id = String(id);
		liked = !!liked;
		if (liked == this.getIsLiked(id)) return false;
		let data = this.getAllLiked();
		if (liked) data.push(id);
		else data.splice(data.indexOf(id), 1);
		this.setAllLiked(data);
		return true;
	}
	getAllStars() {
		let data = null;
		try {
			data = JSON.parse(this.get("stars"));
		} catch (e) {}
		data = util.ensure(data, "obj");
		for (let id in data) data[id] = Math.min(3, Math.max(0, util.ensure(data[id], "int")));
		for (let id in data) if (data[id] <= 0) delete data[id];
		return data;
	}
	setAllStars(data) {
		data = util.ensure(data, "obj");
		for (let id in data) data[id] = Math.min(3, Math.max(0, util.ensure(data[id], "int")));
		for (let id in data) if (data[id] <= 0) delete data[id];
		return this.set("stars", JSON.stringify(data));
	}
	getStars(id) {
		id = String(id);
		let data = this.getAllStars();
		return (id in data) ? data[id] : 0;
	}
	setStars(id, stars) {
		id = String(id);
		stars = Math.min(3, Math.max(0, util.ensure(stars, "int")));
		if (this.getStars(id) == stars) return false;
		let data = this.getAllStars();
		data[id] = stars;
		return this.setAllStars(data);
	}
	getSettings() {
		let data = null;
		try {
			data = JSON.parse(this.get("settings"));
		} catch (e) {}
		data = util.ensure(data, "obj");
		return data;
	}
	setSettings(data) {
		data = util.ensure(data, "obj");
		return this.set("settings", JSON.stringify(data));
	}
	getSetting(name) {
		name = String(name);
		let data = this.getSettings();
		return data[name];
	}
	setSetting(name, value) {
		name = String(name);
		let data = this.getSettings();
		data[name] = value;
		return this.setSettings(data);
	}
	hasSetting(name) {
		name = String(name);
		let data = this.getSettings();
		return name in data;
	}
	remSetting(name) {
		name = String(name);
		let data = this.getSettings();
		delete data[name];
		return this.setSettings(data);
	}
	getLanguage() { return this.get("lang"); }
	setLanguage(v) { return this.set("lang", v); }
}

export class AudioHandler extends Handler {
	#sounds;
	
	constructor(app) {
		super(app);
		
		this.#sounds = [];
	}
	
	get sounds() { return [...this.#sounds]; }
	set sounds(v) {
		v = util.ensure(v, "arr");
		this.clearSounds();
		v.forEach(v => this.addSound(v));
	}
}
AudioHandler.Sound = class AudioHandlerSound extends Target {
	constructor() {
		super();
	}
};

export class UIHandler extends Handler {
	#vars;
	#langMaps;
	
	#theme;
	#colors;
	#transition;
	#legacy;
	#page;
	#pages;
	#notifications;
	
	#eDynamicStyle;
	#eBannerStripe;
	#eTopNav;
	#eTopNavLoggedOut;
	#eTopNavLoggedIn;
	#eTopNavLoginBtn;
	#eTopNavJoinBtn;
	#eTopNavAccountBtn;
	#eTopNavAccountProfileBtn;
	#eTopNavAccountProjectsBtn;
	#eTopNavAccountMessagesBtn;
	#eTopNavAccountLogoutBtn;
	#eTopNavProjectsBtn;
	#eTopNavMessagesBtn;
	#eNotifications;
	#eBackground;
	#eCanvas;
	#eOverCanvas;
	#eLang;
	#eLangBtn;
	#eLangOptions;
	#eIntro;
	#eIntroPlanet;
	#eIntroRings;
	
	constructor(app) {
		super(app);
		
		this.#vars = {};
		this.#langMaps = {};
		
		this.#theme = null;
		this.#colors = {};
		this.#transition = null;
		this.#legacy = null;
		
		this.#page = null;
		this.#pages = {};
		let pages = [
			"TITLE",
			"LOGIN", "JOIN",
			"BROWSE",
			"SETTINGS",
			"TUNER",
			"GAME",
		];
		pages.forEach(name => { this.#pages[name] = null; });
		this.#notifications = [];
		
		this.addHandler("setup", data => {
			this.#eDynamicStyle = document.getElementById("dynamicstyle");
			this.#eBannerStripe = document.getElementById("bannerstripe");
			this.#eTopNav = document.getElementById("topnav");
			if (this.hasTopNav()) {
				this.#eTopNavLoggedOut = this.eTopNav.querySelector(":scope > div.loggedout");
				this.#eTopNavLoggedIn = this.eTopNav.querySelector(":scope > div.loggedin");
				this.#eTopNavLoginBtn = this.eTopNav.querySelector(":scope > div.loggedin");
			}
			this.#eTopNavLoginBtn = document.getElementById("loginbtn");
			this.#eTopNavJoinBtn = document.getElementById("joinbtn");
			this.#eTopNavAccountBtn = document.getElementById("accountbtn");
			this.#eTopNavAccountProfileBtn = document.getElementById("accountprofilebtn");
			this.#eTopNavAccountProjectsBtn = document.getElementById("accountprojectsbtn");
			this.#eTopNavAccountMessagesBtn = document.getElementById("accountmessagesbtn");
			this.#eTopNavAccountLogoutBtn = document.getElementById("accountlogoutbtn");
			this.#eTopNavProjectsBtn = document.getElementById("projectsbtn");
			this.#eTopNavMessagesBtn = document.getElementById("messagesbtn");
			if (this.hasTopNav()) {
				if (this.hasTopNavLoginBtn())
					this.eTopNavLoginBtn.addEventListener("click", e => {
						this.post("topnav-login", { e: e });
					});
				if (this.hasTopNavJoinBtn())
					this.eTopNavJoinBtn.addEventListener("click", e => {
						this.post("topnav-join", { e: e });
					});
				if (this.hasTopNavAccountBtn())
					this.eTopNavAccountBtn.addEventListener("click", e => {
						this.post("topnav-account", { e: e });
						if (this.eTopNavAccountBtn.parentElement instanceof HTMLDivElement) {
							let parent = this.eTopNavAccountBtn.parentElement;
							if (parent.classList.contains("this")) parent.classList.remove("this");
							else parent.classList.add("this");
						}
					});
				if (this.hasTopNavAccountProfileBtn())
					this.eTopNavAccountProfileBtn.addEventListener("click", e => {
						this.post("topnav-profile", { e: e });
					});
				if (this.hasTopNavAccountProjectsBtn())
					this.eTopNavAccountProjectsBtn.addEventListener("click", e => {
						this.post("topnav-projects", { e: e });
					});
				if (this.hasTopNavAccountMessagesBtn())
					this.eTopNavAccountMessagesBtn.addEventListener("click", e => {
						this.post("topnav-messages", { e: e });
					});
				if (this.hasTopNavAccountLogoutBtn())
					this.eTopNavAccountMessagesBtn.addEventListener("click", e => {
						this.post("topnav-logout", { e: e });
					});
				if (this.hasTopNavProjectsBtn())
					this.eTopNavProjectsBtn.addEventListener("click", e => {
						this.post("topnav-projects", { e: e });
					});
				if (this.hasTopNavMessagesBtn())
					this.eTopNavMessagesBtn.addEventListener("click", e => {
						this.post("topnav-messages", { e: e });
					});
			}
			this.#eNotifications = document.getElementById("NOTIFICATIONS");
			this.#eBackground = document.querySelector("#background");
			if (this.hasBackground()) {
				this.#eCanvas = this.eBackground.querySelector(":scope > .outer > #canvas");
				this.#eOverCanvas = this.eBackground.querySelector(":scope > #over");
			}
			this.#eLang = document.getElementById("lang");
			if (this.hasLang()) {
				this.#eLangBtn = this.eLang.querySelector(":scope > button");
				this.#eLangOptions = this.eLang.querySelector(":scope > .options");
			}
			if (this.hasLang()) {
				if (this.hasLangBtn())
					this.eLangBtn.addEventListener("click", e => {
						e.stopPropagation();
						if (this.eLang.classList.contains("this")) this.eLang.classList.remove("this");
						else this.eLang.classList.add("this");
					});
				if (this.hasLangOptions()) {
					let options = Array.from(this.eLangOptions.querySelectorAll(":scope > button"));
					options.forEach(option => option.addEventListener("click", e => {
						this.setLanguage(option.getAttribute("name"));
					}));
				}
				document.body.addEventListener("click", e => this.eLang.classList.remove("this"));
			}
			this.#eIntro = document.getElementById("intro");
			if (this.hasIntro()) {
				this.#eIntroRings = Array.from(this.eIntro.querySelectorAll(":scope > .ring"));
				this.#eIntroPlanet = Array.from(this.eIntro.querySelector(":scope > .planet"));
			}
			
			for (let name in this.#pages)
				this.#pages[name] = document.getElementById(name+"PAGE");
			this.hookPages();
			
			this.theme = "light";
			this.transition = 0.25;
			this.legacy = false;
			
			this.notifications = [];
			
			this.setLanguage("en");
		});
		
		let down = false;
		document.body.addEventListener("mousedown", () => { down = true; });
		document.body.addEventListener("mouseup", () => { down = false; });
		let mouse = { x: 0, y: 0 };
		document.body.addEventListener("mousemove", e => {
			mouse.x = e.pageX;
			mouse.y = e.pageY;
		});
		
		let ctx = null, overctx = null;
		
		let nodes = [], verts = [], self = this;
		for (let i = 0; i < 20; i++) {
			nodes.push({
				d: Math.random(),
				s: Math.random(),
				r: Math.random(),
				c: {
					x: Math.random(),
					y: Math.random(),
				},
				o: { x: 0, y: 0 },
				v: { x: 0, y: 0 },
				get: function(w, h) {
					let wh = (w+h) / 2;
					let r = wh*util.lerp(0.05, 0.1, this.r);
					let d = this.d*2*Math.PI;
					return {
						x: this.c.x*w + r*Math.cos(d) + this.o.x,
						y: this.c.y*h + r*Math.sin(d) + this.o.y,
					};
				},
				update: function(w, h) {
					this.d += (self.transition > 0) ? 10/util.lerp(30000, 60000, this.s) * (0.25/self.transition) : 0;
					if (down && self.transition > 0) {
						let p = this.get(w, h);
						let r = { x: mouse.x-p.x, y: mouse.y-p.y };
						let dir = Math.atan2(r.y, r.x);
						let dist = Math.sqrt(r.x**2 + r.y**2);
						let mag = 25 / Math.max(1, dist);
						this.v.x -= mag * Math.cos(dir);
						this.v.y -= mag * Math.sin(dir);
					}
					this.v.x += 0.01 * (0 - this.o.x);
					this.v.y += 0.01 * (0 - this.o.y);
					this.v.x *= 0.95;
					this.v.y *= 0.95;
					this.o.x += this.v.x;
					this.o.y += this.v.y;
				},
			});
			verts.push({
				x: Math.random(),
				y: Math.random(),
				d: Math.random(),
				s: Math.random(),
				r: Math.random(),
				get: function(w, h) {
					let wh = (w+h) / 2;
					let rel = [
						[+1, +1], [0, +1], [-1, +1],
						[+1,  0], [0,  0], [-1,  0],
						[+1, -1], [0, -1], [-1, -1],
					];
					return rel.map(r => { return {
						x: (this.x+r[0])*w,
						y: (this.y+r[1])*h,
						r: wh*util.lerp(0.025, 0.15, this.r),
					}; });
				},
				update: function() {
					let d = Math.PI*(0.1*util.lerp(-1, +1, this.d)+0.5);
					let s = util.lerp(0.0001, 0.001, this.s);
					s *= (self.transition > 0) ? (0.25/self.transition) : 0;
					this.x += s * Math.cos(d);
					this.y -= s * Math.sin(d);
					this.x = ((this.x%1)+1)%1;
					this.y = ((this.y%1)+1)%1;
				},
			});
		}
		
		let voronoi = new Voronoi();
		let diagram = voronoi.compute(
			nodes.map(node => node.get(1, 1)),
			{
				xl: 0, xr: 1,
				yt: 0, yb: 1,
			},
		);
		
		let w0 = 0, w1 = 0, time = 0;
		this.addHandler("update", data => {
			let animt = document.documentElement.style.getPropertyValue("--t");
			animt = util.ensure(parseFloat(animt.substr(0, animt.length-1)), "num")*1000;
			let wg = this.hasPage() ? this.getPage().getWidth() : 0;
			let t = Math.min(1, Math.max(0, (util.getTime()-time)/animt));
			t = -(Math.cos(Math.PI * t) - 1) / 2;;
			let w = util.lerp(w0, w1, t);
			if (wg != w1) {
				[w0, w1] = [w, wg];
				time = util.getTime();
			}
			if (this.hasBannerStripe()) this.eBannerStripe.style.width = w+"px";
			this.notifications.forEach(notif => notif.update());
			for (let name in this.#pages) {
				let pg = this.#pages[name];
				if (!(pg instanceof HTMLDivElement)) continue;
				pg.update();
			}
			if (ctx == null) {
				if (this.hasCanvas()) ctx = this.eCanvas.getContext("2d");
			} else {
				if (!this.hasCanvas()) ctx = null;
				else if (0) {
					let size = 50;
					if (ctx.canvas.width != window.innerWidth) ctx.canvas.width = window.innerWidth;
					if (ctx.canvas.height != window.innerWidth) ctx.canvas.height = window.innerHeight;
					ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
					ctx.fillStyle = "#fff";
					ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
					ctx.fillStyle = ctx.strokeStyle = "#000";
					ctx.lineWidth = 10;
					ctx.lineJoin = ctx.lineCap = "round";
					let w = Math.ceil(ctx.canvas.width/(size*1))+10;
					let h = Math.ceil(ctx.canvas.height/(size*Math.sqrt(3)/2))+10;
					for (let x = 0; x <= w; x++) {
						for (let y = 0; y <= h; y++) {
							let rx = x - w/2;
							let ry = y - h/2;
							let tx = rx*(size*1) + ((ry%2)*(size/2)) + ctx.canvas.width/2;
							let ty = ry*(size*Math.sqrt(3)/2) + ctx.canvas.height/2;
							ctx.beginPath();
							let dir = Math.atan2(mouse.y-ty, mouse.x-tx);
							let dist = Math.sqrt((mouse.x-tx)**2 + (mouse.y-ty)**2);
							let magbase = 10/Math.max(1, dist/100);
							tx -= magbase*Math.cos(dir);
							ty -= magbase*Math.sin(dir);
							let magtip = 25/Math.max(1, dist/100);
							ctx.moveTo(tx, ty);
							ctx.lineTo(
								tx - magtip*Math.cos(dir),
								ty - magtip*Math.sin(dir),
							);
							ctx.stroke();
						}
					}
				} else if (!this.legacy || 1) {
					if (ctx.canvas.width != window.innerWidth) ctx.canvas.width = window.innerWidth;
					if (ctx.canvas.height != window.innerWidth) ctx.canvas.height = window.innerHeight;
					nodes.forEach(node => node.update(ctx.canvas.width, ctx.canvas.height));
					voronoi.recycle(diagram);
					diagram = voronoi.compute(
						nodes.map(node => node.get(ctx.canvas.width, ctx.canvas.height)),
						{
							xl: 0, xr: ctx.canvas.width,
							yt: 0, yb: ctx.canvas.height,
						},
					);
					ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
					ctx.fillStyle = "#fff";
					ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
					ctx.fillStyle = ctx.strokeStyle = "#000";
					ctx.lineWidth = 30;
					ctx.lineJoin = ctx.lineCap = "round";
					diagram.edges.forEach(edge => {
						let va = edge.va, vb = edge.vb;
						ctx.beginPath();
						ctx.moveTo(va.x, va.y);
						ctx.lineTo(vb.x, vb.y);
						ctx.stroke();
					});
				} else if (1) {
					if (ctx.canvas.width != window.innerWidth) ctx.canvas.width = window.innerWidth;
					if (ctx.canvas.height != window.innerWidth) ctx.canvas.height = window.innerHeight;
					verts.forEach(vert => vert.update());
					ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
					ctx.fillStyle = "#fff";
					ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
					ctx.fillStyle = ctx.strokeStyle = "#000";
					verts.forEach(vert => {
						let cs = vert.get(ctx.canvas.width, ctx.canvas.height);
						cs.forEach(c => {
							ctx.beginPath();
							ctx.arc(c.x, c.y, c.r, 0, 2*Math.PI);
							ctx.fill();
						});
					});
				}
			}
			if (overctx == null) {
				if (this.hasOverCanvas()) overctx = this.eOverCanvas.getContext("2d");
			} else {
				if (!this.hasOverCanvas()) overctx = null;
				else if (0) {
					if (overctx.canvas.width != window.innerWidth) overctx.canvas.width = window.innerWidth;
					if (overctx.canvas.height != window.innerWidth) overctx.canvas.height = window.innerHeight;
					overctx.clearRect(0, 0, overctx.canvas.width, overctx.canvas.height);
					"roygbp".split("").forEach((c, x) => {
						for (let i = 0; i < 6; i++) {
							let rgb = this.getColor("c"+c+i);
							overctx.fillStyle = "rgb("+rgb.join(",")+")";
							overctx.fillRect(
								x*30, i*30,
								30, 30,
							);
						}
					});
				} else if (0) {
					if (overctx.canvas.width != window.innerWidth) overctx.canvas.width = window.innerWidth;
					if (overctx.canvas.height != window.innerWidth) overctx.canvas.height = window.innerHeight;
					overctx.clearRect(0, 0, overctx.canvas.width, overctx.canvas.height);
					overctx.fillStyle = "#f00";
					nodes.forEach(node => {
						let p = node.get(overctx.canvas.width, overctx.canvas.height);
						overctx.beginPath();
						overctx.arc(p.x, p.y, 5, 0, 2*Math.PI);
						overctx.fill();
					});
				}
			}
		});
	}
	
	get vars() { return Object.keys(this.#vars); }
	set vars(v) {
		v = util.ensure(v, "obj");
		this.clearVars();
		for (let k in v) this.addVar(k, v);
	}
	clearVars() {
		this.vars.forEach(k => this.remVar(k));
		return true;
	}
	hasVar(k) {
		k = String(k);
		return k in this.#vars;
	}
	remVar(k) {
		k = String(k);
		if (!this.hasVar(k)) return false;
		let v = this.getVar(k);
		delete this.#vars[k];
		this.pushVars();
		return v;
	}
	getVar(k) {
		k = String(k);
		return this.#vars[k];
	}
	setVar(k, v) {
		k = String(k);
		if (this.#vars[k] == v) return true;
		this.#vars[k] = v;
		this.pushVars();
		return true;
	}
	pushVars() {
		const replace = text => {
			text = String(text);
			while (1) {
				let match = text.match(/%(.*?)%/);
				if (match == null) break;
				let k = match[0].substr(1, match[0].length-2);
				let rep = this.hasVar(k) ? String(this.getVar(k)) : k;
				text = text.substr(0, match.index) + rep + text.substr(match.index+match[0].length);
			}
			return text;
		};
		const set = node => {
			if (node instanceof HTMLElement) {
				Array.from(node.attributes).forEach(attr => {
					if (["id", "class", "name", "src", "href"].includes(attr.name)) return;
					if (attr.name.startsWith("aria-")) return;
					if (!attr.replaced) {
						attr.replaced = true;
						attr.originalValue = attr.value;
					}
					attr.value = replace(attr.originalValue);
				});
				Array.from(node.childNodes).forEach(node => set(node));
				return;
			}
			if (node instanceof Text) {
				if (!node.replaced) {
					node.replaced = true;
					node.originalTextContent = node.textContent;
				}
				node.textContent = replace(node.originalTextContent);
			}
		};
		set(document.body);
		return true;
	}
	
	setLanguageMaps(langs) {
		langs = util.ensure(langs, "obj");
		this.#langMaps = langs;
		return this.mapLanguage();
	}
	hasLanguageMap(lang) {
		lang = String(lang);
		return lang in this.#langMaps;
	}
	setLanguage(lang) {
		lang = String(lang);
		if (!this.hasLanguageMap(lang)) return false;
		if (document.documentElement.getAttribute("lang") == lang) return true;
		document.documentElement.setAttribute("lang", lang);
		this.post("language-set", { lang: lang });
		return this.mapLanguage();
	}
	mapLanguage() {
		let langmap, path;
		langmap = util.ensure(this.#langMaps["en"], "obj");
		path = [];
		const rem = o => {
			if (util.is(o, "obj")) {
				for (let k in o) {
					path.push(k);
					rem(o[k]);
					path.pop();
				}
				return;
			}
			if (util.is(o, "str"))
				this.remVar(path.join("."));
		};
		rem(langmap);
		let lang = document.documentElement.getAttribute("lang");
		lang = this.hasLanguageMap(lang) ? lang : "en";
		langmap = util.ensure(this.#langMaps[lang], "obj");
		path = [];
		const set = o => {
			if (util.is(o, "obj")) {
				for (let k in o) {
					path.push(k);
					set(o[k]);
					path.pop();
				}
				return;
			}
			if (util.is(o, "str"))
				this.setVar(path.join("."), o);
		};
		set(langmap);
		if (this.hasLangBtn()) {
			let value = this.eLangBtn.children[1];
			if (value instanceof HTMLSpanElement) value.textContent = lang.toUpperCase();
		}
		if (this.hasLangOptions()) {
			let options = Array.from(this.eLangOptions.querySelectorAll(":scope > button"));
			options.forEach(option => {
				if (option.getAttribute("name") == lang) option.classList.add("this");
				else option.classList.remove("this");
			});
		}
		this.post("language-map", { lang: lang });
		return true;
	}
	
	get eDynamicStyle() { return this.#eDynamicStyle; }
	hasDynamicStyle() { return this.eDynamicStyle instanceof HTMLStyleElement; }
	get eNotifications() { return this.#eNotifications; }
	hasNotifications() { return this.eNotifications instanceof HTMLDivElement; }
	get eBannerStripe() { return this.#eBannerStripe; }
	hasBannerStripe() { return this.eBannerStripe instanceof HTMLDivElement; }
	get eTopNav() { return this.#eTopNav; }
	hasTopNav() { return this.eTopNav instanceof HTMLDivElement; }
	get eTopNavLoggedOut() { return this.#eTopNavLoggedOut; }
	hasTopNavLoggedOut() { return this.eTopNavLoggedOut instanceof HTMLDivElement; }
	get eTopNavLoggedIn() { return this.#eTopNavLoggedIn; }
	hasTopNavLoggedIn() { return this.eTopNavLoggedIn instanceof HTMLDivElement; }
	get eTopNavLoginBtn() { return this.#eTopNavLoginBtn; }
	hasTopNavLoginBtn() { return this.eTopNavLoginBtn instanceof HTMLButtonElement; }
	get eTopNavJoinBtn() { return this.#eTopNavJoinBtn; }
	hasTopNavJoinBtn() { return this.eTopNavJoinBtn instanceof HTMLButtonElement; }
	get eTopNavAccountBtn() { return this.#eTopNavAccountBtn; }
	hasTopNavAccountBtn() { return this.eTopNavAccountBtn instanceof HTMLButtonElement; }
	get eTopNavAccountProfileBtn() { return this.#eTopNavAccountProfileBtn; }
	hasTopNavAccountProfileBtn() { return this.eTopNavAccountProfileBtn instanceof HTMLButtonElement; }
	get eTopNavAccountProjectsBtn() { return this.#eTopNavAccountProjectsBtn; }
	hasTopNavAccountProjectsBtn() { return this.eTopNavAccountProjectsBtn instanceof HTMLButtonElement; }
	get eTopNavAccountMessagesBtn() { return this.#eTopNavAccountMessagesBtn; }
	hasTopNavAccountMessagesBtn() { return this.eTopNavAccountMessagesBtn instanceof HTMLButtonElement; }
	get eTopNavAccountLogoutBtn() { return this.#eTopNavAccountLogoutBtn; }
	hasTopNavAccountLogoutBtn() { return this.eTopNavAccountLogoutBtn instanceof HTMLButtonElement; }
	get eTopNavProjectsBtn() { return this.#eTopNavProjectsBtn; }
	hasTopNavProjectsBtn() { return this.eTopNavProjectsBtn instanceof HTMLButtonElement; }
	get eTopNavMessagesBtn() { return this.#eTopNavMessagesBtn; }
	hasTopNavMessagesBtn() { return this.eTopNavMessagesBtn instanceof HTMLButtonElement; }
	get eBackground() { return this.#eBackground; }
	hasBackground() { return this.eBackground instanceof HTMLDivElement; }
	get eCanvas() { return this.#eCanvas; }
	hasCanvas() { return this.eCanvas instanceof HTMLCanvasElement; }
	get eOverCanvas() { return this.#eOverCanvas; }
	hasOverCanvas() { return this.eOverCanvas instanceof HTMLCanvasElement; }
	get eLang() { return this.#eLang; }
	hasLang() { return this.eLang instanceof HTMLDivElement; }
	get eLangBtn() { return this.#eLangBtn; }
	hasLangBtn() { return this.eLangBtn instanceof HTMLButtonElement; }
	get eLangOptions() { return this.#eLangOptions; }
	hasLangOptions() { return this.eLangOptions instanceof HTMLDivElement; }
	get eIntro() { return this.#eIntro; }
	hasIntro() { return this.eIntro instanceof HTMLDivElement; }
	get eIntroRings() { return [...this.#eIntroRings]; }
	get eIntroPlanet() { return this.#eIntroPlanet; }
	hasIntroPlanet() { return this.eIntroPlanet instanceof HTMLDivElement; }
	
	get theme() { return this.#theme; }
	set theme(v) {
		v = String(v);
		if (this.theme == v) return;
		this.#theme = v;
		this.clearColors();
		let style = {};
		let stylefs = {
			light: () => {
				let colors = {
					r: [
						[56, 1, 19],
						[130, 20, 51],
						[181, 37, 78],
						[234, 51, 99],
						[245, 190, 212],
						[255, 255, 255],
					],
					o: [
						[48, 29, 5],
						[145, 79, 22],
						[209, 127, 45],
						[241, 160, 57],
						[249, 221, 164],
						[255, 255, 255],
					],
					y: [
						[49, 38, 6],
						[166, 122, 28],
						[213, 174, 58],
						[248, 216, 73],
						[253, 245, 202],
						[255, 255, 255],
					],
					g: [
						[30, 59, 21],
						[50, 150, 30],
						[118, 198, 75],
						[142, 239, 91],
						[224, 254, 202],
						[255, 255, 255],
					],
					b: [
						[7, 28, 46],
						[25, 71, 145],
						[44, 103, 170],
						[68, 152, 248],
						[174, 216, 251],
						[255, 255, 255],
					],
					p: [
						[26, 1, 49],
						[73, 9, 166],
						[109, 18, 245],
						[137, 82, 246],
						[187, 169, 249],
						[255, 255, 255],
					],
					m: [
						[25, 25, 25],
						[83, 83, 83],
						[124, 124, 124],
						[155, 155, 155],
						[202, 202, 202],
						[255, 255, 255],
					],
				};
				colors.mi = [...colors.m].reverse();
				let base = colors.p;
				let accent1 = colors.o;
				let accent2 = colors.r;
				for (let i = 0; i < base.length; i++) {
					this.addColor("v"+i, base[i]);
					for (let j = 0; j < 16; j++) {
						let a = j / 15;
						let hex = "0123456789abcdef"[j];
						style["v"+i+"-"+hex] = "rgba("+[...base[i], a].join(",")+")";
					}
					style["v"+i] = style["v"+i+"-f"];
				}
				this.addColor("v", base[3]);
				style["v"] = style["v3"];
				[accent1, accent2].forEach((accent, k) => {
					for (let i = 0; i <= accent.length; i++) {
						let normal = (i < accent.length);
						if (normal) this.addColor("a"+k+i, accent[i]);
						else this.addColor("a"+k, accent[3]);
						for (let j = 0; j < 16; j++) {
							let a = j / 15;
							let hex = "0123456789abcdef"[j];
							if (normal) style["a"+k+i+"-"+hex] = "rgba("+[...accent[i], a].join(",")+")";
							else style["a"+k+"-"+hex] = style["a"+k+"3-"+hex];
						}
						if (normal) style["a"+k+i] = style["a"+k+i+"-f"];
						else style["a"+k] = style["a"+k+"3"];
					}
				});
				for (let c in colors) {
					for (let i = 0; i <= colors[c].length; i++) {
						let normal = (i < colors[c].length);
						if (normal) this.addColor("c"+c+i, colors[c][i]);
						else this.addColor("c"+c, colors[c][3]);
						for (let j = 0; j < 16; j++) {
							let a = j / 15;
							let hex = "0123456789abcdef"[j];
							if (normal) style["c"+c+i+"-"+hex] = "rgba("+[...colors[c][i], a].join(",")+")";
							else style["c"+c+"-"+hex] = style["c"+c+"3-"+hex];
						}
						if (normal) style["c"+c+i] = style["c"+c+i+"-f"];
						else style["c"+c] = style["c"+c+"3"];
					}
				}
			},
		};
		if (this.theme in stylefs) stylefs[this.theme]();
		let stylestr = [];
		for (let k in style) stylestr.push("--"+k+":"+style[k]+";");
		stylestr = ":root{"+stylestr.join("")+"}";
		if (this.hasDynamicStyle()) this.eDynamicStyle.innerHTML = stylestr;
	}
	get colors() { return Object.keys(this.#colors); }
	set colors(v) {
		v = util.ensure(v, "obj");
		this.clearColors();
		for (let name in v) this.addColor(name, v);
	}
	clearColors() { this.colors.forEach(name => this.remColor(name)); return true; }
	hasColor(name) { return name in this.#colors; }
	getColor(name) {
		if (!this.hasColor(name)) return null;
		return [...this.#colors[name]];
	}
	addColor(name, color) {
		if (this.hasColor(name)) return false;
		color = [...util.ensure(color, "arr")];
		color = color.map(v => Math.min(255, Math.max(0, util.ensure(v, "num"))));
		while (color.length < 3) color.push(0);
		while (color.length > 3) color.pop();
		this.#colors[name] = color;
		return true;
	}
	remColor(name) {
		if (!this.hasColor(name)) return false;
		let color = this.getColor(name);
		delete this.#colors[name];
		return color;
	}
	
	get page() { return this.#page; }
	set page(v) { this.setPage(v); }
	setPage(name, data) {
		name = String(name);
		data = util.ensure(data, "obj");
		if (this.page == name) return false;
		this.pageFrom();
		this.#page = name;
		this.pageTo(data);
	}
	hookPages() {
		for (let name in this.#pages) {
			let pg = this.getPage(name);
			if (!(pg instanceof HTMLDivElement)) continue;
			pg.getWidth = () => ((inner => ((inner instanceof HTMLDivElement) ? inner.getBoundingClientRect().width : 0))(pg.querySelector(":scope > .inner")));
			pg.update = () => {};
			let pagefs = {
				TITLE: () => {
					let playbtn = pg.playbtn = document.getElementById("titleplaybtn");
					if (playbtn instanceof HTMLButtonElement)
						playbtn.addEventListener("click", e => {
							this.post("title-play", { e: e });
						});
					let tunerbtn = pg.tunerbtn = document.getElementById("titletunerbtn");
					if (tunerbtn instanceof HTMLButtonElement)
						tunerbtn.addEventListener("click", e => {
							this.post("title-tuner", { e: e });
						});
					let settingsbtn = pg.settingsbtn = document.getElementById("titlesettingsbtn");
					if (settingsbtn instanceof HTMLButtonElement)
						settingsbtn.addEventListener("click", e => {
							this.post("title-settings", { e: e });
						});
					let loggedout = pg.loggedout = pg.querySelector(":scope > .inner > .topnav > div.loggedout");
					let loggedin = pg.loggedin = pg.querySelector(":scope > .inner > .topnav > div.loggedin");
					pg.getLoggedOut = () => {
						if (!(loggedout instanceof HTMLDivElement)) return null;
						return loggedout.classList.contains("this");
					};
					pg.getLoggedIn = () => {
						if (!(loggedin instanceof HTMLDivElement)) return null;
						return loggedin.classList.contains("this");
					};
					pg.setLoggedOut = v => {
						if (loggedout instanceof HTMLDivElement) {
							if (v) loggedout.classList.add("this");
							else loggedout.classList.remove("this");
						}
						if (loggedin instanceof HTMLDivElement) {
							if (v) loggedin.classList.remove("this");
							else loggedin.classList.add("this");
						}
						return true;
					};
					pg.setLoggedIn = v => {
						if (loggedout instanceof HTMLDivElement) {
							if (v) loggedout.classList.remove("this");
							else loggedout.classList.add("this");
						}
						if (loggedin instanceof HTMLDivElement) {
							if (v) loggedin.classList.add("this");
							else loggedin.classList.remove("this");
						}
						return true;
					};
					let loginbtn = pg.loginbtn = document.getElementById("titleloginbtn");
					if (loginbtn instanceof HTMLButtonElement)
						loginbtn.addEventListener("click", e => {
							this.post("title-login", { e: e });
						});
					let joinbtn = pg.joinbtn = document.getElementById("titlejoinbtn");
					if (joinbtn instanceof HTMLButtonElement)
						joinbtn.addEventListener("click", e => {
							this.post("title-join", { e: e });
						});
					let accountbtn = pg.accountbtn = document.getElementById("titleaccountbtn");
					if (accountbtn instanceof HTMLButtonElement)
						accountbtn.addEventListener("click", e => {
							e.stopPropagation();
							this.post("title-account", { e: e });
							if (accountbtn.parentElement instanceof HTMLDivElement) {
								if (accountbtn.parentElement.classList.contains("this")) accountbtn.parentElement.classList.remove("this");
								else accountbtn.parentElement.classList.add("this");
							}
						});
					let username = pg.username = pg.querySelector(":scope > .inner > .topnav > div.loggedin > .account > #titleaccountbtn > span");
					pg.hasUsername = () => (username instanceof HTMLSpanElement);
					pg.getUsername = () => {
						if (!pg.hasUsername()) return null;
						return username.textContent;
					};
					pg.setUsername = v => {
						if (!pg.hasUsername()) return false;
						username.textContent = v;
						return true;
					};
					document.body.addEventListener("click", e => {
						if (accountbtn instanceof HTMLButtonElement)
							if (accountbtn.parentElement instanceof HTMLDivElement)
								accountbtn.parentElement.classList.remove("this");
					});
					let accountprofilebtn = pg.accountprofilebtn = document.getElementById("titleaccountprofilebtn");
					if (accountprofilebtn instanceof HTMLButtonElement)
						accountprofilebtn.addEventListener("click", e => {
							this.post("title-profile", { e: e });
						});
					let accountprojectsbtn = pg.accountprojectsbtn = document.getElementById("titleaccountprojectsbtn");
					if (accountprojectsbtn instanceof HTMLButtonElement)
						accountprojectsbtn.addEventListener("click", e => {
							this.post("title-projects", { e: e });
						});
					let accountmessagesbtn = pg.accountmessagesbtn = document.getElementById("titleaccountmessagesbtn");
					if (accountmessagesbtn instanceof HTMLButtonElement)
						accountmessagesbtn.addEventListener("click", e => {
							this.post("title-messages", { e: e });
						});
					let accountlogoutbtn = pg.accountlogoutbtn = document.getElementById("titleaccountlogoutbtn");
					if (accountlogoutbtn instanceof HTMLButtonElement)
						accountlogoutbtn.addEventListener("click", e => {
							this.post("title-logout", { e: e });
						});
					let projectsbtn = pg.projectsbtn = document.getElementById("titleprojectsbtn");
					if (projectsbtn instanceof HTMLButtonElement)
						projectsbtn.addEventListener("click", e => {
							this.post("title-projects", { e: e });
						});
					let messagesbtn = pg.messagesbtn = document.getElementById("titlemessagesbtn");
					if (messagesbtn instanceof HTMLButtonElement)
						messagesbtn.addEventListener("click", e => {
							this.post("title-messages", { e: e });
						});
				},
				LOGIN: () => {
					let backbtnsmall = pg.backbtnsmall = document.getElementById("loginbackbtnsmall");
					if (backbtnsmall instanceof HTMLButtonElement)
						backbtnsmall.addEventListener("click", e => {
							this.post("login-back", { e: e });
						});
					let newuser = pg.newuser = document.getElementById("loginnewuser");
					if (newuser instanceof HTMLAnchorElement)
						newuser.addEventListener("click", e => {
							e.preventDefault();
							this.post("login-join");
						});
					let userinputs = Array.from(pg.querySelectorAll(":scope > .inner > .content > .item > input[type='text']"));
					let passshown = true;
					let passinputs = Array.from(pg.querySelectorAll(":scope > .inner > .content > .item > input[type='password']"));
					pg.getPassShown = () => passshown;
					pg.getPassHidden = () => !pg.getPassShown();
					pg.setPassShown = v => {
						v = !!v;
						if (pg.getPassShown() == v) return true;
						passshown = v;
						passinputs.forEach(inp => { inp.type = (v ? "text" : "password"); });
						if (seebtn instanceof HTMLButtonElement)
							if (seebtn.children[0] instanceof HTMLElement)
								seebtn.children[0].setAttribute("name", (v ? "eye-off" : "eye"));
						return true;
					};
					pg.setPassHidden = v => pg.setPassShown(!v);
					pg.showPass = () => pg.setPassShown(true);
					pg.hidePass = () => pg.setPassHidden(true);
					let seebtn = pg.seebtn = pg.querySelector(":scope > .inner > .content > .item > div > button.see");
					if (seebtn instanceof HTMLButtonElement)
						seebtn.addEventListener("click", e => {
							pg.setPassShown(!pg.getPassShown());
						});
					pg.hidePass();
					[...userinputs, ...passinputs].forEach(inp => {
						inp.addEventListener("input", e => pg.changed());
					});
					let gobtn = pg.gobtn = document.getElementById("loginloginbtn");
					pg.changed = () => {
						if (!(gobtn instanceof HTMLButtonElement)) return;
						if (pg.getUsername() == null) return gobtn.disabled = true;
						if (pg.getPassword() == null) return gobtn.disabled = true;
						if (pg.getUsername().length <= 0) return gobtn.disabled = true;
						if (pg.getPassword().length <= 0) return gobtn.disabled = true;
						gobtn.disabled = false;
					};
					pg.getUsername = () => {
						if (!(userinputs[0] instanceof HTMLInputElement)) return null;
						return userinputs[0].value;
					};
					pg.setUsername = v => {
						if (!(userinputs[0] instanceof HTMLInputElement)) return false;
						userinputs[0].value = v;
						pg.changed();
						return true;
					};
					pg.getPassword = () => {
						if (!(passinputs[0] instanceof HTMLInputElement)) return null;
						return passinputs[0].value;
					};
					pg.setPassword = v => {
						if (!(passinputs[0] instanceof HTMLInputElement)) return false;
						passinputs[0].value = v;
						pg.changed();
						return true;
					};
					pg.setUsername("");
					pg.setPassword("");
				},
				JOIN: () => {
					let backbtnsmall = pg.backbtnsmall = document.getElementById("joinbackbtnsmall");
					if (backbtnsmall instanceof HTMLButtonElement)
						backbtnsmall.addEventListener("click", e => {
							this.post("join-back", { e: e });
						});
					let newuser = pg.newuser = document.getElementById("joinnewuser");
					if (newuser instanceof HTMLAnchorElement)
						newuser.addEventListener("click", e => {
							e.preventDefault();
							this.post("join-login");
						});
					let userinputs = Array.from(pg.querySelectorAll(":scope > .inner > .content > .item > input[type='text']"));
					let passshown = true;
					let passinputs = Array.from(pg.querySelectorAll(":scope > .inner > .content > .item > input[type='password']"));
					pg.getPassShown = () => passshown;
					pg.getPassHidden = () => !pg.getPassShown();
					pg.setPassShown = v => {
						v = !!v;
						if (pg.getPassShown() == v) return true;
						passshown = v;
						passinputs.forEach(inp => { inp.type = (v ? "text" : "password"); });
						if (seebtn instanceof HTMLButtonElement)
							if (seebtn.children[0] instanceof HTMLElement)
								seebtn.children[0].setAttribute("name", (v ? "eye-off" : "eye"));
						return true;
					};
					pg.setPassHidden = v => pg.setPassShown(!v);
					pg.showPass = () => pg.setPassShown(true);
					pg.hidePass = () => pg.setPassHidden(true);
					let seebtn = pg.seebtn = pg.querySelector(":scope > .inner > .content > .item > div > button.see");
					if (seebtn instanceof HTMLButtonElement)
						seebtn.addEventListener("click", e => {
							pg.setPassShown(!pg.getPassShown());
						});
					pg.hidePass();
					[...userinputs, ...passinputs].forEach(inp => {
						inp.addEventListener("input", e => pg.changed());
					});
					let gobtn = pg.gobtn = document.getElementById("joinjoinbtn");
					pg.changed = () => {
						if (
							passinputs[0] instanceof HTMLInputElement &&
							passinputs[1] instanceof HTMLInputElement
						) {
							passinputs[0].classList.remove("wrong");
							passinputs[1].classList.remove("wrong");
							passinputs[0].classList.remove("right");
							passinputs[1].classList.remove("right");
							if (
								pg.getPassword().length > 0 &&
								pg.getPasswordConf().length > 0 &&
								pg.getPassword() == pg.getPasswordConf()
							) {
								passinputs[0].classList.add("right");
								passinputs[1].classList.add("right");
							} else {
								passinputs[0].classList.add("wrong");
								passinputs[1].classList.add("wrong");
							}
						}
						if (!(gobtn instanceof HTMLButtonElement)) return;
						if (pg.getUsername() == null) return gobtn.disabled = true;
						if (pg.getPassword() == null) return gobtn.disabled = true;
						if (pg.getPasswordConf() == null) return gobtn.disabled = true;
						if (pg.getUsername().length <= 0) return gobtn.disabled = true;
						if (pg.getPassword().length <= 0) return gobtn.disabled = true;
						if (pg.getPasswordConf().length <= 0) return gobtn.disabled = true;
						if (pg.getPassword() != pg.getPasswordConf()) return gobtn.disabled = true;
						gobtn.disabled = false;
					};
					pg.getUsername = () => {
						if (!(userinputs[0] instanceof HTMLInputElement)) return null;
						return userinputs[0].value;
					};
					pg.setUsername = v => {
						if (!(userinputs[0] instanceof HTMLInputElement)) return false;
						userinputs[0].value = v;
						pg.changed();
						return true;
					};
					pg.getPassword = () => {
						if (!(passinputs[0] instanceof HTMLInputElement)) return null;
						return passinputs[0].value;
					};
					pg.setPassword = v => {
						if (!(passinputs[0] instanceof HTMLInputElement)) return false;
						passinputs[0].value = v;
						pg.changed();
						return true;
					};
					pg.getPasswordConf = () => {
						if (!(passinputs[1] instanceof HTMLInputElement)) return null;
						return passinputs[1].value;
					};
					pg.setPasswordConf = v => {
						if (!(passinputs[1] instanceof HTMLInputElement)) return false;
						passinputs[1].value = v;
						pg.changed();
						return true;
					};
					pg.setUsername("");
					pg.setPassword("");
					pg.setPasswordConf("");
				},
				BROWSE: () => {
					let backbtn = pg.backbtn = document.getElementById("browsebackbtn");
					if (backbtn instanceof HTMLButtonElement)
						backbtn.addEventListener("click", e => {
							this.post("browse-back", { e: e });
						});
					let backbtnsmall = pg.backbtnsmall = document.getElementById("browsebackbtnsmall");
					if (backbtnsmall instanceof HTMLButtonElement)
						backbtnsmall.addEventListener("click", e => {
							this.post("browse-back", { e: e });
						});
					let wifi = pg.wifi = document.getElementById("browsewifistatus");
					let wifiicon = wifi.children[0];
					pg.getWifiStatus = () => {
						if (!(wifiicon instanceof HTMLElement)) return null;
						return wifiicon.getAttribute("name") == "cloud";
					};
					pg.setWifiStatus = v => {
						if (!(wifiicon instanceof HTMLElement)) return false;
						wifiicon.setAttribute("name", v ? "cloud" : "cloud-offline");
						return true;
					};
					pg.setWifiStatus(true);
					let playbtn = pg.playbtn = document.getElementById("browseplaybtn");
					if (playbtn instanceof HTMLButtonElement)
						playbtn.addEventListener("click", e => {
							this.post("browse-play", { e: e });	
						});
					pg.hasPlay = () => (playbtn instanceof HTMLButtonElement);
					pg.isPlayDisabled = () => (pg.hasPlay() && playbtn.disabled);
					pg.isPlayEnabled = () => (pg.hasPlay() && !playbtn.disabled);
					pg.disablePlay = () => { if (pg.hasPlay()) playbtn.disabled = true; };
					pg.enablePlay = () => { if (pg.hasPlay()) playbtn.disabled = false; };
					let errordisplay = pg.errordisplay = pg.querySelector(":scope > .inner > .content > .inner > .error");
					pg.hasErrorDisplay = () => (errordisplay instanceof HTMLDivElement);
					pg.isErrorDisplayShown = () => (pg.hasErrorDisplay() ? errordisplay.style.display == "" : false);
					pg.isErrorDisplayHidden = () => (pg.hasErrorDisplay() ? errordisplay.style.display == "none" : false);
					pg.showErrorDisplay = () => {
						if (!pg.hasErrorDisplay()) return false;
						errordisplay.style.display = "";
						return true;
					};
					pg.hideErrorDisplay = () => {
						if (!pg.hasErrorDisplay()) return false;
						errordisplay.style.display = "none";
						return true;
					};
					let errorinfo = pg.errorinfo = pg.querySelector(":scope > .inner > .content > .inner > .error > .info");
					pg.hasErrorInfo = () => (errorinfo instanceof HTMLDivElement);
					pg.getErrorInfo = () => (pg.hasErrorInfo() ? errorinfo.textContent : null);
					pg.setErrorInfo = v => {
						if (!pg.hasErrorInfo()) return false;
						errorinfo.textContent = v;
						this.pushVars();
						return true;
					};
					let retrybtn = pg.retrybtn = document.getElementById("browseretrybtn");
					if (retrybtn instanceof HTMLButtonElement)
						retrybtn.addEventListener("click", e => {
							this.post("browse-retry", { e: e });	
						});
					let loadingdisplay = pg.loadingdisplay = pg.querySelector(":scope > .inner > .content > .inner > .loading");
					pg.hasLoadingDisplay = () => (loadingdisplay instanceof HTMLDivElement);
					pg.isLoadingDisplayShown = () => (pg.hasLoadingDisplay() ? loadingdisplay.style.display == "" : false);
					pg.isLoadingDisplayHidden = () => (pg.hasLoadingDisplay() ? loadingdisplay.style.display == "none" : false);
					pg.showLoadingDisplay = () => {
						if (!pg.hasLoadingDisplay()) return false;
						loadingdisplay.style.display = "";
						return true;
					};
					pg.hideLoadingDisplay = () => {
						if (!pg.hasLoadingDisplay()) return false;
						loadingdisplay.style.display = "none";
						return true;
					};
					let levelslist = document.getElementById("levelslist");
					pg.hasLevelsList = () => (levelslist instanceof HTMLDivElement);
					let levels = [];
					let levelhooks = [];
					pg.getLevels = () => [...levels];
					pg.setLevels = (v, sort=null, filter=null) => {
						pg.clearLevels();
						v = util.ensure(v, "obj");
						let ks = Object.keys(v);
						if (util.is(sort, "func")) ks.sort(sort);
						if (util.is(filter, "func")) ks = ks.filter(filter);
						ks.forEach(k => pg.addLevel(v[k]));
						return true;
					};
					pg.clearLevels = () => {
						pg.getLevels().forEach(level => pg.remLevel(level));
						return true;
					};
					pg.hasLevel = v => {
						if (!(v instanceof UIHandler.Level)) return false;
						return levels.includes(v);
					};
					pg.addLevel = v => {
						if (!(v instanceof UIHandler.Level)) return false;
						if (pg.hasLevel(v)) return false;
						let hooks = {
							click: () => this.post("browse-level-click", { id: v.id }),
							play: () => this.post("browse-level-play", { id: v.id }),
							like: () => this.post("browse-level-like", { id: v.id }),
						};
						levels.push(v);
						levelhooks.push(hooks);
						for (let e in hooks) v.addHandler(e, hooks[e]);
						if (pg.hasLevelsList()) levelslist.appendChild(v.elem);
						return true;
					};
					pg.remLevel = v => {
						if (!(v instanceof UIHandler.Level)) return false;
						if (!pg.hasLevel(v)) return false;
						let hooks = levelhooks[levels.indexOf(v)];
						for (let e in hooks) v.remHandler(e, hooks[e]);
						levelhooks.splice(levels.indexOf(v), 1);
						levels.splice(levels.indexOf(v), 1);
						if (pg.hasLevelsList()) levelslist.removeChild(v.elem);
						return true;
					};
					pg.update = v => {
						levels.forEach(level => level.update());	
					};
				},
				SETTINGS: () => {
					let backbtnsmall = pg.backbtnsmall = document.getElementById("settingsbackbtnsmall");
					if (backbtnsmall instanceof HTMLButtonElement)
						backbtnsmall.addEventListener("click", e => {
							this.post("settings-back", { e: e });
						});
					let values = {};
					let valuehooks = {};
					pg.getValues = () => Object.keys(values);
					pg.clearValues = () => {
						Object.keys(values).forEach(name => pg.remValue(name));
						return true;
					};
					pg.hasValue = v => {
						if (v instanceof UIHandler.SettingsValue) return Object.values(values).includes(v);
						if (util.is(v, "str")) return v in values;
						return false;
					};
					pg.getValue = name => values[name];
					pg.addValue = (name, v) => {
						if (pg.hasValue(name) || pg.hasValue(v)) return false;
						values[name] = v;
						valuehooks[name] = {
							"change": data => {
								this.post("settings-change", { name: name, data: data });	
							},
						};
						for (let e in valuehooks[name])
							values[name].addHandler(e, valuehooks[name][e]);
						return true;
					};
					pg.remValue = v => {
						if (v instanceof UIHandler.SettingsValue) return pg.remValue(Object.keys(values)[Object.values(values).indexOf(v)]);
						if (util.is(v, "str")) {
							if (!pg.hasValue(v)) return false;
							for (let e in valuehooks[v])
								values[v].remHandler(e, valuehooks[v][e]);
							let value = values[v];
							delete values[v];
							delete valuehooks[v];
							return value;
						}
						return false;
					};
					pg.setValue = (name, v) => {
						if (!pg.hasValue(name)) return false;
						pg.getValue(name).post("set", { v: v });
						return true;
					};
				},
				TUNER: () => {
					let backbtnsmall = pg.backbtnsmall = document.getElementById("tunerbackbtnsmall");
					if (backbtnsmall instanceof HTMLButtonElement)
						backbtnsmall.addEventListener("click", e => {
							this.post("tuner-back", { e: e });
						});
					let bubble = pg.bubble = pg.querySelector(":scope > .inner > .display > .bubble");
					pg.hasBubble = () => (bubble instanceof HTMLDivElement);
					let bubblecircle = pg.bubblcircle = pg.querySelector(":scope > .inner > .display > .bubble > div");
					let bubblesize = 1;
					pg.getBubbleSize = () => bubblesize;
					pg.setBubbleSize = v => {
						v = Math.min(1, Math.max(0, util.ensure(v, "num")));
						if (bubblesize == v) return;
						bubblesize = v;
						if (pg.hasBubble() && (bubblecircle instanceof HTMLDivElement))
							bubblecircle.style.setProperty("--size", bubblesize);
					};
					let bubblecolor = [255, 255, 255, 255];
					pg.getBubbleColor = () => [...bubblecolor];
					pg.setBubbleColor = v => {
						v = util.ensure(v, "arr").map(v => Math.min(255, Math.max(0, util.ensure(v, "num"))));
						while (v.length < 4) v.push([0, 0, 0, 255][v.length]);
						while (v.length > 4) v.pop();
						bubblecolor = v;
						if (pg.hasBubble() && (bubblecircle instanceof HTMLDivElement))
							bubblecircle.style.setProperty("--color", "rgba("+[...bubblecolor.slice(0, 3), bubblecolor[3]/255].join(",")+")");
					};
					let togglemicbtn = pg.togglemicbtn = document.getElementById("tunertogglemicbtn");
					if (togglemicbtn instanceof HTMLButtonElement)
						togglemicbtn.addEventListener("click", e => {
							this.post("tuner-mic-toggle", { e: e });	
						});
					let togglemicbtnicon = (togglemicbtn instanceof HTMLButtonElement) ? togglemicbtn.children[0] : null;
					pg.getMicState = () => {
						if (!(togglemicbtn instanceof HTMLButtonElement)) return null;
						if (togglemicbtn.classList.contains("on")) return "on";
						if (togglemicbtn.classList.contains("wait")) return "wait";
						return "off";
					};
					pg.setMicState = v => {
						v = String(v).toLowerCase();
						if (!["on", "wait", "off"].includes(v)) return false;
						if (!(togglemicbtn instanceof HTMLButtonElement)) return false;
						togglemicbtn.classList.remove("on");
						togglemicbtn.classList.remove("wait");
						if (v == "on") togglemicbtn.classList.add("on");
						else if (v == "wait") togglemicbtn.classList.add("wait");
						if (togglemicbtnicon instanceof HTMLElement)
							togglemicbtnicon.setAttribute("name", (v == "on") ? "mic" : (v == "wait") ? "mic" : (v == "off") ? "mic-off" : "");
						return true;
					};
					pg.setMicState("off");
					let info = pg.info = pg.querySelector(":scope > .inner > .info");
					pg.getInfoColor = () => {
						if (!(info instanceof HTMLDivElement)) return null;
						return info.style.getPropertyValue("--color");
					};
					pg.setInfoColor = v => {
						if (!(info instanceof HTMLDivElement)) return false;
						info.style.setProperty("--color", v);
						return true;
					};
					let note = pg.note = pg.querySelector(":scope > .inner > .info > .note");
					let noteshow = true;
					pg.getNoteShown = () => noteshow;
					pg.setNoteShown = v => {
						v = !!v;
						if (noteshow == v) return;
						noteshow = v;
						if (note instanceof HTMLDivElement)
							note.style.opacity = ((v ? 1 : 0.5) * 100)+"%";
					};
					pg.getNoteHidden = () => !pg.getNoteShown();
					pg.setNoteHidden = v => pg.setNoteShown(!v);
					pg.showNote = () => pg.setNoteShown(true);
					pg.hideNote = () => pg.setNoteHidden(true);
					pg.hideNote();
					let notename = pg.notename = pg.querySelector(":scope > .inner > .info > .note > .name");
					pg.getNoteName = () => ((notename instanceof HTMLDivElement) ? notename.textContent : null);
					pg.setNoteName = v => {
						if (notename instanceof HTMLDivElement)
							notename.textContent = v;
					};
					let noteaccidental = pg.noteaccidental = pg.querySelector(":scope > .inner > .info > .note > .side > .accidental");
					pg.getNoteAccidental = () => {
						if (!(noteaccidental instanceof HTMLDivElement)) return null;
						if (noteaccidental.textContent == bravura.flat) return -1;
						if (noteaccidental.textContent == bravura.sharp) return +1;
						return 0;
					};
					pg.setNoteAccidental = v => {
						v = util.ensure(v, "int");
						if (Math.abs(v) > 1) return false;
						if (noteaccidental instanceof HTMLDivElement)
							noteaccidental.textContent = [bravura.flat, bravura.natural, bravura.sharp][v+1];
						return true;
					};
					let noteoctave = pg.noteoctave = pg.querySelector(":scope > .inner > .info > .note > .side > .octave");
					pg.getNoteOctave = () => {
						if (!(noteoctave instanceof HTMLDivElement)) return null;
						return util.ensure(parseInt(noteoctave.textContent), "int");
					};
					pg.setNoteOctave = v => {
						v = Math.max(0, util.ensure(v, "int"));
						if (noteoctave instanceof HTMLDivElement)
							noteoctave.textContent = v;
						return true;
					};
					let cents = pg.cents = pg.querySelector(":scope > .inner > .info > .cents");
					let centsshow = true;
					pg.getCentsShown = () => centsshow;
					pg.setCentsShown = v => {
						v = !!v;
						if (centsshow == v) return;
						centsshow = v;
						if (cents instanceof HTMLDivElement)
							cents.style.opacity = ((v ? 1 : 0.5) * 100)+"%";
					};
					pg.getCentsHidden = () => !pg.getCentsShown();
					pg.setCentsHidden = v => pg.setCentsShown(!v);
					pg.showCents = () => pg.setCentsShown(true);
					pg.hideCents = () => pg.setCentsHidden(true);
					pg.hideCents();
					let centsvalue = pg.centsvalue = pg.querySelector(":scope > .inner > .info > .cents > .value");
					pg.getCents = () => {
						if (!(centsvalue instanceof HTMLDivElement)) return null;
						return util.ensure(parseFloat(centsvalue.textContent), "num");
					};
					pg.setCents = v => {
						v = util.ensure(v, "num");
						v = String(v).split(".");
						let whole = v[0], part = (v.length < 2) ? "" : v[1];
						while (part.length < 1) part += "0";
						while (part.length > 2) part = part.substr(0, part.length-1);
						if (!whole.startsWith("-")) whole = "+"+whole;
						if (centsvalue instanceof HTMLDivElement)
							centsvalue.textContent = whole+"."+part;
						return true;
					};
					let hertz = pg.hertz = pg.querySelector(":scope > .inner > .info > .misc > .hz");
					let hertzshow = true;
					pg.getHertzShown = () => hertzshow;
					pg.setHertzShown = v => {
						v = !!v;
						if (hertzshow == v) return;
						hertzshow = v;
						if (hertz instanceof HTMLDivElement)
							hertz.style.opacity = ((v ? 1 : 0.5) * 100)+"%";
					};
					pg.getHertzHidden = () => !pg.getHertzShown();
					pg.setHertzHidden = v => pg.setHertzShown(!v);
					pg.showHertz = () => pg.setHertzShown(true);
					pg.hideHertz = () => pg.setHertzHidden(true);
					pg.hideHertz();
					let hertzvalue = pg.hertzvalue = pg.querySelector(":scope > .inner > .info > .misc > .hz > .value");
					pg.getHertz = () => {
						if (!(hertzvalue instanceof HTMLSpanElement)) return null;
						return util.ensure(parseFloat(hertzvalue.textContent), "num");
					};
					pg.setHertz = v => {
						v = Math.max(0, util.ensure(v, "num"));
						v = String(v).split(".");
						let whole = v[0], part = (v.length < 2) ? "" : v[1];
						while (part.length < 1) part += "0";
						while (part.length > 2) part = part.substr(0, part.length-1);
						if (hertzvalue instanceof HTMLSpanElement)
							hertzvalue.textContent = whole+"."+part;
						return true;
					};
					let barinfo = pg.barinfo = pg.querySelector(":scope > .inner > .barinfo");
					let barinfoshow = true;
					pg.getBarInfoShown = () => barinfoshow;
					pg.setBarInfoShown = v => {
						v = !!v;
						if (barinfoshow == v) return;
						barinfoshow = v;
						if (barinfo instanceof HTMLDivElement)
							barinfo.style.opacity = ((v ? 1 : 0.5) * 100)+"%";
					};
					pg.getBarInfoHidden = () => !pg.getBarInfoShown();
					pg.setBarInfoHidden = v => pg.setBarInfoShown(!v);
					pg.showBarInfo = () => pg.setBarInfoShown(true);
					pg.hideBarInfo = () => pg.setBarInfoHidden(true);
					pg.hideBarInfo();
					let barinfovalue = pg.barinfovalue = pg.querySelector(":scope > .inner > .barinfo > .value");
					pg.getPlayTime = () => {
						if (!(barinfovalue instanceof HTMLSpanElement)) return null;
						return util.ensure(parseInt(barinfovalue.textContent), "int");
					};
					pg.setPlayTime = v => {
						v = Math.max(util.ensure(v, "int"));
						if (barinfovalue instanceof HTMLSpanElement)
							barinfovalue.textContent = v;
						return true;
					};
					const applyToBar = bar => {
						bar.addEventListener("mouseenter", () => {
							if (bar.tooltip instanceof HTMLDivElement)
								bar.tooltip.classList.add("hover");
						});
						bar.addEventListener("mouseleave", () => {
							if (bar.tooltip instanceof HTMLDivElement)
								bar.tooltip.classList.remove("hover");
						});
						const change = () => {
							let v = util.ensure(parseFloat(bar.style.getPropertyValue("--size")), "num");
							let sv = (Math.round(v*100*10)/10) + "%";
							if (v < 0.2) {
								bar.textContent = "";
								if (!(bar.tooltip instanceof HTMLDivElement)) {
									let tooltip = bar.tooltip = document.createElement("div");
									pg.appendChild(tooltip);
									tooltip.style.position = "absolute";
								}
								let tooltip = bar.tooltip;
								let r = bar.getBoundingClientRect();
								tooltip.style.top = r.top + "px";
								tooltip.style.left = (r.left + r.width/2) + "px";
								tooltip.innerHTML = "<div class='tooltip side-t hov'></div>";
								tooltip.children[0].textContent = sv;
							} else {
								bar.textContent = sv;
								if (bar.tooltip instanceof HTMLDivElement) {
									bar.tooltip.remove();
									delete bar.tooltip;
								}
							}
						};
						new ResizeObserver(change).observe(bar);
						new ResizeObserver(change).observe(document.body);
					};
					let goodbar = pg.goodbar = pg.querySelector(":scope > .inner > .bar > div.good");
					pg.getGoodSize = () => {
						if (!(goodbar instanceof HTMLDivElement)) return null;
						return util.ensure(parseFloat(goodbar.style.getPropertyValue("--size")), "num");
					};
					pg.setGoodSize = v => {
						v = Math.min(1, Math.max(0, util.ensure(v, "num")));
						if (goodbar instanceof HTMLDivElement)
							goodbar.style.setProperty("--size", v);
						return true;
					};
					applyToBar(goodbar);
					let midbar = pg.midbar = pg.querySelector(":scope > .inner > .bar > div.mid");
					pg.getMidSize = () => {
						if (!(midbar instanceof HTMLDivElement)) return null;
						return util.ensure(parseFloat(midbar.style.getPropertyValue("--size")), "num");
					};
					pg.setMidSize = v => {
						v = Math.min(1, Math.max(0, util.ensure(v, "num")));
						if (midbar instanceof HTMLDivElement) {
							midbar.style.setProperty("--size", v);
							let sv = (Math.round(v*100*10)/10) + "%";
							if (v < 0.25) {
								midbar.innerHTML = "<div class='tooltip side-t hov'></div>";
								let tooltip = midbar.children[0];
								tooltip.textContent = sv;
							} else midbar.textContent = sv;
						}
						return true;
					};
					applyToBar(midbar);
					let badbar = pg.badbar = pg.querySelector(":scope > .inner > .bar > div.bad");
					pg.getBadSize = () => {
						if (!(badbar instanceof HTMLDivElement)) return null;
						return util.ensure(parseFloat(badbar.style.getPropertyValue("--size")), "num");
					};
					pg.setBadSize = v => {
						v = Math.min(1, Math.max(0, util.ensure(v, "num")));
						if (badbar instanceof HTMLDivElement) {
							badbar.style.setProperty("--size", v);
							let sv = (Math.round(v*100*10)/10) + "%";
							if (v < 0.25) {
								badbar.innerHTML = "<div class='tooltip side-t hov'></div>";
								let tooltip = badbar.children[0];
								tooltip.textContent = sv;
							} else badbar.textContent = sv;
						}
						return true;
					};
					applyToBar(badbar);
					pg.reset = () => {
						pg.setBubbleSize(0);
						pg.setInfoColor("var(--v5)");
						pg.setNoteName("C");
						pg.setNoteAccidental(0);
						pg.setNoteOctave(4);
						pg.setCents(0);
						pg.setHertz(261.6);
						pg.setPlayTime(0);
						pg.setGoodSize(0);
						pg.setMidSize(0);
						pg.setBadSize(0);
					};
					pg.reset();
				},
				GAME: () => {
					pg.getWidth = () => 0;
					let estaffs = pg.staffs = pg.querySelector(":scope > .staffs");
					pg.hasStaffs = () => (estaffs instanceof HTMLDivElement);
					let staffs = [];
					pg.getStaffs = () => [...staffs];
					pg.setStaffs = v => {
						v = util.ensure(v, "arr");
						pg.clearStaffs();
						v.forEach(v => pg.addStaff(v));
					};
					pg.clearStaffs = () => pg.getStaffs().forEach(staff => pg.remStaff(staff));
					pg.hasStaff = v => staffs.includes(v);
					pg.addStaff = v => {
						if (!(v instanceof UIHandler.Staff)) return false;
						if (pg.hasStaff(v)) return false;
						staffs.push(v);
						if (pg.hasStaffs()) estaffs.appendChild(v.elem);
						return true;
					};
					pg.remStaff = v => {
						if (!(v instanceof UIHandler.Staff)) return false;
						if (!pg.hasStaff(v)) return false;
						staffs.splice(staffs.indexOf(v), 1);
						if (pg.hasStaffs()) estaffs.removeChild(v.elem);
						return true;
					};
					let etemponote = pg.temponote = pg.querySelector(":scope > .staffs > .tempo > .note");
					let temponote = null;
					pg.getTempoNote = () => temponote;
					pg.setTempoNote = v => {
						v = Math.max(1, util.ensure(v, "int"));
						v = Math.min(6, Math.max(1, Math.round(Math.log2(v))));
						v = 2 ** v;
						if (pg.getTempoNote() == v) return true;
						temponote = v;
						let head = ("notehead_"+temponote in bravura) ? bravura["notehead_"+temponote] : bravura.notehead_4;
						let flag = ("noteflag_"+temponote in bravura) ? bravura["noteflag_"+temponote] : "";
						if (etemponote instanceof HTMLSpanElement) etemponote.textContent = head+bravura.notestem+flag;
						return true;
					};
					let etempovalue = pg.tempovalue = pg.querySelector(":scope > .staffs > .tempo > .value");
					pg.getTempoValue = () => {
						if (!(etempovalue instanceof HTMLSpanElement)) return null;
						return util.ensure(parseInt(etempovalue.textContent), "int");
					};
					pg.setTempoValue = v => {
						v = Math.max(1, util.ensure(v, "int"));
						if (!(etempovalue instanceof HTMLSpanElement)) return false;
						etempovalue.textContent = v;
						return true;
					};
					let ecountdown = pg.ecountdown = pg.querySelector(":scope > .countdown");
					pg.isCountdownOn = () => {
						if (!(ecountdown instanceof HTMLDivElement)) return null;
						return ecountdown.classList.contains("on");
					};
					pg.isCountdownOff = () => {
						if (!(ecountdown instanceof HTMLDivElement)) return null;
						return !ecountdown.classList.contains("on");
					};
					pg.setCountdownOn = v => {
						if (!(ecountdown instanceof HTMLDivElement)) return false;
						if (v) ecountdown.classList.add("on");
						else ecountdown.classList.remove("on");
						return true;
					};
					pg.setCountdownOff = v => {
						if (!(ecountdown instanceof HTMLDivElement)) return false;
						if (v) ecountdown.classList.remove("on");
						else ecountdown.classList.add("on");
						return true;
					};
					pg.countdownOn = () => pg.setCountdownOn(true);
					pg.countdownOff = () => pg.setCountdownOff(true);
					pg.countdownOff();
					let ecountdownsquare = pg.ecountdownsquare = pg.querySelector(":scope > .countdown > .square");
					let squaredir = null;
					pg.getSquareDir = () => squaredir;
					pg.setSquareDir = v => {
						v = util.ensure(v, "int");
						if (pg.getSquareDir() == v) return true;
						squaredir = v;
						if (ecountdownsquare instanceof HTMLDivElement)
							ecountdownsquare.style.setProperty("--d", squaredir);
						return true;
					};
					pg.setSquareDir(0);
					let ecountdownvalue = pg.ecountdownvalue = pg.querySelector(":scope > .countdown > .value");
					pg.getCountdownN = () => {
						if (!(ecountdownvalue instanceof HTMLDivElement)) return null;
						return util.ensure(parseInt(ecountdownvalue.textContent), "int");
					};
					pg.setCountdownN = v => {
						v = Math.max(0, util.ensure(v, "int"));
						if (!(ecountdownvalue instanceof HTMLDivElement)) return false;
						ecountdownvalue.textContent = v;
						return true;
					};
					let inner = pg.inner = pg.querySelector(":scope > .inner");
					pg.getInnerShown = () => {
						if (!(inner instanceof HTMLDivElement)) return null;
						return inner.classList.contains("this");
					};
					pg.getInnerHidden = () => {
						if (!(inner instanceof HTMLDivElement)) return null;
						return !inner.classList.contains("this");
					};
					pg.setInnerShown = v => {
						if (!(inner instanceof HTMLDivElement)) return false;
						if (v) inner.classList.add("this");
						else inner.classList.remove("this");
						return true;
					};
					pg.setInnerHidden = v => {
						if (!(inner instanceof HTMLDivElement)) return false;
						if (v) inner.classList.remove("this");
						else inner.classList.add("this");
						return true;
					};
					pg.showInner = () => pg.setInnerShown(true);
					pg.hideInner = () => pg.setInnerHidden(true);
					pg.hideInner();
					let stars = pg.stars = pg.querySelector(":scope > .inner > .stars");
					pg.getNStars = () => {
						if (!(stars instanceof HTMLDivElement)) return null;
						let n = 0;
						Array.from(stars.querySelectorAll("ion-icon")).forEach(star => {
							if (star.classList.contains("this")) n++;
						});
						return n;
					};
					pg.setNStars = v => {
						v = Math.max(0, util.ensure(v, "int"));
						if (!(stars instanceof HTMLDivElement)) return false;
						Array.from(stars.querySelectorAll("ion-icon")).forEach((star, i) => {
							if (i < v) star.classList.add("this");
							else star.classList.remove("this");
						});
						return true;
					};
					pg.setNStars(0);
					const applyToBar = bar => {
						bar.addEventListener("mouseenter", () => {
							if (bar.tooltip instanceof HTMLDivElement)
								bar.tooltip.classList.add("hover");
						});
						bar.addEventListener("mouseleave", () => {
							if (bar.tooltip instanceof HTMLDivElement)
								bar.tooltip.classList.remove("hover");
						});
						const change = () => {
							let v = util.ensure(parseFloat(bar.style.getPropertyValue("--size")), "num");
							let sv = (Math.round(v*100*10)/10) + "%";
							if (v < 0.2) {
								bar.textContent = "";
								if (!(bar.tooltip instanceof HTMLDivElement)) {
									let tooltip = bar.tooltip = document.createElement("div");
									pg.appendChild(tooltip);
									tooltip.style.position = "absolute";
								}
								let tooltip = bar.tooltip;
								let r = bar.getBoundingClientRect();
								tooltip.style.top = r.top + "px";
								tooltip.style.left = (r.left + r.width/2) + "px";
								tooltip.innerHTML = "<div class='tooltip side-t hov'></div>";
								tooltip.children[0].textContent = sv;
							} else {
								bar.textContent = sv;
								if (bar.tooltip instanceof HTMLDivElement) {
									bar.tooltip.remove();
									delete bar.tooltip;
								}
							}
						};
						new ResizeObserver(change).observe(bar);
						new ResizeObserver(change).observe(document.body);
					};
					let goodbar = pg.goodbar = pg.querySelector(":scope > .inner > .info > .bar > .good");
					pg.getGoodSize = () => {
						if (!(goodbar instanceof HTMLDivElement)) return null;
						return util.ensure(parseFloat(goodbar.style.getPropertyValue("--size")), "num");
					};
					pg.setGoodSize = v => {
						v = Math.min(1, Math.max(0, util.ensure(v, "num")));
						if (goodbar instanceof HTMLDivElement) {
							goodbar.style.setProperty("--size", v);
							let sv = (Math.round(v*100*10)/10) + "%";
							if (v < 0.25) {
								goodbar.innerHTML = "<div class='tooltip side-t hov'></div>";
								let tooltip = goodbar.children[0];
								tooltip.textContent = sv;
							} else goodbar.textContent = sv;
						}
						return true;
					};
					applyToBar(goodbar);
					let midbar = pg.midbar = pg.querySelector(":scope > .inner > .info > .bar > .mid");
					pg.getMidSize = () => {
						if (!(midbar instanceof HTMLDivElement)) return null;
						return util.ensure(parseFloat(midbar.style.getPropertyValue("--size")), "num");
					};
					pg.setMidSize = v => {
						v = Math.min(1, Math.max(0, util.ensure(v, "num")));
						if (midbar instanceof HTMLDivElement) {
							midbar.style.setProperty("--size", v);
							let sv = (Math.round(v*100*10)/10) + "%";
							if (v < 0.25) {
								midbar.innerHTML = "<div class='tooltip side-t hov'></div>";
								let tooltip = midbar.children[0];
								tooltip.textContent = sv;
							} else midbar.textContent = sv;
						}
						return true;
					};
					applyToBar(midbar);
					let badbar = pg.badbar = pg.querySelector(":scope > .inner > .info > .bar > .bad");
					pg.getBadSize = () => {
						if (!(badbar instanceof HTMLDivElement)) return null;
						return util.ensure(parseFloat(badbar.style.getPropertyValue("--size")), "num");
					};
					pg.setBadSize = v => {
						v = Math.min(1, Math.max(0, util.ensure(v, "num")));
						if (badbar instanceof HTMLDivElement) {
							badbar.style.setProperty("--size", v);
							let sv = (Math.round(v*100*10)/10) + "%";
							if (v < 0.25) {
								badbar.innerHTML = "<div class='tooltip side-t hov'></div>";
								let tooltip = badbar.children[0];
								tooltip.textContent = sv;
							} else badbar.textContent = sv;
						}
						return true;
					};
					applyToBar(badbar);
					let retrybtn = pg.retrybtn = document.getElementById("gameretrybtn");
					if (retrybtn instanceof HTMLButtonElement)
						retrybtn.addEventListener("click", e => {
							this.post("game-retry", { e: e });
						});
					let backbtn = pg.backbtn = document.getElementById("gamebackbtn");
					if (backbtn instanceof HTMLButtonElement)
						backbtn.addEventListener("click", e => {
							this.post("game-back", { e: e });
						});
					let scroll = 0;
					pg.getScroll = () => scroll;
					pg.setScroll = v => {
						v = util.ensure(v, "num");
						if (pg.getScroll() == v) return true;
						scroll = v;
						return true;
					};
					pg.setScroll(0);
					let preview = 1;
					pg.getPreview = () => preview;
					pg.setPreview = v => {
						v = Math.max(1, util.ensure(v, "int"));
						if (pg.getPreview() == v) return true;
						preview = v;
						return true;
					};
					pg.update = () => {
						let beatWidth = (pg.hasStaffs() ? estaffs.getBoundingClientRect().width-220 : 0) / preview;
						pg.getStaffs().forEach(staff => {
							staff.scroll = scroll;
							staff.beatWidth = beatWidth;
							staff.update();
						});
					};
				},
			};
			if (name in pagefs) pagefs[name]();
		}
	}
	pageFrom() {
		if (this.hasPage()) this.getPage().classList.remove("this");
		let pagefs = {
			
		};
		if (this.page in pagefs) pagefs[this.page]();
	}
	pageTo(data) {
		data = util.ensure(data, "obj");
		let pg = this.getPage();
		if (this.hasPage()) {
			pg.classList.add("this");
			let inner = pg.querySelector(":scope > .inner");
			if (inner instanceof HTMLDivElement) {
				inner.appendChild(this.eTopNav);
				this.eTopNav.style.position = "absolute";
				this.eTopNav.style.top = "50px";
				this.eTopNav.style.right = "50px";
			}
		}
		this.showTopNav();
		let pagefs = {
			LOGIN: () => {
				this.hideTopNav();
			},
			JOIN: () => {
				this.hideTopNav();
			},
			BROWSE: () => {
				if (this.hasPage()) {
					let title = pg.querySelector(":scope > .inner > .title");
					if (title instanceof HTMLDivElement) {
						title.appendChild(this.eTopNav);
						this.eTopNav.style = "";
						this.eTopNav.style.position = "absolute";
						this.eTopNav.style.top = "0px";
						this.eTopNav.style.right = "40px";
					}
				}
			},
			SETTINGS: () => {
				if (this.hasPage()) {
					let title = pg.querySelector(":scope > .inner > .title");
					if (title instanceof HTMLDivElement) {
						title.appendChild(this.eTopNav);
						this.eTopNav.style = "";
						this.eTopNav.style.position = "absolute";
						this.eTopNav.style.top = "0px";
						this.eTopNav.style.right = "0px";
					}
				}
			},
			TUNER: () => {
				this.hideTopNav();
			},
			GAME: () => {
				this.hideTopNav();
			},
		};
		if (this.page in pagefs) pagefs[this.page]();
	}
	getPage(name) {
		name = (name == null) ? this.page : String(name);
		return this.#pages[name];
	}
	hasPage(name) {
		return this.getPage(name) instanceof HTMLElement;
	}
	
	get transition() { return this.#transition; }
	set transition(v) {
		v = Math.max(0, util.ensure(v, "num"));
		if (this.transition == v) return;
		this.#transition = v;
		document.documentElement.style.setProperty("--t", this.transition+"s");
	}
	get legacy() { return this.#legacy; }
	set legacy(v) {
		v = !!v;
		if (this.legacy == v) return;
		this.#legacy = v;
		document.documentElement.style.setProperty("--legacy", this.legacy ? 1 : 0);
	}
	
	get topNavShown() { return this.hasTopNav() && this.eTopNav.classList.contains("this"); }
	set topNavShown(v) {
		if (!this.hasTopNav()) return;
		if (v) this.eTopNav.classList.add("this");
		else this.eTopNav.classList.remove("this");
 	}
	get topNavHidden() { return this.hasTopNav() && !this.eTopNav.classList.contains("this"); }
	set topNavHidden(v) { this.topNavShown = !v; }
	showTopNav() { return this.topNavShown = true; }
	hideTopNav() { return this.topNavHidden = true; }
	get loggedOut() { return this.hasTopNavLoggedOut() && this.eTopNavLoggedOut.classList.contains("this"); }
	set loggedOut(v) {
		if (!this.hasTopNavLoggedOut()) return;
		if (v) this.eTopNavLoggedOut.classList.add("this");
		else this.eTopNavLoggedOut.classList.remove("this");
	}
	get loggedIn() { return this.hasTopNavLoggedIn() && this.eTopNavLoggedIn.classList.contains("this"); }
	set loggedIn(v) {
		if (!this.hasTopNavLoggedIn()) return;
		if (v) this.eTopNavLoggedIn.classList.add("this");
		else this.eTopNavLoggedIn.classList.remove("this");
	}
	get username() {
		if (!this.hasTopNavAccountBtn()) return null;
		let span = this.eTopNavAccountBtn.querySelector(":scope > span");
		if (!(span instanceof HTMLSpanElement)) return null;
		return span.textContent;
	}
	set username(v) {
		if (!this.hasTopNavAccountBtn()) return;
		let span = this.eTopNavAccountBtn.querySelector(":scope > span");
		if (!(span instanceof HTMLSpanElement)) return;
		span.textContent = v;
	}
	
	get notifications() { return [...this.#notifications]; }
	set notifications(v) {
		v = util.ensure(v, "arr");
		this.notifications.forEach(notif => this.remNotification(notif));
		v.forEach(notif => this.addNotification(notif));
	}
	hasNotification(notif) {
		if (!(notif instanceof UIHandler.Notification)) return false;
		return this.#notifications.includes(notif);
	}
	addNotification(notif) {
		if (!(notif instanceof UIHandler.Notification)) return false;
		if (this.hasNotification(notif)) return false;
		this.#notifications.push(notif);
		notif.onclose = () => this.remNotification(notif);
		notif.onmap = () => this.pushVars();
		notif.addHandler("close", notif.onclose);
		notif.addHandler("map", notif.onmap);
		if (this.hasNotifications()) this.eNotifications.appendChild(notif.elem);
		setTimeout(() => {
			notif.in();
		}, 100);
		notif.startTimer();
		notif.onmap();
		return notif;
	}
	remNotification(notif) {
		if (!(notif instanceof UIHandler.Notification)) return false;
		if (!this.hasNotification(notif)) return false;
		this.#notifications.splice(this.#notifications.indexOf(notif), 1);
		notif.remHandler("close", notif.onclose);
		notif.remHandler("map", notif.onmap);
		delete notif.onclose;
		delete notif.onmap;
		notif.out();
		setTimeout(() => {
			try {
				if (this.hasNotifications()) this.eNotifications.removeChild(notif.elem);
			} catch (e) {}
		}, this.transition*1000);
		return notif;
	}
	
	getBackgroundOn() {
		if (!this.hasBackground()) return null;
		return this.eBackground.classList.contains("on");
	}
	getBackgroundOff() {
		if (!this.hasBackground()) return null;
		return !this.eBackground.classList.contains("on");
	}
	setBackgroundOn(v) {
		if (!this.hasBackground()) return false;
		if (v) this.eBackground.classList.add("on");
		else this.eBackground.classList.remove("on");
		return true;
	}
	setBackgroundOff(v) {
		if (!this.hasBackground()) return false;
		if (v) this.eBackground.classList.remove("on");
		else this.eBackground.classList.add("on");
		return true;
	}
	backgroundOn() { return this.setBackgroundOn(true); }
	backgroundOff() { return this.setBackgroundOff(true); }
	
	get introIn() { return this.hasIntro() && this.eIntro.classList.contains("this"); }
	set introIn(v) {
		v = !!v;
		if (this.introIn == v) return;
		if (!this.hasIntro()) return;
		if (v) this.eIntro.classList.add("this");
		else this.eIntro.classList.remove("this");
		this.eIntroRings.forEach(ring => {
			// ring.style.animation = "";
			// ring.offsetWidth;
			// if (v) ring.style.animation = "ring-around 2s";
		});
	}
	get introOut() { return this.hasIntro() && !this.eIntro.classList.contains("this"); }
	set introOut(v) { this.introIn = !v; }
}
UIHandler.Notification = class UIHandlerNotification extends Target {
	#elem;
	#inner;
	#eTitle;
	#eInfo;
	#eClose;
	
	#timer;
	#duration;
	#progress;
	
	constructor(state, title, info) {
		super();
		
		this.#elem = document.createElement("div");
		this.elem.classList.add("item");
		this.#inner = document.createElement("div");
		this.elem.appendChild(this.inner);
		this.inner.classList.add("inner");
		this.#eTitle = document.createElement("div");
		this.inner.appendChild(this.eTitle);
		this.eTitle.classList.add("title");
		this.#eInfo = document.createElement("div");
		this.inner.appendChild(this.eInfo);
		this.eInfo.classList.add("info");
		this.#eClose = document.createElement("button");
		this.inner.appendChild(this.eClose);
		this.eClose.classList.add("close");
		this.eClose.classList.add("override");
		this.eClose.innerHTML = "<ion-icon name='close'></ion-icon>";
		this.eClose.addEventListener("click", e => {
			this.post("close", { e: e });	
		});
		
		this.#timer = null;
		this.#duration = null;
		this.#progress = null;
		
		this.state = state;
		
		this.title = title;
		this.info = info;
		
		this.duration = 5000;
		
		this.progress = 0;
	}
	
	get elem() { return this.#elem; }
	get inner() { return this.#inner; }
	get eTitle() { return this.#eTitle; }
	get eInfo() { return this.#eInfo; }
	get eClose() { return this.#eClose; }
	
	in() { this.elem.classList.add("in"); }
	out() { this.elem.classList.remove("in"); }
	isIn() { return this.elem.classList.contains("in"); }
	isOut() { return !this.isIn(); }
	
	get t() { return this.timerStarted() ? (util.getTime()-this.#timer) : null; }
	timerStarted() { return this.#timer != null; }
	timerStopped() { return !this.timerStarted(); }
	startTimer() { if (!this.timerStarted()) this.#timer = util.getTime(); }
	stopTimer() { if (!this.timerStopped()) this.#timer = null; }
	
	get duration() { return this.#duration; }
	set duration(v) { this.#duration = Math.max(0, util.ensure(v, "num")); }
	
	get progress() { return this.#progress; }
	set progress(v) {
		v = Math.min(1, Math.max(0, util.ensure(v, "num")));
		if (this.progress == v) return;
		this.#progress = v;
		this.elem.style.setProperty("--progress", (100*this.progress)+"%");
	}
	
	get state() {
		if (this.elem.classList.contains("err")) return "E";
		if (this.elem.classList.contains("warn")) return "W";
		if (this.elem.classList.contains("succ")) return "S";
		return "I";
	}
	set state(v) {
		v = String(v).toUpperCase();
		if (!["E", "W", "S", "I"].includes(v)) return;
		this.elem.classList.remove("err");
		this.elem.classList.remove("warn");
		this.elem.classList.remove("succ");
		if (v == "E") return this.elem.classList.add("err");
		if (v == "W") return this.elem.classList.add("warn");
		if (v == "S") return this.elem.classList.add("succ");
	}
	
	get title() { return this.eTitle.textContent; }
	set title(v) { this.eTitle.textContent = v; this.post("map", null); }
	get info() { return this.eInfo.textContent; }
	set info(v) { this.eInfo.textContent = v; this.post("map", null); }
	
	update() {
		if (this.timerStarted()) {
			this.progress = this.t/this.duration;
			if (this.t > this.duration) this.post("close", { e: null });
		}
	}
}
UIHandler.Level = class UIHandlerLevel extends Target {
	#id;
	#level;
	
	#elem;
	#ePlay;
	#ePlayBtn;
	#eInfo;
	#eInfoLine1;
	#eInfoLine2;
	#eLevelName;
	#eLevelAuthor;
	#eSongName;
	#eSongAuthor;
	#eNav;
	#eLikeBtn;
	#eStars;
	
	constructor(id, level) {
		super();
		
		this.#id = null;
		this.#level = null;
		
		this.#elem = document.createElement("div");
		this.elem.classList.add("item");
		this.#ePlay = document.createElement("div");
		this.elem.appendChild(this.ePlay);
		this.ePlay.classList.add("play");
		this.#ePlayBtn = document.createElement("button");
		this.ePlay.appendChild(this.ePlayBtn);
		this.ePlayBtn.classList.add("override");
		this.#eInfo = document.createElement("div");
		this.elem.appendChild(this.eInfo);
		this.eInfo.classList.add("info");
		this.#eInfoLine1 = document.createElement("div");
		this.eInfo.appendChild(this.eInfoLine1);
		this.eInfoLine1.classList.add("line");
		this.#eLevelName = document.createElement("div");
		this.eInfoLine1.appendChild(this.eLevelName);
		this.#eLevelAuthor = document.createElement("div");
		this.eInfoLine1.appendChild(this.eLevelAuthor);
		this.#eInfoLine2 = document.createElement("div");
		this.eInfo.appendChild(this.eInfoLine2);
		this.eInfoLine2.classList.add("line");
		this.#eSongName = document.createElement("div");
		this.eInfoLine2.appendChild(this.eSongName);
		this.#eSongAuthor = document.createElement("div");
		this.eInfoLine2.appendChild(this.eSongAuthor);
		this.#eNav = document.createElement("div");
		this.elem.appendChild(this.eNav);
		this.eNav.classList.add("nav");
		this.#eLikeBtn = document.createElement("button");
		this.eNav.appendChild(this.eLikeBtn);
		this.eLikeBtn.classList.add("like");
		this.eLikeBtn.classList.add("override");
		this.eLikeBtn.innerHTML = "<ion-icon name='heart'></ion-icon>";
		this.#eStars = document.createElement("div");
		this.eNav.appendChild(this.eStars);
		this.eStars.classList.add("stars");
		
		this.nStars = 0;
		
		this.id = id;
		this.level = level;
		
		this.elem.addEventListener("click", e => {
			this.post("click", { o: this });
		});
		this.ePlayBtn.addEventListener("click", e => {
			e.stopPropagation();
			this.post("play", { o: this });
		});
		this.eLikeBtn.addEventListener("click", e => {
			e.stopPropagation();
			this.post("like", { o: this });
		});
		this.elem.addEventListener("dblclick", e => {
			this.post("click", { o: this });
			this.post("play", { o: this });
		});
	}
	
	get id() { return this.#id; }
	set id(v) {
		v = util.is(v, "str") ? String(v) : null;
		if (this.id == v) return;
		this.#id = v;
	}
	hasId() { return util.is(this.id, "str"); }
	get level() { return this.#level; }
	set level(v) {
		v = (v instanceof Level) ? v : null;
		if (this.level == v) return;
		this.#level = v;
	}
	hasLevel() { return this.level instanceof Level; }
	
	get elem() { return this.#elem; }
	get ePlay() { return this.#ePlay; }
	get ePlayBtn() { return this.#ePlayBtn; }
	get eInfo() { return this.#eInfo; }
	get eInfoLine1() { return this.#eInfoLine1; }
	get eInfoLine2() { return this.#eInfoLine2; }
	get eLevelName() { return this.#eLevelName; }
	get eLevelAuthor() { return this.#eLevelAuthor; }
	get eSongName() { return this.#eSongName; }
	get eSongAuthor() { return this.#eSongAuthor; }
	get eNav() { return this.#eNav; }
	get eLikeBtn() { return this.#eLikeBtn; }
	get eStars() { return this.#eStars; }
	
	get isThis() { return this.elem.classList.contains("this"); }
	set isThis(v) { v ? this.elem.classList.add("this") : this.elem.classList.remove("this"); }
	
	get levelName() { return this.eLevelName.textContent; }
	set levelName(v) { this.eLevelName.textContent = v; }
	get levelAuthor() { return this.eLevelAuthor.textContent; }
	set levelAuthor(v) { this.eLevelAuthor.textContent = v; }
	get songName() { return this.eSongName.textContent; }
	set songName(v) { this.eSongName.textContent = v; }
	get songAuthor() { return this.eSongAuthor.textContent; }
	set songAuthor(v) { this.eSongAuthor.textContent = v; }
	
	get liked() { return this.eLikeBtn.classList.contains("this"); }
	set liked(v) { v ? this.eLikeBtn.classList.add("this") : this.eLikeBtn.classList.remove("this"); }
	
	checkStars() {
		let stars = Array.from(this.eStars.querySelectorAll("ion-icon"));
		while (stars.length < 3) {
			this.eStars.innerHTML += "<ion-icon name='star'></ion-icon>";
			stars = Array.from(this.eStars.querySelectorAll("ion-icon"));
		}
		while (stars.length > 3) {
			stars.pop().remove();
		}
	}
	get nStars() {
		this.checkStars();
		let stars = Array.from(this.eStars.querySelectorAll("ion-icon"));
		let nstars = 0;
		stars.forEach(star => {
			if (star.classList.contains("this")) nstars++;	
		});
		return nstars;
	}
	set nStars(v) {
		this.checkStars();
		v = Math.min(3, Math.max(0, util.ensure(v, "int")));
		let stars = Array.from(this.eStars.querySelectorAll("ion-icon"));
		stars.forEach((star, i) => ((i < v) ? star.classList.add("this") : star.classList.remove("this")));
	}
	
	update() {
		if (!this.hasLevel()) return;
		this.levelName = this.level.meta.name;
		this.levelAuthor = this.level.meta.author;
		this.songName = this.level.meta.songName;
		this.songAuthor = this.level.meta.songAuthor;
	}
};
UIHandler.SettingsValue = class UIHandlerSettingsValue extends Target {
	#name;
	#elem;
	
	constructor(name) {
		super();
		
		this.#name = null;
		this.#elem = null;
		
		let hooks = {};
		let funcs = {};
		this.addHandler("hook", data => {
			if (this.elem instanceof HTMLInputElement) {
				if (this.elem.type == "checkbox") {
					hooks.change = () => {
						this.post("change", { from: !this.elem.checked, to: this.elem.checked });	
					};
					funcs.set = v => {
						v = !!v;
						if (this.elem.checked == v) return;
						this.elem.checked = v;
					};
				}
			}
			for (let e in hooks)
				this.elem.addEventListener(e, hooks[e]);
		});
		this.addHandler("unhook", data => {
			for (let e in hooks)
				this.elem.removeEventListener(e, hooks[e]);
			hooks = {};
			funcs = {};
		});
		this.addHandler("set", data => {
			if (!("v" in data)) throw "?";
			let v = util.ensure(data, "obj").v;
			if ("set" in funcs) funcs.set(v);
		});
		
		this.name = name;
	}
	
	get name() { return this.#name; }
	set name(v) {
		v = String(v);
		if (this.name == v) return;
		this.#name = v;
		this.unhook();
		this.#elem = document.getElementById("setting"+this.name);
		this.hook();
	}
	get elem() { return this.#elem; }
	hasElem() { return this.elem instanceof HTMLElement; }
	
	hook() {
		if (!this.hasElem()) return;
		this.post("hook", {});
	}
	unhook() {
		if (!this.hasElem()) return;
		this.post("unhook", {});
	}
};
UIHandler.Staff = class UIHandlerStaff extends Target {
	#scroll;
	#beatWidth;
	
	#elem;
	#eTS;
	#eTSTop;
	#eTSBottom;
	#eClef;
	#inner;
	
	#blocks;
	
	constructor() {
		super();
		
		this.#scroll = 0;
		this.#beatWidth = 0;
		
		this.#elem = document.createElement("div");
		this.elem.classList.add("staff");
		this.#eTS = document.createElement("div");
		this.elem.appendChild(this.eTS);
		this.eTS.classList.add("ts");
		this.#eTSTop = document.createElement("div");
		this.eTS.appendChild(this.eTSTop);
		this.#eTSBottom = document.createElement("div");
		this.eTS.appendChild(this.eTSBottom);
		this.#eClef = document.createElement("div");
		this.elem.appendChild(this.eClef);
		this.eClef.classList.add("clef");
		for (let i = -1; i < 5; i++) {
			let line = document.createElement("div");
			this.elem.appendChild(line);
			line.classList.add("line");
			if (i >= 0) {
				line.classList.add("staff");
				line.style.setProperty("--i", i);
			}
		}
		this.#inner = document.createElement("div");
		this.elem.appendChild(this.inner);
		this.inner.classList.add("inner");
		
		this.#blocks = [];
		
		this.left = 220;
		this.tsTop = 4;
		this.tsBottom = 4;
		this.clef = "treble";
	}
	
	get scroll() { return this.#scroll; }
	set scroll(v) {
		v = util.ensure(v, "num");
		if (this.scroll == v) return;
		this.#scroll = v;
		this.blocks.forEach(block => { block.scroll = this.scroll; });
	}
	get beatWidth() { return this.#beatWidth; }
	set beatWidth(v) {
		v = Math.max(0, util.ensure(v, "num"));
		if (this.beatWidth == v) return;
		this.#beatWidth = v;
		this.blocks.forEach(block => { block.beatWidth = this.beatWidth; });
	}
	
	get elem() { return this.#elem; }
	get eTS() { return this.#eTS; }
	get eTSTop() { return this.#eTSTop; }
	get eTSBottom() { return this.#eTSBottom; }
	get eClef() { return this.#eClef; }
	get inner() { return this.#inner; }
	
	get left() {
		let v = this.elem.style.getPropertyValue("--left");
		v = v.substr(0, v.length-2);
		v = util.ensure(parseFloat(v), "num");
		return v;
	}
	set left(v) {
		v = Math.max(0, util.ensure(v, "num"));
		this.elem.style.setProperty("--left", v+"px");
	}
	
	get tsTop() {
		let glyphs = Array.from(new Array(10).keys()).map(i => bravura["timesig_"+i]);
		let v = this.eTSTop.textContent;
		v = v.split("").filter(c => glyphs.includes(c)).map(c => glyphs.indexOf(c)).join("");
		v = util.ensure(parseInt(v), "int");
		return v;
	}
	set tsTop(v) {
		let glyphs = Array.from(new Array(10).keys()).map(i => bravura["timesig_"+i]);
		v = Math.max(0, util.ensure(v, "int"));
		v = String(v).split("").filter(c => util.NUMBERS.includes(c)).map(c => glyphs[c]).join("");
		this.eTSTop.textContent = v;
	}
	get tsBottom() {
		let glyphs = Array.from(new Array(10).keys()).map(i => bravura["timesig_"+i]);
		let v = this.eTSBottom.textContent;
		v = v.split("").filter(c => glyphs.includes(c)).map(c => glyphs.indexOf(c)).join("");
		v = util.ensure(parseInt(v), "int");
		return v;
	}
	set tsBottom(v) {
		let glyphs = Array.from(new Array(10).keys()).map(i => bravura["timesig_"+i]);
		v = Math.max(0, util.ensure(v, "int"));
		v = String(v).split("").filter(c => util.NUMBERS.includes(c)).map(c => glyphs[c]).join("");
		this.eTSBottom.textContent = v;
	}
	
	get clef() { return this.eClef.getAttribute("type"); }
	set clef(v) { this.eClef.setAttribute("type", v); }
	
	get blocks() { return [...this.#blocks]; }
	set blocks(v) {
		v = util.ensure(v, "arr");
		this.clearBlocks();
		v.forEach(v => this.addBlock(v));
	}
	clearBlocks() { this.blocks.forEach(block => this.remBlock(block)); }
	hasBlock(v) {
		if (!(v instanceof UIHandler.Staff.Block)) return false;
		return this.#blocks.includes(v);
	}
	addBlock(v) {
		if (!(v instanceof UIHandler.Staff.Block)) return false;
		if (this.hasBlock(v)) return false;
		this.#blocks.push(v);
		this.inner.appendChild(v.elem);
		return true;
	}
	remBlock(v) {
		if (!(v instanceof UIHandler.Staff.Block)) return false;
		if (!this.hasBlock(v)) return false;
		this.#blocks.splice(this.#blocks.indexOf(v), 1);
		this.inner.removeChild(v.elem);
		return true;
	}
	
	update(data) {
		this.post("update", data);
		this.blocks.forEach(block => {
			block.scroll = this.scroll;
			block.beatWidth = this.beatWidth;
			block.update();
		});
	}
};
UIHandler.Staff.Block = class UIHandlerBlock extends Target {
	#scroll;
	#beatWidth;
	
	#elem;
	
	constructor() {
		super();
		
		this.#scroll = 0;
		this.#beatWidth = 0;
		
		this.#elem = document.createElement("div");
		this.elem.classList.add("item");
		this.elem.style.top = "0px";
		this.elem.style.left = "0px";
	}
	
	get scroll() { return this.#scroll; }
	set scroll(v) {
		v = util.ensure(v, "num");
		if (this.scroll == v) return;
		this.#scroll = v;
	}
	get beatWidth() { return this.#beatWidth; }
	set beatWidth(v) {
		v = Math.max(0, util.ensure(v, "num"));
		if (this.beatWidth == v) return;
		this.#beatWidth = v;
	}
	
	get elem() { return this.#elem; }
	
	update(data) {
		this.post("update", data);
	}
};
UIHandler.Staff.Measure = class UIHandlerMeasure extends UIHandler.Staff.Block {
	#pos;
	
	#final;
	
	constructor(pos) {
		super();
		
		this.#pos = 0;
		
		this.#final = false;
		
		this.elem.classList.add("measure");
		
		this.addHandler("update", () => {
			this.elem.style.left = ((this.pos-this.scroll)*this.beatWidth)+"px";
			if (this.final) this.elem.classList.add("final");
			else this.elem.classList.remove("final");
		});
		
		this.pos = pos;
	}
	
	get pos() { return this.#pos; }
	set pos(v) {
		v = util.ensure(v, "num");
		if (this.pos == v) return;
		this.#pos = v;
	}
	
	get final() { return this.#final; }
	set final(v) {
		v = !!v;
		if (this.final == v) return;
		this.#final = v;
	}
}
UIHandler.Staff.Note = class UIHandlerNote extends UIHandler.Staff.Block {
	#note;
	
	#eGraphic1;
	#eGraphic2;
	#eContent;
	
	constructor(note) {
		super();
		
		this.#note = null;
		
		this.elem.classList.add("note");
		this.#eGraphic1 = document.createElement("div");
		this.elem.appendChild(this.eGraphic1);
		this.eGraphic1.classList.add("graphic");
		this.eGraphic1.style.visibility = "hidden";
		this.#eGraphic2 = document.createElement("div");
		this.elem.appendChild(this.eGraphic2);
		this.eGraphic2.classList.add("graphic");
		this.eGraphic2.style.visibility = "hidden";
		this.#eContent = document.createElement("div");
		this.elem.appendChild(this.eContent);
		this.eContent.classList.add("content");
		
		let changecheck = {
			name: null,
			octave: null,
			accidental: null,
			start: null,
			duration: null,
		};
		this.addHandler("update", () => {
			this.elem.style.left = (((
				this.scroll < this.note.start ?
					this.note.start :
				this.scroll > this.note.start+this.note.duration ?
					this.note.start+this.note.duration :
				this.scroll
			)-this.scroll)*this.beatWidth)+"px";
			this.elem.style.width = (this.note.duration*this.beatWidth)+"px";
			
			let all = true;
			for (let k in changecheck) {
				if (changecheck[k] == this.note[k]) continue;
				all = false;
				break;
			}
			if (all) return;
			for (let k in changecheck)
				changecheck[k] = this.note[k];
				
			let d = this.note.duration;
			let dlog = (d > 0) ? Math.round(Math.log2(d)) : null;
			let heads = [
				[bravura.notehead_1, 2],
				[bravura.notehead_2, 1],
				[bravura.notehead_4, 0],
			];
			let head = -1;
			heads.forEach((data, i) => {
				if (head < 0) return head = i;
				if (Math.abs(dlog-data[1]) < Math.abs(dlog-heads[head][1])) head = i;
			});
			head = heads[head][0];
			this.eContent.textContent = head+(head == bravura.notehead_1 ? "" : bravura.notestem);
			
			let index = "CDEFGAB".indexOf(this.note.name) + 7*this.note.octave;
			let c4index = "CDEFGAB".indexOf("C") + 7*4;
			let offset = index - c4index;
			this.elem.style.top = (-12.5*(offset-10))+"%";
		});
		
		this.note = note;
	}
	
	get note() { return this.#note; }
	set note(v) {
		v = (v instanceof Note) ? v : new Note(v);
		if (this.note == v) return;
		this.#note = v;
	}
	
	get eGraphic1() { return this.#eGraphic1; }
	get eGraphic2() { return this.#eGraphic2; }
	get eContent() { return this.#eContent; }
	
	get state() {
		if (this.elem.classList.contains("wrong")) return -1;
		if (this.elem.classList.contains("right")) return +1;
		return 0;
	}
	set state(v) {
		v = util.ensure(v, "int");
		if (Math.abs(v) > 1) return;
		this.elem.classList.remove("wrong");
		this.elem.classList.remove("right");
		if (v < 0) return this.elem.classList.add("wrong");
		if (v > 0) return this.elem.classList.add("right");
	}
};