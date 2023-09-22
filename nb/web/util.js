export const ALPHABETUPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const ALPHABETLOWER = ALPHABETUPPER.toLowerCase();
export const NUMBERS = "0123456789";
export const BASE64 = ALPHABETLOWER + ALPHABETUPPER + NUMBERS + "-_";

export const SUPPORTEDTYPES = ["num", "int", "float", "bool", "str", "arr", "obj", "func"];

export function is(o, type) {
	let typefs = {
		num: () => {
			if (typeof(o) != "number") return false;
			if (Number.isNaN(o)) return false;
			if (!Number.isFinite(o)) return false;
			return true;
		},
		int: () => {
			return typefs.num() && (o%1 == 0);	
		},
		float: () => {
			return typefs.num();
		},
		bool: () => {
			return typeof(o) == "boolean";
		},
		str: () => {
			return typeof(o) == "string";
		},
		arr: () => {
			return Array.isArray(o);	
		},
		obj: () => {
			return typeof(o) == "object" && o != null;	
		},
		func: () => {
			return typeof(o) == "function";
		},
	};
	if (type in typefs) return typefs[type]();
	return false;
}

const ENSUREDEFNOVAL = Symbol("ENSUREDEFNOVAL");

export function ensure(o, type, def=ENSUREDEFNOVAL) {
	let typefs = {
		num: () => {
			if (is(o, "num")) return o;
			return (def == ENSUREDEFNOVAL) ? 0 : def;
		},
		int: () => {
			if (is(o, "num")) return Math.round(o);
			return (def == ENSUREDEFNOVAL) ? 0 : def;
		},
		float: () => {
			return typefs.num();
		},
		bool: () => {
			return !!o;
		},
		str: () => {
			return String(o);
		},
		arr: () => {
			if (is(o, "arr")) return o;
			return (def == ENSUREDEFNOVAL) ? [] : def;
		},
		obj: () => {
			if (is(o, "obj")) return o;
			return (def == ENSUREDEFNOVAL) ? {} : def;
		},
		func: () => {
			if (is(o, "func")) return o;
			return (def == ENSUREDEFNOVAL) ? () => {} : def;
		},
	};
	if (type in typefs) return typefs[type]();
	return (def == ENSUREDEFNOVAL) ? null : def;
}

export function type(o) {
	for (let i = 0; i < SUPPORTEDTYPES.length; i++) {
		let type = SUPPORTEDTYPES[i];
		if (is(o, type)) return type;
	}
	return null;
}

export function lerp(a, b, p) {
	if (!is(a, "num")) return null;
	if (!is(b, "num")) return null;
	if (!is(p, "num")) return null;
	return a + p*(b-a);
}

export function lerpRGBA(rgba1, rgba2, p) {
	if (!is(rgba1, "arr")) return null;
	if (!is(rgba2, "arr")) return null;
	if (!is(p, "num")) return null;
	while (rgba1.length < 4) rgba1.push(255);
	while (rgba1.length > 4) rgba1.pop();
	while (rgba2.length < 4) rgba2.push(255);
	while (rgba2.length > 4) rgba2.pop();
	return Array.from(new Array(4).keys()).map(i => lerp(rgba1[i], rgba2[i], p));
}

export function jargon(l) {
	l = Math.max(0, ensure(l, "int"));
	return new Array(l).fill(null).map(_ => BASE64[Math.floor(BASE64.length*Math.random())]);
}

export function getTime() { return new Date().getTime(); }

export function playAudio(url, vol=1) {
	const audio = new Audio("assets/"+url+".mp3");
	audio.volume = volume;
	audio.play();
	return audio;
}

export function redirectTo(url, isnew=true) {
	let a = document.createElement("a");
	a.href = url;
	if (isnew) a.target = "_blank";
	a.click();
	return a;
}

export function fetchWithTimeout(file, time) {
	return Promise.race([
		fetch(file),
		new Promise((res, rej) => {
			setTimeout(() => {
				rej("timeout");
			}, time);
		}),
	]);
}

/*
export function getHash() {
	let hash = window.location.hash;
	if (hash.startsWith("#")) hash = hash.substr(1);
	return hash;
}
export function setHash(hash) {
	hash = String(hash);
	if (hash.length == 0)
		history.pushState(null, document.title, window.location.pathname+window.location.search);
	else window.location.hash = has;
}

export function getParams() {
	let params = new URLSearchParams(window.location.search);
	let data = {};
	Array.from(params.keys()).forEach(key => {
		data[key] = params.get(key);
	});
	return data;
}
export function setParams(data) {
	data = ensure(data, "obj");
	let params = new URLSearchParams();
	for (let key in data)
		params.set(key, data[key]);
	params = params.toString();
	history.pushState(null, document.title, window.location.pathname+(params.length > 0 ? "?"+params : ""));
	return params;
}

export function getPath() {
	return window.location.pathname.substr(1).split("/");
}
export function setPath(path) {
	path = "/"+ensure(path, "arr").join("/");
	if (window.location.pathname == path) return path;
	history.pushState(null, document.title, path));
	return path;
}
*/

export function getLocationData() {
	let path = window.location.pathname.substr(1).split("/");
	let oparams = new URLSearchParams(window.location.search);
	let params = {};
	Array.from(oparams.keys()).forEach(k => { params[k] = oparams.get(k); });
	let hash = window.location.hash.substr(1);
	return {
		path: path,
		params: params,
		hash: hash,
	};
}
export function setLocationData(data) {
	data = ensure(data, "obj");
	let path = "/"+ensure(data.path, "arr").join("/");
	let params = ensure(data.params, "obj");
	let oparams = new URLSearchParams();
	for (let k in params) oparams.set(k, params[k]);
	params = oparams.toString();
	if (params.length > 0) params = "?"+params;
	let hash = is(data.hash, "str") ? String(data.hash) : "";
	if (
		window.location.pathname == path &&
		window.location.search.substr(1) == params &&
		window.location.hash.substr(1) == hash
	) return false;
	history.pushState(null, document.title, path+params+hash);
	return true;
};

// console.log(getLocationData());
// setLocationData({ path: ["~", "jeffreyfan", "noteblaster-refactor", "index"] });

// https://stackoverflow.com/questions/7790811/how-do-i-put-variables-inside-javascript-strings
export function parse(str) {
	str = String(str);
    let args = [].slice.call(arguments, 1), i = 0;
    return str.replace(/%s/g, () => args[i++]);
}