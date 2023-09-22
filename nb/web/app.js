import * as util from "./util.js";
import * as struct from "./struct.js";
import { Note, Song, Level } from "./struct.js";

import * as h from "./handlers.js";

/*

REMEMBER TO CREDIT:

IonIcons
https://ionic.io/ionicons

Voronoi Cells
https://github.com/gorhill/Javascript-Voronoi

*/

export const FLAGS = {
	DEVELOPER: true,
};

window.build = notes => {
	notes = String(notes).split(" ");
	let notes2 = [];
	for (let i = 0; i < notes.length; i++) {
		if (i%2 == 0) notes2.push([notes[i]]);
		else notes2.at(-1).push(parseFloat(notes[i]));
	}
	notes = notes2;
	let song = new Song();
	let t = 0;
	notes.forEach(data => {
		song.addNote(new Note(data[0], t, data[1]));
		t += data[1];
	});
	let level = new Level();
	level.song = song;
	level.meta.name = prompt("Level Name:");
	level.meta.author = prompt("Level Author:");
	console.log(JSON.stringify(level, null, "\t"));
};
window.buildTwinkle = () => {
	let section1 = [
		["C4", 1],
		["C4", 1],
		["G4", 1],
		["G4", 1],
		["A4", 1],
		["A4", 1],
		["G4", 2],
		["F4", 1],
		["F4", 1],
		["E4", 1],
		["E4", 1],
		["D4", 1],
		["D4", 1],
		["C4", 2],
	];
	let section2 = [
		["G4", 1],
		["G4", 1],
		["F4", 1],
		["F4", 1],
		["E4", 1],
		["E4", 1],
		["D4", 2],
	];
	let songdata = [
		...section1,
		...section2,
		...section2,
		...section1,
	];
	let song = new Song();
	let t = 0;
	songdata.forEach(data => {
		song.addNote(new Note(data[0], t, data[1]));
		t += data[1];
	});
	let level = new Level();
	level.song = song;
	console.log(JSON.stringify(level, null, "\t"));
};

export default class App extends h.Target {
	#LSHANDLER;
	#SETTINGSHANDLER;
	#RECORDERHANDLER;
	#GAMEHANDLER;
	#UIHANDLER;
	
	#wifiStatus;
	
	#mode;
	#modes;
	
	#levels;
	
