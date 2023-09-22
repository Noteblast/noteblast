// https://github.com/cwilso/PitchDetect/blob/main/js/pitchdetect.js

export function frequencyToNote(freq) {
	const note = 12 * (Math.log(freq / 440) / Math.log(2));
	return Math.round(note) + 69;
}

export function noteToFrequency(note) {
	return 440 * Math.pow(2, (note - 69) / 12);
}

export function centsOffsetFromNote(freq, note) {
	return Math.floor(1200 * Math.log(freq / noteToFrequency(note)) / Math.log(2));
}

export function autoCorrelate(buff, samplerate) {
	let SIZE = buff.length;
	let rms = 0;

	for (let i = 0; i < SIZE; i++) {
		let val = buff[i];
		rms += val ** 2;
	}
	rms = Math.sqrt(rms / SIZE);
	if (rms < 0.01) return -1;

	let r1 = 0,
		r2 = SIZE - 1,
		thresh = 0.2;
	for (let i = 0; i < SIZE / 2; i++)
		if (Math.abs(buff[i]) < thresh) { r1 = i; break; }
	for (let i = 1; i < SIZE / 2; i++)
		if (Math.abs(buff[SIZE - i]) < thresh) { r2 = SIZE - i; break; }

	buff = buff.slice(r1, r2);
	SIZE = buff.length;

	let c = new Array(SIZE)
		.fill(0);
	for (let i = 0; i < SIZE; i++)
		for (let j = 0; j < SIZE - i; j++)
			c[i] += buff[j] * buff[j + i];

	let d = 0;
	while (c[d] > c[d + 1]) d++;
	let maxval = -1,
		maxpos = -1;
	for (let i = d; i < SIZE; i++) {
		if (c[i] > maxval) {
			maxval = c[i];
			maxpos = i;
		}
	}
	let T0 = maxpos;
	T0 = Math.min(c.length-2, Math.max(1, T0));

	let x1 = c[T0 - 1],
		x2 = c[T0],
		x3 = c[T0 + 1];
	let a = (x1 + x3 - 2 * x2) / 2;
	let b = (x3 - x1) / 2;
	if (a) T0 = T0 - b / (2 * a);

	return samplerate / T0;
}

export function getDataFromBuffer(buff, samplerate) {
	let ac = autoCorrelate(buff, samplerate);
	if (ac == -1) {
		return {
			pitch: -1,
			noteIndex: -1,
			noteOctaveIndex: -1,
			octave: -1,
			centsoffset: 0,
		};
	}
	let pitch = ac;
	let note = frequencyToNote(pitch);
	return {
		pitch: pitch,
		noteIndex: note,
		noteOctaveIndex: note % 12,
		octave: Math.floor(note / 12),
		centsOffset: centsOffsetFromNote(pitch, note),
	};
}

export function test() {
	const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

	const pitch = document.getElementById("pitch");
	const note = document.getElementById("note");
	const noteName = document.getElementById("notename");
	const cents = document.getElementById("cents");
	const canvas = document.getElementById("canvas");
	const ctx = canvas.getContext("2d");

	let STREAM, RECORDER, AUDIOCTX, SOURCE, ANALYZER;

	let micOutput, analyzerOutput;
	
	let noteArray;
	let sameNote, sameStreak, sameThresh;

	function update() {
		ANALYZER.getFloatTimeDomainData(micOutput);
		analyzerOutput = getdata(micOutput, AUDIOCTX.sampleRate);

		// C4 is middle C

		pitch.innerText = analyzerOutput.pitch + "Hz";
		note.innerText = analyzerOutput.noteIndex;
		noteName.innerHTML = noteNames[analyzerOutput.note % 12] + "<sup>" + (Math.floor(analyzerOutput.note / 12) - 1) + "</sup>";
		cents.innerText = Math.abs(analyzerOutput.centsOffset) + " " + (analyzerOutput.centsOffset < 0 ? "flat" : "sharp");
		
		if (Math.abs(analyzerOutput.note-sameNote) <= (analyzerOutput.noteIndex < 0 ? 0 : 2)) {
			sameStreak += 1;
			sameThresh = Math.max(0, sameThresh - (1-Math.abs(analyzerOutput.noteIndex-sameNote)));
		} else {
			sameNote = analyzerOutput.noteIndex;
			sameStreak = 0;
			sameThresh = 30;
		}
		noteArray.push([sameNote >= 0 && sameStreak >= sameThresh, analyzerOutput.noteIndex]);
		noteArray.shift();
		
		ctx.fillStyle = "rgb(0, 0, 0)";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		
		ctx.lineWidth = 5;
		ctx.lineCap = ctx.lineJoin = "round";
		let down;
		
		ctx.strokeStyle = "rgb(255, 0, 0)";
		down = false;
		for (let i = 0; i < noteArray.length; i++) {
			let n0 = noteArray[i][1];
			let n1 = (i+1 < noteArray.length) ? noteArray[i+1][1] : -1;
			if (n0 < 0) continue;
			let x = i / (noteArray.length-1);
			let y = n0 / 96;
			if (down) {
				ctx.lineTo(canvas.width*x, canvas.height*y);
			} else {
				ctx.beginPath();
				ctx.moveTo(canvas.width*x, canvas.height*y);
				down = true;
			}
			if (n1 < 0) {
				ctx.stroke();
				down = false;
			}
		}
		ctx.strokeStyle = "rgb(0, 255, 0)";
		down = false;
		for (let i = 0; i < noteArray.length; i++) {
			let s0 = noteArray[i][0];
			let s1 = (i+1 < notearr.length) ? noteArray[i+1][0] : false;
			let n0 = noteArray[i][1];
			let n1 = (i+1 < notearr.length) ? noteArray[i+1][1] : -1;
			if (n0 < 0 || !s0) continue;
			let x = i / (notearr.length-1);
			let y = n0 / 96;
			if (down) {
				ctx.lineTo(canvas.width*x, canvas.height*y);
			} else {
				ctx.beginPath();
				ctx.moveTo(canvas.width*x, canvas.height*y);
				down = true;
			}
			if (n1 < 0 || !s1) {
				ctx.stroke();
				down = false;
			}
		}

		window.requestAnimationFrame(update);
	}

	navigator.mediaDevices.getUserMedia({
			audio: true,
		})
		.then((stream) => {
			STREAM = stream;
			RECORDER = new MediaRecorder(STREAM);
			AUDIOCTX = new AudioContext({
				sampleRate: 44100,
			});
			SOURCE = AUDIOCTX.createMediaStreamSource(STREAM);
			ANALYZER = AUDIOCTX.createAnalyser();
			ANALYZER.maxdecibels = -10;
			ANALYZER.mindecibels = -90;
			ANALYZER.smoothingTimeConstant = 0;
			SOURCE.connect(ANALYZER);
			ANALYZER.fftSize = 2048;
			RECORDER.start();

			micOutput = new Float32Array(ANALYZER.fftSize);
			
			noteArray = new Array(300).fill(-1);
			sameNote = -1;
			sameStreak = 0;
			sameThresh = 30;

			window.requestAnimationFrame(update);
		});
}