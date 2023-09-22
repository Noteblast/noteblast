import * as util from "./util.js";

export class Note {
	#name;
	#octave;
	#accidental;

	#start;
	#duration;
	
	constructor(...a) {
		if (a.length <= 0 || a.length == 4 || a.length == 2) a = [null];
		if (a.length == 1) {
			a = a[0];
			if (a instanceof Note) a = [a.name, a.octave, a.accidental, a.start, a.duration];
			else if (util.is(a, "str")) {
				let note = new Note();
				note.term = a;
				a = [note.name, note.octave, note.accidental, note.start, note.duration];
			} else if (util.is(a, "int")) {
				let note = new Note();
				note.index = a;
				a = [note.name, note.octave, note.accidental, note.start, note.duration];
			} else if (util.is(a, "arr")) {
				a = new Note(...a);
				a = [a.name, a.octave, a.accidental, a.start, a.duration];
			} else a = ["C", 4, ""];
		}
		if (a.length == 3) {
			if (util.is(a[0], "str") && util.is(a[1], "num") && util.is(a[2], "num")) {
				let note = new Note();
				note.term = a[0];
				[note.start, note.duration] = [a[1], a[2]];
				a = [note.name, note.octave, note.accidental, note.start, note.duration];
			} else a = [...a, 0, 0];
		}
		[this.name, this.octave, this.accidental, this.start, this.duration] = a;
	}

