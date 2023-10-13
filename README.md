<div>
	<h1 align="center">Noteblast</h1>
	<p align="center">A Musical Game</p>
</div>

## Getting Started

Basic steps, not explained clearly yet(ima be honest i forgot some of the steps):  
Clone git, get ide if not already have  
Install node  
Create a “noteblast” folder in pc, copy project files into there  
Open project in ide, pull latest code  
Open new terminal  
Type `cd nb` in terminal, press enter  
Type `npm i` in terminal, press enter  
Type `node server.js` in terminal, press enter  
Go to localhost:8425 in browser  
epic  


## Capabilities



Tuner(cents,pitch,freq,hz)
Gameplay(Real-time correctness indication, create your own song(?), cloud accounts,) 

## Our Mission

Our mission was to create an engaging music app to help with sharpening instrument playing skills. Through games where the user needs to play 

## Documentation

The main script which is being run upon the window’s loading is `app.js`. The app script provides a default export: `App`, which extends the `Target` class from `app.js`. Logic, including global application state, different handlers, and game logic is included within this code.  

Most of the separated logic is located in `handlers.js`. This includes the export of `Target`, a generic event target of which one can dispatch events with a name and some object as the payload. Additionally, `handlers.js` also provides `Handler`, the parent of all different handler types.  

The core algorithms and math of our program is located in `analyzer.js`, where we define specific functions which compute frequency, note, and cents of user microphone input.  

Many commonly used data types in both `handlers.js` and `app.js` are located in `struct.js`. Here, you can find `Note`, `TimeSignature`, `Song`, `Level`, and a reviver function for each, which allows them to be stored properly as `JSON`.  

For any utility functions needed in all of the aforementioned scripts, we find them in `util.js`. Here, you can find the alphabet, base64 character sets, type-casting functions, among other useful utilities.  

Below is the entire documentation for each class from low to high:  

### `class Note`

Possible parameters:
```js
constructor(noteToCopy: Note)
constructor(term: string)
constructor(index: int)
constructor(term: string, start: number, duration: number)
constructor(name: string, octave: int, accidental: -1 | 0 | +1)
constructor(name: string, octave: int, accidental: -1 | 0 | +1, start: number, duration: number)
```