	constructor() {
		super();
		
		h.DATA.App = this.constructor;
		
		this.#LSHANDLER = new h.LSHandler(this);
		
		this.#SETTINGSHANDLER = new h.SettingsHandler(this);
		
		this.#RECORDERHANDLER = new h.RecorderHandler(this);
		
		this.#GAMEHANDLER = new h.GameHandler(this);
		
		this.#UIHANDLER = new h.UIHandler(this);
		
		this.#wifiStatus = null;
		
		this.#mode = null;
		this.#modes = {};
		let modes = [
			"TITLE",
			"LOGIN", "JOIN",
			"BROWSE",
			"SETTINGS",
			"TUNER",
			"GAME",
		];
		modes.forEach(mode => { this.#modes[mode] = {}; });
		
		this.#levels = {};
		
		this.UIHANDLER.enabled = true;
		
		this.wifiStatus = false;
		
		if (FLAGS.DEVELOPER) window.app = this;
	}
	
	setup() {
		window.addEventListener("popstate", e => window.location.reload());
		
		document.body.onload = () => {
			this.hookModes();
			
			this.LSHANDLER.setup();
			this.SETTINGSHANDLER.setup();
			this.RECORDERHANDLER.setup();
			this.GAMEHANDLER.setup();
			
			this.UIHANDLER.setup();
			
			this.mode = "STARTUP";
			
			this.UIHANDLER.addHandler("topnav-login", data => {
				util.setLocationData({ path: ["login"] });
				this.mode = "URLCHECK";
			});
			this.UIHANDLER.addHandler("topnav-join", data => {
				util.setLocationData({ path: ["join"] });
				this.mode = "URLCHECK";
			});
			
			const settings = {
				animation: {
					type: "bool",
					default: true,
				},
				legacy: {
					type: "bool",
					default: false,
				},
				background: {
					type: "bool",
					default: true,
				},
			};
			let settingsdata = {};
			for (let name in settings) {
				let config = settings[name];
				let value = new h.SettingsHandler.Value();
				value.type = config.type;
				value.default = config.default;
				value.value = this.LSHANDLER.getSetting(name);
				this.SETTINGSHANDLER.addValue(name, value);
				settingsdata[name] = value.value;
				let view = new h.UIHandler.SettingsValue(name);
				if (this.UIHANDLER.hasPage("SETTINGS"))
					this.UIHANDLER.getPage("SETTINGS").addValue(name, view);
			}
			const updatesettings = () => {
				let settingsdata = {};
				this.SETTINGSHANDLER.values.forEach(name => {
					let v = this.SETTINGSHANDLER.getValue(name).value;
					settingsdata[name] = v;
					let namefs = {
						animation: () => {
							this.UIHANDLER.transition = (v ? 0.25 : 0);
						},
						legacy: () => {
							this.UIHANDLER.legacy = v;
						},
						background: () => {
							this.UIHANDLER.setBackgroundOn(v);
						},
					};
					if (name in namefs) namefs[name]();
					if (this.UIHANDLER.hasPage("SETTINGS"))
						this.UIHANDLER.getPage("SETTINGS").setValue(name, v);
				});
				this.LSHANDLER.setSettings(settingsdata);
			};
			this.SETTINGSHANDLER.addHandler("change", data => {
				data = util.ensure(data, "obj");
				let name = data.name;
				let from = data.data.from;
				let to = data.data.to;
				updatesettings();
			});
			updatesettings();
			this.UIHANDLER.addHandler("settings-change", data => {
				data = util.ensure(data, "obj");
				let name = data.name;
				let from = data.data.from;
				let to = data.data.to;
				if (!this.SETTINGSHANDLER.hasValue(name)) return;
				this.SETTINGSHANDLER.getValue(name).value = to;
			});
			
			this.UIHANDLER.addHandler("language-set", data => {
				data = util.ensure(data, "obj");
				this.LSHANDLER.setLanguage(data.lang);
			});
			
			let id = setTimeout(() => {
				this.UIHANDLER.introIn = true;
			}, 10);
			let done = false, start = util.getTime();
			
			let t = 0;
			this.addHandler("update", data => {
				let t2 = util.getTime();
				if (t2-t > 5000) {
					fetch(window.location)
						.then(() => {
							this.wifiStatus = true;
						})
						.catch(err => {
							this.wifiStatus = false;
						});
					t = t2;
				}
			});
			
			let t0 = util.getTime();
			const update = () => {
				let t1 = util.getTime();
				// console.log(Math.floor(1000 / (t1-t0)));
				this.update({ delta: (t1-t0) });
				t0 = t1;
				window.requestAnimationFrame(update);
				if (this.mode == "STARTUP") {
					if (util.getTime()-start > 500) {
						if (done) {
							this.UIHANDLER.introIn = false;
							
							this.mode = "URLCHECK";
						}
					}
				}
			};
			update();
			
			util.fetchWithTimeout("/nb/web/data/langs.json", 1000)
				.then(resp => resp.json())
				.then(data => {
					clearTimeout(id);
					
					this.UIHANDLER.setLanguageMaps(data);

					let lang = this.LSHANDLER.getLanguage();
					lang = this.UIHANDLER.hasLanguageMap(lang) ? lang : "en";
					this.UIHANDLER.setLanguage(lang);
					
					done = true;
				})
				.catch(err => {
					this.UIHANDLER.addNotification(new h.UIHandler.Notification("E", "%notification.startup-err.title%", "%notification.startup-err.info%: "+((err instanceof DOMException) ? err.name+" - "+err.message : err)));
				});
		};
	}
	
	update(data) {
		this.post("update", data);
		
		this.LSHANDLER.update();
		this.SETTINGSHANDLER.update();
		this.RECORDERHANDLER.update();
		this.GAMEHANDLER.update();
		
		this.UIHANDLER.update();
	}
	
	get LSHANDLER() { return this.#LSHANDLER; }
	get RECORDERHANDLER() { return this.#RECORDERHANDLER; }
	get UIHANDLER() { return this.#UIHANDLER; }
	get GAMEHANDLER() { return this.#GAMEHANDLER; }
	get SETTINGSHANDLER() { return this.#SETTINGSHANDLER; }
	
	get wifiStatus() { return this.#wifiStatus; }
	set wifiStatus(v) {
		v = !!v;
		if (this.wifiStatus == v) return;
		this.#wifiStatus = v;
		if (this.wifiStatus) this.post("wifi-on", {});
		else this.post("wifi-off", {});
		this.post("wifi-change", { from: !this.wifiStatus, to: this.wifiStatus });
	}
	
	ask(hand, cmd, args=null) {
		hand = String(hand).toUpperCase();
		cmd = String(cmd);
		args = util.ensure(args, "arr");
		if (!(this[hand] instanceof h.Handler)) return null;
		if (!(cmd in this[hand])) return null;
		if (!util.is(this[hand][cmd], "func")) return this[hand][cmd];
		return this[hand][cmd](...args);
	}
	
	get mode() { return this.#mode; }
	set mode(v) { this.setMode(v, null); }
	setMode(name, data) {
		name = String(name);
		data = util.ensure(data, "obj");
		if (this.mode == name) return;
		this.modeFrom();
		let fmode = this.mode;
		let fdata = util.ensure(this.#modes[fmode], "obj");
		this.#mode = name;
		this.modeTo(data, { mode: fmode, data: fdata });
	}
	hookModes() {
		for (let mode in this.#modes) {
			let state = this.#modes[mode];
			let modefs = {
				TITLE: () => {
					this.UIHANDLER.addHandler("title-play", data => {
						if (this.mode != "TITLE") return;
						util.setLocationData({ path: ["browse"] });
						this.mode = "URLCHECK";
					});
					this.UIHANDLER.addHandler("title-tuner", data => {
						if (this.mode != "TITLE") return;
						util.setLocationData({ path: ["tuner"] });
						this.mode = "URLCHECK";
					});
					this.UIHANDLER.addHandler("title-settings", data => {
						if (this.mode != "TITLE") return;
						util.setLocationData({ path: ["settings"] });
						this.mode = "URLCHECK";
					});
				},
				LOGIN: () => {
					this.UIHANDLER.addHandler("login-back", data => {
						if (this.mode != "LOGIN") return;
						history.back();
						this.mode = "URLCHECK";
					});
					this.UIHANDLER.addHandler("login-join", data => {
						if (this.mode != "LOGIN") return;
						util.setLocationData({ path: ["join"] });
						this.mode = "URLCHECK";
					});
				},
				JOIN: () => {
					this.UIHANDLER.addHandler("join-back", data => {
						if (this.mode != "JOIN") return;
						history.back();
						this.mode = "URLCHECK";
					});
					this.UIHANDLER.addHandler("join-login", data => {
						if (this.mode != "JOIN") return;
						util.setLocationData({ path: ["login"] });
						this.mode = "URLCHECK";
					});
				},
				BROWSE: () => {
					this.UIHANDLER.addHandler("browse-back", data => {
						if (this.mode != "BROWSE") return;
						util.setLocationData({ path: [] });
						this.mode = "URLCHECK";
					});
					
					let selected = null;
					state.getSelected = () => selected;
					state.setSelected = v => {
						v = String(v);
						v = this.hasLevel(v) ? v : null;
						if (state.getSelected() == v) return true;
						let from = selected, to = v;
						selected = to;
						this.post("browse-selected-set", { from: from, to: to });
						return true;
					};
					state.updateSelected = () => {
						if (!this.UIHANDLER.hasPage("BROWSE")) return false;
						let pg = this.UIHANDLER.getPage("BROWSE");
						pg.getLevels().forEach(level => { level.isThis = (level.id == state.getSelected()); });
						if (state.getSelected() == null) pg.disablePlay();
						else pg.enablePlay();
						this.post("browse-update-selected", null);
						return true;
					};
					this.UIHANDLER.addHandler("browse-level-click", data => {
						if (this.mode != "BROWSE") return;
						if (!util.is(data, "obj")) return;
						let id = data.id;
						if (state.getSelected() == id) state.setSelected(null);
						else state.setSelected(id);
						state.updateSelected();
					});
					state.clearSelected = () => {
						state.setSelected(null);
						state.updateSelected();
						this.post("browse-clear-selected", null);
						return true;
					};
					
					state.play = id => {
						if (!this.hasLevel(id)) return false;
						util.setLocationData({ path: ["game"], params: { id: id } });
						this.mode = "URLCHECK";
						return true;
					};
					this.UIHANDLER.addHandler("browse-level-play", data => {
						data = util.ensure(data, "obj");
						state.play(data.id);
					});
					this.UIHANDLER.addHandler("browse-play", data => {
						state.play(selected);
					});
					
					state.updateLiked = () => {
						if (!this.UIHANDLER.hasPage("BROWSE")) return false;
						let pg = this.UIHANDLER.getPage("BROWSE");
						let levels = pg.getLevels();
						levels.forEach(level => {
							level.liked = this.LSHANDLER.getIsLiked(level.id);
						});
						this.post("browse-update-liked", null);
						return true;
					};
					this.UIHANDLER.addHandler("browse-level-like", data => {
						if (this.mode != "BROWSE") return;
						if (!util.is(data, "obj")) return;
						let id = data.id;
						this.LSHANDLER.setIsLiked(id, !this.LSHANDLER.getIsLiked(id));
						state.updateLiked();
					});
					
					state.updateStars = () => {
						if (!this.UIHANDLER.hasPage("BROWSE")) return false;
						let pg = this.UIHANDLER.getPage("BROWSE");
						let levels = pg.getLevels();
						levels.forEach(level => {
							level.nStars = Math.floor(4*Math.random()); // this.LSHANDLER.getStars(level.id);
						});
						this.post("browse-update-stars", null);
						return true;
					};
					
					this.UIHANDLER.addHandler("browse-retry", data => state.retry());
					state.retry = () => {
						let has = this.UIHANDLER.hasPage("BROWSE");
						let pg = this.UIHANDLER.getPage("BROWSE");
						if (has) {
							pg.hideErrorDisplay();
							pg.showLoadingDisplay();
							pg.clearLevels();
						}
						this.fetchLevels()
							.then(_ => {
								if (has) {
									pg.hideLoadingDisplay();
									pg.clearLevels();
									this.levels.forEach(id => {
										let level = this.getLevel(id);
										let view = new h.UIHandler.Level(id, level);
										pg.addLevel(view);
									});
								}
								state.updateLiked();
								state.updateStars();
							})
							.catch(err => {
								if (has) {
									pg.showErrorDisplay();
									pg.setErrorInfo("%browse.error%: "+((err instanceof DOMException) ? err.name+" - "+err.message : err));
									pg.hideLoadingDisplay();
								}
							});
						state.clearSelected();
						this.post("game-retry", null);
					}
					this.addHandler("wifi-change", data => {
						if (!this.UIHANDLER.hasPage("BROWSE")) return;
						let pg = this.UIHANDLER.getPage("BROWSE");
						pg.setWifiStatus(data.to);
					});
				},
				SETTINGS: () => {
					this.UIHANDLER.addHandler("settings-back", data => {
						if (this.mode != "SETTINGS") return;
						util.setLocationData({ path: [] });
						this.mode = "URLCHECK";
					});
				},
				TUNER: () => {
					const on = () => {
						if (!this.UIHANDLER.hasPage("TUNER")) return;
						let pg = this.UIHANDLER.getPage("TUNER");
						pg.setMicState("on");
					};
					const off = () => {
						if (!this.UIHANDLER.hasPage("TUNER")) return;
						let pg = this.UIHANDLER.getPage("TUNER");
						pg.setMicState("off");
					};
					const wait = () => {
						if (!this.UIHANDLER.hasPage("TUNER")) return;
						let pg = this.UIHANDLER.getPage("TUNER");
						pg.setMicState("wait");
					};
					// this.RECORDERHANDLER.addHandler("disable", () => wait());
					this.RECORDERHANDLER.addHandler("enable", () => wait());
					this.RECORDERHANDLER.addHandler("disable-success", () => off());
					this.RECORDERHANDLER.addHandler("enable-success", () => on());
					this.RECORDERHANDLER.addHandler("enable-fail", data => {
						off();
						let err = data.err;
						if (err.name == "NotAllowedError")
							this.UIHANDLER.addNotification(new h.UIHandler.Notification("W", "%notification.mic-perms.title%", "%notification.mic-perms.info%"));
						else
							this.UIHANDLER.addNotification(new h.UIHandler.Notification("E", "%notification.mic-err.title%", "%notification.mic-err.info%: "+err.name+" - "+err.message));
					});
					this.UIHANDLER.addHandler("tuner-back", data => {
						if (this.mode != "TUNER") return;
						util.setLocationData({ path: [] });
						this.mode = "URLCHECK";
					});
					this.UIHANDLER.addHandler("tuner-mic-toggle", data => {
						if (this.mode != "TUNER") return;
						if (this.RECORDERHANDLER.enabled) this.RECORDERHANDLER.enabled = false;
						else this.RECORDERHANDLER.enabled = true;
					});
					this.addHandler("update", data => {
						data = util.ensure(data, "obj");
						let delta = Math.max(0, util.ensure(data.delta, "num"));
						if (!this.UIHANDLER.hasPage("TUNER")) return;
						let pg = this.UIHANDLER.getPage("TUNER");
						let output = this.RECORDERHANDLER.output;
						if (this.RECORDERHANDLER.enabled && util.is(output, "obj") && output.pitch >= 0) {
							pg.showNote();
							pg.showCents();
							pg.showHertz();
							pg.showBarInfo();
							if (this.mode == "TUNER") {
								pg.setNoteName("CCDDEFFGGAAB"[output.noteOctaveIndex]);
								pg.setNoteAccidental([0,1,0,1,0,0,1,0,1,0,1,0][output.noteOctaveIndex]);
								pg.setNoteOctave(output.octave-1);
								pg.setCents(output.centsOffset);
								pg.setHertz(output.pitch);
								
								if (!("noteIndex" in state)) {
									state.noteIndex = output.noteIndex;
									// state.time = util.getTime();
									state.good = state.mid = state.bad = 0;
								} else {
									let co = output.centsOffset/50;
									if (Math.abs(co) > 2/3) {
										state.bad += delta;
										pg.setInfoColor("var(--cr)");
									} else if (Math.abs(co) > 1/3) {
										state.mid += delta;
										pg.setInfoColor("var(--cy)");
									} else {
										state.good += delta;
										pg.setInfoColor("var(--cg)");
									}
									let cr = this.UIHANDLER.getColor("cr");
									let cy = this.UIHANDLER.getColor("cy");
									let cg = this.UIHANDLER.getColor("cg");
									if (cr == null || cy == null || cg == null);
									else {
										if (Math.abs(co) > 5/6) {
											pg.setBubbleColor(cr);
										} else if (Math.abs(co) > 3/6) {
											let t = 1 - ((Math.abs(co)-(3/6))/(2/6));
											pg.setBubbleColor(Array.from(new Array(3).keys()).map(i => util.lerp(cr[i], cy[i], t)));
										} else if (Math.abs(co) > 1/6) {
											let t = 1 - ((Math.abs(co)-(1/6))/(2/6));
											pg.setBubbleColor(Array.from(new Array(3).keys()).map(i => util.lerp(cy[i], cg[i], t)));
										} else {
											pg.setBubbleColor(cg);
										}
									}
									pg.setBubbleSize(util.lerp(1, 0.25, Math.abs(co)));
									let sum = Math.max(1, state.good + state.mid + state.bad);
									pg.setGoodSize(state.good / sum);
									pg.setMidSize(state.mid / sum);
									pg.setBadSize(state.bad / sum);
									pg.setPlayTime(Math.ceil(sum/1000));
								}
							}
						} else {
							// pg.setBubbleSize(0);
							pg.hideNote();
							pg.hideCents();
							pg.hideHertz();
							pg.hideBarInfo();
							
							delete state.noteIndex;
						}
					});
				},
				GAME: () => {
					this.UIHANDLER.addHandler("game-back", data => {
						if (this.mode != "GAME") return;
						util.setLocationData({ path: ["browse"] });
						this.mode = "URLCHECK";
					});
					this.UIHANDLER.addHandler("game-retry", data => {
						if (this.mode != "GAME") return;
						state.setId(state.getId());
					});
					let id = null;
					state.getId = () => id;
					state.setId = v => {
						v = String(v);
						v = this.hasLevel(v) ? v : null;
						id = v;
						state.reset();
						return true;
					};
					state.hasLevel = () => this.hasLevel(state.getId());
					state.getLevel = () => {
						if (!state.hasLevel()) return null;
						return this.getLevel(state.getId());
					};
					state.hasSong = () => state.hasLevel() && state.getLevel().hasSong();
					state.getSong = () => {
						if (!state.hasSong()) return null;
						return state.getLevel().song;
					};
					state.idValid = () => state.hasLevel() && state.hasSong();
					let start = null;
					state.getStart = () => start;
					state.started = () => (state.getStart() != null);
					state.stopped = () => !state.started();
					state.start = () => {
						if (state.started()) return false;
						start = util.getTime();
						return true;
					};
					state.stop = () => {
						if (state.stopped()) return false;
						start = null;
						return true;
					};
					state.getTime = () => {
						if (!state.started()) return null;
						return util.getTime() - state.getStart();
					};
					state.getBeat = () => {
						if (!state.started()) return null;
						if (!state.idValid()) return null;
						return state.getTime()/(60000/state.getSong().tempo);
					};
					state.getBeatScrolled = () => {
						if (!state.started()) return null;
						if (!state.idValid()) return null;
						return state.getBeat() - (state.getLevel().countdown*state.getSong().timeSig.top);
					};
					state.getBeatIndex = () => {
						if (!state.started()) return null;
						if (!state.idValid()) return null;
						return Math.floor(state.getBeatScrolled());
					};
					let reference = {};
					state.reset = () => {
						if (!this.UIHANDLER.hasPage("GAME")) return false;
						let pg = this.UIHANDLER.getPage("GAME");
						pg.hideInner();
						pg.clearStaffs();
						let staff = new h.UIHandler.Staff();
						pg.addStaff(staff);
						if (!state.idValid()) return false;
						let level = state.getLevel();
						let song = state.getSong();
						for (let i = 0; i <= level.length; i++) {
							let measure = new h.UIHandler.Staff.Measure(i*song.timeSig.top);
							measure.final = i >= level.length;
							staff.addBlock(measure);
						}
						let notes = song.notes;
						reference = {};
						notes.forEach((note, i) => staff.addBlock(reference[i] = new h.UIHandler.Staff.Note(note)));
						pg.setPreview(level.preview*song.timeSig.top);
						pg.setTempoNote(song.timeSig.bottom);
						pg.setTempoValue(song.tempo);
						state.stop();
						state.start();
						this.post("game-start", null);
						return true;
					};
					state.finish = () => {
						if (!this.UIHANDLER.hasPage("GAME")) return false;
						let pg = this.UIHANDLER.getPage("GAME");
						pg.showInner();
						pg.setNStars(Math.floor(4*Math.random()));
						let g = Math.random(), m = Math.random(), b = Math.random();
						let sum = g+m+b;
						pg.setGoodSize(g/sum);
						pg.setMidSize(m/sum);
						pg.setBadSize(b/sum);
						pg.setScroll(state.getLevel().length*state.getSong().timeSig.top);
						state.stop();
						this.post("game-finish", null);
						return true;
					};
					let beatIndexPrev = null;
					let finished = false;
					this.addHandler("update", data => {
						if (state.started() && state.idValid()) {
							let time = state.getTime();
							let beat = state.getBeat();
							let beatScrolled = state.getBeatScrolled();
							let beatIndex = state.getBeatIndex();
							if (this.UIHANDLER.hasPage("GAME")) {
								let pg = this.UIHANDLER.getPage("GAME");
								pg.setScroll(beatScrolled);
							}
							if (beatIndexPrev != beatIndex) {
								beatIndexPrev = beatIndex;
								this.post("game-beat", { beatIndex: beatIndex });
								if (!finished && beatIndex >= state.getLevel().length*state.getSong().timeSig.top) {
									finished = true;
									state.finish();
								}
							}
							if (this.RECORDERHANDLER.output) {
								let note = new struct.Note(this.RECORDERHANDLER.output.noteIndex);
								document.getElementById("_").innerHTML = `
									${note.name}
									${note.accidental}
									${note.octave}
								`;
							}
							state.getSong().notes.forEach((note, i) => {
								if (reference[i].state != 0) return;
								if (beatScrolled < note.start) return;
								if (beatScrolled > note.start+note.duration) reference[i].state = -1;
								if (!this.RECORDERHANDLER.output) return;
								if (note.index == this.RECORDERHANDLER.output.noteIndex) reference[i].state = +1;
							});
						} else {
							beatIndexPrev = null;
							finished = false;
						}
					});
				},
			};
			if (mode in modefs) modefs[mode]();
		}
	}
	modeFrom() {
		let state = util.ensure(this.#modes[this.mode], "obj");
		let modefs = {
			GAME: () => {
				this.RECORDERHANDLER.enabled = false;
			},
		};
		if (this.mode in modefs) modefs[this.mode]();
	}
	modeTo(data, from) {
		data = util.ensure(data, "obj");
		let state = util.ensure(this.#modes[this.mode], "obj");
		state.data = data;
		let modefs = {
			URLCHECK: () => {
				let data = util.getLocationData();
				let path = data.path;
				if (path.length != 1) {
					util.setLocationData({ path: [] });
					this.mode = "TITLE";
					return;
				}
				let loc = path[0];
				if (loc == "login") this.mode = "LOGIN";
				else if (loc == "join") this.mode = "JOIN";
				else if (loc == "browse") this.mode = "BROWSE";
				else if (loc == "settings") this.mode = "SETTINGS";
				else if (loc == "tuner") this.mode = "TUNER";
				else if (loc == "game") this.setMode("GAME", { id: data.params.id });
				else {
					util.setLocationData({ path: [] });
					this.mode = "TITLE";
				}
			},
			TITLE: () => {
				this.UIHANDLER.page = "TITLE";
				this.UIHANDLER.loggedOut = true;
				this.UIHANDLER.loggedIn = false;
				this.UIHANDLER.username = "noteblaster";
			},
			LOGIN: () => {
				this.UIHANDLER.page = "LOGIN";
				this.UIHANDLER.hideTopNav();
				if (!this.UIHANDLER.hasPage("LOGIN")) return;
				let pg = this.UIHANDLER.getPage("LOGIN");
				pg.hidePass();
				pg.setUsername("");
				pg.setPassword("");
				if (["LOGIN", "JOIN"].includes(from.mode)) state.back = from.data.back;
				else state.back = {
					mode: from.mode,
					data: from.data,
				};
			},
			JOIN: () => {
				this.UIHANDLER.page = "JOIN";
				if (!this.UIHANDLER.hasPage("JOIN")) return;
				let pg = this.UIHANDLER.getPage("JOIN");
				pg.hidePass();
				pg.setUsername("");
				pg.setPassword("");
				pg.setPasswordConf("");
				if (["LOGIN", "JOIN"].includes(from.mode)) state.back = from.data.back;
				else state.back = {
					mode: from.mode,
					data: from.data,
				};
			},
			BROWSE: () => {
				this.UIHANDLER.page = "BROWSE";
				state.retry();
			},
			SETTINGS: () => {
				this.UIHANDLER.page = "SETTINGS";
			},
			TUNER: () => {
				this.UIHANDLER.page = "TUNER";
				if (!this.UIHANDLER.hasPage("TUNER")) return;
				let pg = this.UIHANDLER.getPage("TUNER");
				pg.reset();
				this.RECORDERHANDLER.enabled = false;
			},
			GAME: () => {
				this.RECORDERHANDLER.enabled = true;
				this.UIHANDLER.page = "GAME";
				let id = data.id;
				state.setId(id);
				if (!state.hasLevel()) {
					util.setLocationData({ path: ["browse"] });
					this.mode = "URLCHECK";
					this.UIHANDLER.addNotification(new h.UIHandler.Notification("E", "%notification.level-err-1.title%", "%notification.level-err-1.info% (id:"+id+")"));
					return;
				}
				if (!state.hasSong()) {
					util.setLocationData({ path: ["browse"] });
					this.mode = "URLCHECK";
					this.UIHANDLER.addNotification(new h.UIHandler.Notification("E", "%notification.level-err-2.title%", "%notification.level-err-2.info% (id:"+id+")"));
					return;
				}
			},
		};
		if (this.mode in modefs) modefs[this.mode]();
	}
	
	get levels() { return Object.keys(this.#levels); }
	set levels(v) {
		v = util.ensure(v, "obj");
		this.clearLevels();
		for (let id in v) this.addLevel(id, v[id]);
	}
	clearLevels() { this.#levels = {}; return true; }
	hasLevel(v) {
		if (v instanceof Level) return Object.values(this.#levels).includes(v);
		if (util.is(v, "str")) return v in this.#levels;
		return false;
	}
	getLevel(id) {
		id = String(id);
		return this.#levels[id];
	}
	addLevel(id, v) {
		if (this.hasLevel(id) || this.hasLevel(v)) return false;
		this.#levels[id] = v;
		return true;
	}
	remLevel(v) {
		if (v instanceof Level) return this.remLevel(Object.keys(this.#levels)[Object.values(this.#levels).indexOf(v)]);
		if (util.is(v, "str")) {
			if (!this.hasLevel(v)) return false;
			let level = this.#levels[v];
			delete this.#levels[v];
			return level;
		}
		return false;
	}
	
	async fetchLevels() {
		/*
		let resp = await util.fetchWithTimeout("/nb/web/data/levels.json", 5000);
		let text = await resp.text();
		let data = JSON.parse(text, struct.reviver);
		let levels = {};
		if (util.is(data, "obj")) {
			for (let id in data) {
				let level = data[id];
				if (!(level instanceof Level)) continue;
				levels[id] = level;
			}
		}
		*/
		let resp = await util.fetchWithTimeout("/list-levels", 5000);
		let data = await resp.json();
		let levels = {};
		await Promise.all(util.ensure(data, "arr").map(async id => {
			let resp = await util.fetchWithTimeout("/nb/web/data/levels/"+id+".json", 5000);
			let text = await resp.text();
			let level = JSON.parse(text, struct.reviver);
			if (!(level instanceof Level)) return;
			levels[id] = level;
		}));
		this.levels = levels;
		return levels;
	}
}