	get name() { return this.#name; }
	set name(v) {
		v = String(v).toUpperCase();
		if (v.length != 1) v = "C";
		if (!"CDEFGAB".includes(v)) v = "C";
		this.#name = v;
	}
	get octave() { return this.#octave; }
	set octave(v) {
		v = Math.max(0, util.ensure(v, "int"));
		if (this.octave == v) return;
		this.#octave = v;
	}
	get accidental() { return this.#accidental; }
	set accidental(v) {
		if (["sharp", "s", "#"].includes(v)) return this.accidental = +1;
		if (["flat", "f", "b"].includes(v)) return this.accidental = -1;
		if (["natural", "n", " ", ""].includes(v)) return this.accidental = 0;
		v = util.ensure(v, "int");
		if (Math.abs(v) > 1) v = 0;
		if (this.accidental == v) return;
		this.#accidental = v;
	}
	get index() {
		let i = 0;
		i += this.octave*12;
		i += { C:0, D:2, E:4, F:5, G:7, A:9, B:11 }[this.name];
		i += this.accidental;
		return i;
	}
	set index(i) {
		i = Math.max(0, util.ensure(i, "int"));
		this.octave = Math.floor(i/12);
		i %= 12;
		this.name = "CCDDEFFGGAAB"[i];
		this.accidental = " # #  # # # "[i];
	}
	get term() {
		return this.name+this.octave+["b","","#"][this.accidental+1];
	}
	set term(v) {
		v = String(v);
		let lenfs = {
			"1": [v[0], 4, ""],
			"2": [v[0], 4, v[1]],
			"3": [v[0], parseInt(v[1]), v[2]],
		};
		[this.name, this.octave, this.accidental] = (v.length in lenfs) ? lenfs[v.length] : [null, null, null];
	}

	get start() { return this.#start; }
	set start(v) {
		v = Math.max(0, util.ensure(v, "int"));
		if (this.start == v) return;
		this.#start = v;
	}
	get duration() { return this.#duration; }
	set duration(v) {
		v = Math.max(0, util.ensure(v, "int"));
		if (this.duration == v) return;
		this.#duration = v;
	}

	pitchEquals(n) {
		if (!(n instanceof Note)) return false;
		return n.index == this.index;
	}
	periodEquals(n) {
		if (!(n instanceof Note)) return false;
		return n.start == this.start && n.duration == this.duration;
	}
	equals(n) {
		if (!(n instanceof Note)) return false;
		return this.pitchEquals(n) && this.periodEquals(n);
	}
	
	toJSON() {
		return {
			"%CUSTOM": true,
			"%CONSTRUCTOR": this.constructor.name,
			"%ARGS": [this.name, this.octave, this.accidental, this.start, this.duration],
		};
	}
}

export class TimeSignature {
	#top;
	#bottom;
	
	constructor(top=null, bottom=null) {
		this.#top = 4;
		this.#bottom = 4;
		
		this.top = top;
		this.bottom = bottom;
	}

	get top() { return this.#top; }
	set top(v) {
		v = Math.max(1, util.ensure(v, "int", 4));
		if (this.top == v) return v;
		this.#top = v;
	}
	get bottom() { return this.#bottom; }
	set bottom(v) {
		v = Math.max(1, util.ensure(v, "int", 4));
		if (!util.is(Math.log2(v), "int")) return;
		if (this.bottom == v) return;
		this.#bottom = v;
	}
	
	toJSON() {
		return {
			"%CUSTOM": true,
			"%CONSTRUCTOR": this.constructor.name,
			"%ARGS": [this.top, this.bottom],
		};
	}
}

export class Song {
	#keySig;
	#timeSig;
	#tempo;
	#notes;
	
	constructor(notes=null, ks=null, ts=null, tempo=60) {
		this.#keySig = new Note();
		this.#timeSig = new TimeSignature();
		this.#tempo = 60;
		this.#notes = [];
		
		this.notes = notes;
		
		this.keySig = ks;
		this.timeSig = ts;
		
		this.tempo = tempo;
	}

	get keySig() { return this.#keySig; }
	set keySig(v) {
		v = (v instanceof Note) ? v : new Note(v);
		if (this.keySig == v) return;
		this.#keySig = v;
	}
	get keySigFullName() {
		return this.keySig.name + ["b","","#"][this.keySig.accidental+1];
	}
	get keySharps() {
		let sharpfs = {
			"G": "F",
			"D": "FC",
			"A": "FCG",
			"E": "FCGD",
			"B": "FCGDA",
			"F#": "FCGDAE",
			"C#": "FCGDAEB",
		};
		if (this.keySigFullName in sharpfs) return sharpfs[this.keySigFullName].split("");
		return [];
	}
	get keyFlats() {
		let flatfs = {
			"F": "B",
			"Bb": "BE",
			"Eb": "BEA",
			"Ab": "BEAD",
			"Db": "BEADG",
			"Gb": "BEADGC",
			"Cb": "BEADGCF",
		};
		if (this.keySigFullName in flatfs) return flatfs[this.keySigFullName].split("");
		return [];
	}
	get timeSig() { return this.#timeSig; }
	set timeSig(v) {
		v = (v instanceof TimeSignature) ? v : new TimeSignature();
		if (this.timeSig == v) return;
		this.#timeSig = v;
	}
	get tempo() { return this.#tempo; }
	set tempo(v) {
		v = Math.max(1, util.ensure(v, "int"));
		if (this.tempo == v) return;
		this.#tempo = v;
	}

	get notes() { return [...this.#notes]; }
	set notes(v) {
		v = util.is(v, "arr") ? Array.from(v) : [];
		this.#notes = v;
		this.sortNotes();
	}
	getNote(i) {
		i = util.ensure(i, "int", -1);
		if (i < 0 || i >= this.#notes.length) return null;
		return this.#notes[i];
	}
	setNote(i, note) {
		i = util.ensure(i, "int", -1);
		if (i < 0 || i >= this.#notes.length) return false;
		if (!(note instanceof Note)) return false;
		if (this.hasNote(note)) return false;
		this.#notes[i] = note;
		this.sortNotes();
		return true;
	}
	remNote(i) {
		i = util.ensure(i, "int", -1);
		if (i < 0 || i >= this.#notes.length) return null;
		let note = this.#notes[i];
		this.#notes.splice(i, 1);
		this.sortNotes();
		return note;
	}
	addNote(note) {
		if (!(note instanceof Note)) return false;
		if (this.hasNote(note)) return false;
		this.#notes.push(note);
		this.sortNotes();
		return true;
	}
	hasNote(note) {
		return this.#notes.includes(note);
	}
	sortNotes() {
		this.#notes.sort((a, b) => {
			let r;
			r = a.start - b.start;
			if (Math.abs(r) > 0) return r;
			r = a.duration - b.duration;
			if (Math.abs(r) > 0) return r;
			return 0;
		});
		return true;
	}
	get length() { return (this.#notes.length > 0) ? (this.#notes.at(-1).start+this.#notes.at(-1).duration) : 0; }
	
	toJSON() {
		return {
			"%CUSTOM": true,
			"%CONSTRUCTOR": this.constructor.name,
			"%ARGS": [this.notes, this.keySig, this.timeSig, this.tempo],
		};
	}
}

export class Level {
	#meta;
	#song;
	
	#countdown;
	#preview;
	
	constructor(song, countdown, preview, meta=null) {
		this.#meta = (meta instanceof Level.Meta) ? meta : new Level.Meta(...util.ensure(meta, "arr")); // new Level.Meta(...util.ensure(meta, "arr"));
		this.#song = null;

		this.#countdown = 2;
		this.#preview = 2;
		
		this.song = song;
		
		this.countdown = countdown;
		this.preview = preview;
	}

	get meta() { return this.#meta; }
	get song() { return this.#song; }
	set song(v) {
		v = (v instanceof Song) ? v : null;
		if (this.song == v) return;
		this.#song = v;
	}
	hasSong() { return this.song instanceof Song; }

	get countdown() { return this.#countdown; }
	set countdown(v) {
		v = Math.max(1, util.ensure(v, "int", 2));
		if (this.countdown == v) return;
		this.#countdown = v;
	}
	get preview() { return this.#preview; }
	set preview(v) {
		v = Math.max(1, util.ensure(v, "int", 2));
		if (this.preview == v) return;
		this.#preview = v;
	}

	get length() { return this.hasSong() ? Math.ceil(this.song.length/this.song.timeSig.top) : 0; }
	
	toJSON() {
		return {
			"%CUSTOM": true,
			"%CONSTRUCTOR": this.constructor.name,
			"%ARGS": [this.song, this.countdown, this.preview, this.meta],
		};
	}
}
Level.Meta = class Meta {
	#name;
	#author;
	#songName;
	#songAuthor;
	
	constructor(name="Level", author="Author", songname="Song", songauthor="Dude") {
		this.#name = null;
		this.#author = null;
		this.#songName = null;
		this.#songAuthor = null;
		
		this.name = name;
		this.author = author;
		this.songName = songname;
		this.songAuthor = songauthor;
	}

	get name() { return this.#name; }
	set name(v) {
		v = (v == null) ? null : String(v);
		if (this.name == v) return;
		this.#name = v;
	}
	get author() { return this.#author; }
	set author(v) {
		v = (v == null) ? null : String(v);
		if (this.author == v) return;
		this.#author = v;
	}
	get songName() { return this.#songName; }
	set songName(v) {
		v = (v == null) ? null : String(v);
		if (this.songName == v) return;
		this.#songName = v;
	}
	get songAuthor() { return this.#songAuthor; }
	set songAuthor(v) {
		v = (v == null) ? null : String(v);
		if (this.songAuthor == v) return;
		this.#songAuthor = v;
	}
	
	toJSON() {
		return {
			"%CUSTOM": true,
			"%CONSTRUCTOR": this.constructor.name,
			"%ARGS": [this.name, this.author, this.songName, this.songAuthor],
		};
	}
};


const REVIVALS = {};
[
	Note,
	Song,
	Level,
	Level.Meta,
].forEach(cls => {
	REVIVALS[cls.name] = cls;	
});
export function reviver(k, v) {
	if (util.is(v, "obj")) {
		if (!("%CUSTOM" in v)) return v;
		if (!("%CONSTRUCTOR" in v)) return v;
		if (!("%ARGS" in v)) return v;
		if (!v["%CUSTOM"]) return v;
		if (!(v["%CONSTRUCTOR"] in REVIVALS)) return v;
		return new REVIVALS[v["%CONSTRUCTOR"]](...util.ensure(v["%ARGS"], "arr"));
	}
	return v;
}