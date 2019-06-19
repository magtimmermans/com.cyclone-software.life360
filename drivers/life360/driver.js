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

        if (!this.settings) {
            this.settings = {
                "synctime": 3,
                "homerange": 100,
                "invisble": false,
                "username" : "",
                "password" : ""
            };
        }


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
                  life360.authenticate(me.settings.username, me.settings.password).then(session => {
                       life360.circles(session).then(circles =>{
                         circles.forEach(function (objCircle) {
                            life360.circle(session, objCircle.id).then(circle => {
                                circle.members.forEach(member => {
                                    // update devices
                                    let homeyDevice = me.getDevice({id: member.id});
                            		if (homeyDevice instanceof Homey.Device) {
                                            // update device
                                            homeyDevice.updateCloudData(member);
                                    } 
                                })
                            });    
                        });
                        resolve(true);                          
                       });
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

        socket.on('list_devices', (_, callback) => {
            try {
                let devices = [];

                life360.circles(session).then(async(circles) => {
                    if (circles.length == 0) {
                        callback(new Error("No circles in your Life360."));
                    }        
                    await asyncForEach(circles,async(objCircle) => {
                        const devs = await life360.circle(session, objCircle.id).then(circle => {
                            return circle.members.map(m => ({
                                name: m.firstName,
                                data: { id: m.id},
                                settings: {circleID : circle.id }
                            }))
                        });
                        devices = devices.concat(devs);    
                        console.log(devices);
                    });
                    callback(null, devices)
                });
                //callback(null, devices)
            } catch (error) {
                this.error(error)
                callback(error)
            }
        })
    }
}

const asyncForEach = async (array, callback) => {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array)
    }
}


module.exports = FamilyIPhoneDriver;