const fs = require('fs')
	, path = require('path')
;

const configRelativePath = './config.json'
	, configPath = path.join(__dirname, configRelativePath)
;

function loadConfigFromFile(configs) {
	if(!fs.existsSync(configPath)) return;
	Object.assign(configs, require(configRelativePath));
}

function loadConfigFromEnvironmentVariables(configs) {
	var processConfigs = Object.assign({}, process.env);
	Object.keys(processConfigs).forEach(k => {
		var v = processConfigs[k].trim();
		try {
			configs[k] = /^{(\s|\S)*}$/.test(v) ? JSON.parse(v) : v;
		} catch(ex) {
			configs[k] = v;
		}
	});
}

module.exports = function() {
	var configs = {};
	loadConfigFromFile(configs);
	loadConfigFromEnvironmentVariables(configs);
	return configs;
}