<div>
	<h1 align=”center”>Noteblast</h1>
	<p align=”center”>A Musical Game</p>
</div>

## Getting Started

If your operating system is based on `Windows`:

Install [Node.js](<https://nodejs.org/en/download>) if you do not already have Node on your PC

Create a `Noteblast` folder on the PC desktop

![image](https://github.com/Noteblast/noteblast/assets/105407466/35a7f78d-254b-4783-b62f-1f8450f11c2c)

Go to the [Noteblast repository](<https://github.com/Noteblast/noteblast>)

On the top right corner, click the green `<> Code` button and click “Download ZIP” to get a local copy of the project

![image](https://github.com/Noteblast/noteblast/assets/105407466/b42c572c-e866-4163-afcc-48fd38ad65a5)

Extract the ZIP file, and move the extracted file to the previously created `Noteblast` folder.

Open the `Noteblast` folder in an IDE of choice, [VSC](<https://code.visualstudio.com/>) is a good option if you do not already have one installed.

Open a new terminal in your IDE

![image](https://github.com/Noteblast/noteblast/assets/105407466/865c5716-91f9-4134-b46a-db60c144e259)

Type `cd nb` in terminal and press enter

![image](https://github.com/Noteblast/noteblast/assets/105407466/456aeac0-bce5-443d-bdbe-bc70f5358e8c)

Type `npm i` in terminal and press enter

![image](https://github.com/Noteblast/noteblast/assets/105407466/fa8688d4-ef2b-4a60-827f-0d4dcee64cde)

Type `node server.js` in terminal and press enter

![image](https://github.com/Noteblast/noteblast/assets/105407466/7f11f0bc-0d13-47d2-9fa6-ea9d6a098f41)

Navigate to `localhost:8425` in a browser of choice

Enjoy Noteblast!



## Capabilities

Tuner(cents,pitch,freq,hz)
> Describe all the terms in Tuner


Gameplay(Real-time correctness indication, create your own song(?), cloud accounts,) 
> Go in depth in how the game works. 


## Our Mission

Our mission was to create an engaging music app to help with sharpening instrument playing skills. Through games where the user needs to play the notes being flashed across the screen with their instrument. With Noteblast, an instrument player would easily be able to recognize issues in their sound and resolve it effectively and accurately.

## Documentation

The main script which is being run upon the window’s loading is `app.js`. The app script provides a default export: `App`, which extends the `Target` class from `app.js`. Logic, including global application state, different handlers, and game logic is included within this code.  

Most of the separated logic is located in `handlers.js`. This includes the export of `Target`, a generic event target of which one can dispatch events with a name and some object as the payload. Additionally, `handlers.js` also provides `Handler`, the parent of all different handler types.  

The core algorithms and math of our program is located in `analyzer.js`, where we define specific functions which compute frequency, note, and cents of user microphone input.  

Many commonly used data types in both `handlers.js` and `app.js` are located in `struct.js`. Here, you can find `Note`, `TimeSignature`, `Song`, `Level`, and a reviver function for each, which allows them to be stored properly as `JSON`.  

For any utility functions needed in all of the aforementioned scripts, we find them in `util.js`. Here, you can find the alphabet, base64 character sets, type-casting functions, among other useful utilities.  

Below is the entire documentation for each class from low to high level:  


## `struct.js`:

### `class Note`

#### Constructors:
```js
constructor(noteToCopy: Note)
constructor(term: string)
constructor(index: int)
constructor(term: string, start: number, duration: number)
constructor(name: string, octave: int, accidental: -1 | 0 | +1)
constructor(name: string, octave: int, accidental: -1 | 0 | +1, start: number, duration: number)
```

#### Members:

`pitchEquals(note: Note): boolean`  
Returns a boolean as to whether both notes' `.index` values are identical  
  
`periodEquals(note: Note): boolean`  
Returns a boolean as to whether both notes' periods are the same, meaning they start and last the same amount of time  
  
`equals(note: Note): boolean`  
Returns a boolean as to whether both notes satisfy `pitchEquals` and `periodEquals`  


### `class TimeSignature`

#### Constructors:
```js
constructor(top: number, bottom: number)
```

#### Members:


### `class Song`

#### Constructors:
```js
constructor(notes: Note[], keySig: Note, timeSig: TimeSignature, tempo: number)
```

#### Members:


### `class Level`

#### Constructors:
```js
constructor(song: Song, countdown: number, preview: number, meta: Meta | any[])
```

#### Members:


### `class Level.Meta`

#### Constructors:
```js
constructor(levelName: string, levelAuthor: string, songName: string, songAuthor: string)
```

#### Members:


## `handlers.js`

### `class Target`

#### Constructors:
```js
constructor()
```

#### Members:

`addHandler(event: string, callback: function): boolean`  
Adds a callback to the event `event` and returns a boolean as to whether or not that operation was successful  
  
`remHandler(event: string, callback: function): boolean`
Removes a callback to the event `event` and returns a boolean as to whether or not that operation was successful  
  
`hasHandler(event: string, callback: function): boolean`
Returns whether or not the event `event` with a callback `callback` exists  
  
`post(event: string, data: Object): null`
Posts event `event` with data `data` to all hooked callbacks


### `class Handler`

#### Constructors:
```js
constructor(app: App)
```

#### Members:

`setup(data: any): null`


