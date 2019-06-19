'use strict';

const Homey = require('homey');
const life360 = require('life360-hack');
const MINUTE = 60000;

 

class FamilyIPhoneDriver extends Homey.Driver {

    async onInit() { 
        this.log('Init driver');

        this.registerFlowCards();

        this.settings = Homey.ManagerSettings.get('settings');

        Homey.ManagerSettings.on('set', (key) => {  
            console.log('Update Settings:');    
            console.log(key);

            if ( key === 'settings' ) {
                this.settings = Homey.ManagerSettings.get('settings')
                console.log('New settings:')
                console.log(this.settings)
            }
        });




        // Start syncing periodically.
        this.shouldSync = true;
        this.startSyncing();
    }

    async startSyncing() {
        // Prevent more than one syncing cycle.
        if (this.syncRunning) return;
    
        // Start syncing.
        this.syncRunning = true;
        this.log('starting sync');
        this.sync();
    }
    
    async sync() {
        if (! this.shouldSync || this.isSyncing) return;

        let synctime  = 1;
        if (this.settings)
            synctime = this.settings.synctime;

        this.isSyncing = true;
        this.log(`syncing (${synctime}min)`);
        try {
           await this.updateStatus().then(d => {
               this.log("update ok");
           }).catch(e => {
             this.log(`update error: ${e}`);
           });
        } catch(e) {
          this.log('error syncing', e);
        }
        this.isSyncing = false;
        this.log('ready syncing');
    
        // Schedule next sync.
        this.timeout = setTimeout(
          () => this.sync(),
           synctime*MINUTE
        );
    }

    async updateStatus() {
        var me=this;
        return new Promise(function(resolve, reject) {
         try {
                  //  can I reuse the session/?? Check!!      
                  life360.authenticate(username, password).then(session => {
                        circles.forEach(function (circleID) {
                            life360.circle(session, circleID).then(circle => {
                                circle.members.forEach(member => {
                                    // update devices
                                    let homeyDevice = this.getDevice({id: member.id});
                            		if (homeyDevice instanceof Homey.Device) {
                                            // update device
                                            homeyDevice.updateCloudData(member);
                                    } 
                                })
                            });    
                        });
                        resolve(true);
                  })
                  .catch(err => {
                    console.log(err);
                    reject(err);  
                  });
            } catch (error) {
                reject(error);
            }
        })
    }
 
    registerFlowCards() {
        this._triggers = {
           trgDeviceEntered : new Homey.FlowCardTriggerDevice("device_entered").register(),
           trgDeviceLeft : new Homey.FlowCardTriggerDevice("device_left").register(),
           trgDeviceBattery : new Homey.FlowCardTriggerDevice("triggerBattery").register(),
           trgDeviceCharging : new Homey.FlowCardTriggerDevice("BatteryCharging").register(),
        }
    
        this._conditions = {
          cndDeviceAtHome : new Homey.FlowCardCondition('DeviceAtHome').register().registerRunListener(( args, state ) => {
            if (args.device.hasOwnProperty("presense")) {
               return Promise.resolve(args.device.presense);
            }
          }),
          cndDeviceDistance : new Homey.FlowCardCondition('deviceDistance').register().registerRunListener(( args, state ) => {
            if (args.device.hasOwnProperty("distance")) {
                //console.log(`${args.device.distance} < ${args.distance}`);
                return Promise.resolve(args.device.distance < args.distance);
            } else {
                return Promise.resolve(false);
            }              
          }),
         }

         this._triggers.trgDeviceEntered.registerRunListener( ( args, state ) => {
            return Promise.resolve(true);
         });
         this._triggers.trgDeviceLeft.registerRunListener( ( args, state ) => {
            return Promise.resolve(true);
         });
         this._triggers.trgDeviceCharging.registerRunListener( ( args, state ) => {
            return Promise.resolve(true);
         });
    }

    onPair (socket) {
        this.log('Paring');
        let username
        let password
        let session

        socket.on('login', async (credentials, callback) => {
            username = credentials.username
            password = credentials.password
            try {
                session = await life360.authenticate(username, password);
                // save username and password in settings
                this.settings.username = username;
                this.settings.password = password
                Homey.ManagerSettings.set('settings',this.settings);
                callback(null, true)
            } catch (error) {
                this.error(error)
                callback(error)
            }
        })

        socket.on('list_devices', async (_, callback) => {
            try {
                let devices = [];

                const circles = await life360.circles(session);

                circles.forEach(function (circleID) {
                    life360.circle(session, circleID).then(circle => {
                        const devs = circle.members.map(m => ({
                            name: m.firstName,
                            data: { id: m.id},
                            settings: {circleID = circle.id }
                        }))
                        devices = devices.concat(devs);
                    });    
                });
                callback(null, devices)
            } catch (error) {
                this.error(error)
                callback(error)
            }
        })
    }
}


module.exports = FamilyIPhoneDriver;