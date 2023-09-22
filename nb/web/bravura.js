const bravura = {
	// clefs
	
	clef_treble: "",
	clef_alto: "",
	clef_base: "",
	
	// time signatures
	
	// numbers
	timesig_0: "",
	timesig_1: "",
	timesig_2: "",
	timesig_3: "",
	timesig_4: "",
	timesig_5: "",
	timesig_6: "",
	timesig_7: "",
	timesig_8: "",
	timesig_9: "",
	// commons
	timesig_common: "",
	timesig_cutcommon: "",
	
	// note heads
	
	// normal
	notehead_1: "",
	notehead_whole: "notehead_1",
	
	notehead_2: "",
	notehead_half: "notehead_2",
	
	notehead_4: "",
	notehead_black: "notehead_4",
	
	// x heads
	notehead_xwhole: "",
	notehead_x1: "notehead_xwhole",
	
	notehead_xhalf: "",
	notehead_x2: "notehead_xhalf",
	
	notehead_xblack: "",
	notehead_x4: "notehead_xblack",
	
	// note stem
	
	notestem: "",
	
	// note flags
	
	noteflag_8: "",
	noteflag_8down: "",
	
	noteflag_16: "",
	noteflag_16down: "",
	
	noteflag_32: "",
	noteflag_32down: "",
	
	noteflag_64: "",
	noteflag_64down: "",
	
	// rests
	
	rest_1: "",
	rest_whole: "rest_1",
	
	rest_2: "",
	rest_half: "rest_2",
	
	rest_4: "",
	rest_quarter: "rest_4",
	
	rest_8: "",
	
	rest_16: "",
	
	rest_32: "",
	
	rest_64: "",
	
	// notes (single symbol)
	
	note_1: "",
	note_whole: "note_1",
	
	note_2: "",
	note_half: "note_2",
	note_2down: "",
	note_halfdown: "note_2down",
	
	note_4: "",
	note_quarter: "note_4",
	note_4down: "",
	note_quarterdown: "note_4down",
	
	note_8: "",
	note_8down: "",
	
	note_16: "",
	note_16down: "",
	
	note_32: "",
	note_32down: "",
	
	note_64: "",
	note_64down: "",
	
	// accidentals
	
	flat: "",
	natural: "",
	sharp: "",
	
	// articulation
	
	artic_accentabove: "",
	artic_accent: "",
	artic_staccatoabove: "",
	artic_staccato: "",
	artic_tenutoabove: "",
	artic_tenuto: "",
	
	// dynamics
	
	dynam_piano: "",
	dynam_mezzo: "",
	dynam_forte: "",
	dynam_rinforzando: "",
	dynam_sforzando: "",
	dynam_pppppp: "",
	dynam_ppppp: "",
	dynam_pppp: "",
	dynam_ppp: "",
	dynam_pp: "",
	dynam_p: "dynam_piano",
	dynam_mp: "",
	dynam_mf: "",
	dynam_f: "dynam_forte",
	dynam_ff: "",
	dynam_fff: "",
	dynam_ffff: "",
	dynam_fffff: "",
	dynam_ffffff: "",
};
for (let name in bravura)
	if (bravura[name].length > 1) {
		// console.log("aliasing symbol "+name+" to "+bravura[name]);
		bravura[name] = bravura[bravura[name]];
	}
export default bravura;