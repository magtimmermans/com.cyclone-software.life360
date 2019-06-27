'use strict';

const Homey = require('homey');
const Logger = require('./captureLogs.js');

class Life360App extends Homey.App {
	
	onInit() {
		this.log(`${ Homey.manifest.id } V${Homey.manifest.version} is running...`);
		// try {
		// 		require('inspector').open(9229, '0.0.0.0', false);	
		// } catch (error) {
		// 	console.log(error);
		// }

		this.logger = new Logger('log', 50);

		// global crash handling
		process.on('uncaughtException', (err) => {
			this.error(`Caught exception: ${err}\n`);
		});

		process.on('unhandledRejection', (reason, p) => {
			this.error('Unhandled Rejection at:', p, 'reason:', reason);
		});

		Homey
			.on('unload', () => {
				this.log('app unload called');
				// save logs to persistant storage
				this.logger.saveLogs();
			})
			.on('memwarn', () => {
				this.log('memwarn!');
			})
			.on('cpuwarn', () => {
				this.log('cpu warning');
			});
	}

	//  stuff for frontend API
	deleteLogs() {
		return this.logger.deleteLogs();
	}

	getLogs() {
		return this.logger.logArray;
	}
}

module.exports = Life360App;
