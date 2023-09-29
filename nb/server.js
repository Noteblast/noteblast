const express = require('express'),
	bodyParser = require('body-parser'),
	cookieParser = require('cookie-parser'),
	path = require('path'),
	Configs = require('./config.js'),
	api = require('./api.js')
;

const app = express(),
	{ createServer } = require('http')
;

const configs = Configs(), 
	http = createServer(app),
	port = configs.PORT || 8080
;

app.set('trust proxy',true );
app.set('case sensitive routing', true);
app.disable('x-powered-by');

app.use((req, res, next) => {
	res.set('Server', 'Noteblaster');
	next();
});

if(configs.REQUIREHTTPS === 'true') {
	app.use(function(req, res, next) {
		
		if(req.headers['x-forwarded-proto'] !== 'https') {
			return res.redirect(`https://${req.get('host')}${req.url}`)
		}
		next();
	})
}		
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(cookieParser());

app.use('/nb/web', express.static(path.join(__dirname, './web')));

api.initialize();
api.addRoutes(app);

http.listen(port);


