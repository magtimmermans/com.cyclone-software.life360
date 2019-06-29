'use strict';

const Homey = require('homey');
const life360 = require('life360-hack');
const MINUTE = 60000;


class Life360Driver extends Homey.Driver {

  
    async onInit() { 
        this.log('Init driver');

        this.registerFlowCards();

        this.placeTokens = [];
        this.session = {};// null;

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

        console.log('start session');
        await this.getSession().then(s =>{
            console.log('ok session');
            console.log(s);
            this.session=s;
        });
        console.log('end session');

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

        this.isSyncing = true;
        let synctime  = 1;
 
        try {
            if (this.settings)
                synctime = this.settings.synctime;

             this.log(`syncing (${synctime}min)`);

            await this.updateStatus().then(d => {this.log("update ok");}).catch(e => {this.log(`update error: ${e}`);});
            await this.updatePlaces().then(t => {
                this.placeTokens = t;
            }).catch(e => {this.log(`update place error: ${e}`);});
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
                  //life360.authenticate(me.settings.username, me.settings.password).then(session => {
                    me.getSession().then(session => {
                       life360.circles(session).then(circles =>{
                         circles.forEach(function (objCircle) {
                            life360.circle(session, objCircle.id).then(circle => {
                                circle.members.forEach(async(member) => {
                                    // update devices
                                    let homeyDevice = me.getDevice({id: member.id});
                            		if (homeyDevice instanceof Homey.Device) {
                                            // update device
                                            await homeyDevice.updateCloudData(member);
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

    async updatePlaces() {
        var me=this;
        return new Promise(function(resolve, reject) {
         try {
                 let tokens = [];
                  //  can I reuse the session/?? Check!!      
                  //life360.authenticate(me.settings.username, me.settings.password).then(session => {
                  me.getSession().then(session => {
                    life360.circles(session).then(async(circles) => {
                        if (circles.length == 0) {
                            callback(new Error("No circles in your Life360."));
                        }        
                        await asyncForEach(circles,async(objCircle) => {
                            const places = await life360.places(session, objCircle.id).then(places => {
                                return places.map(p => ({
                                    id: p.id,
                                    name: p.name,
                                    radius: Number(p.radius)
                                }))
                            });
                            tokens = tokens.concat(places);    
                        });
                        resolve(tokens);
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
           trgDeviceLeftPlace : new Homey.FlowCardTriggerDevice("device_left_place").register(),
           trgDeviceArrivesPlace : new Homey.FlowCardTriggerDevice("device_arrives_place").register(),
           trgBatteryCharged : new Homey.FlowCardTriggerDevice("triggerBatteryCharged").register(),         
        }

        this._triggers.trgDeviceLeftPlace.getArgument('places').registerAutocompleteListener(( query, args ) => {
            let items = this.placeTokens.map(p => ({
                id: p.id,
                name : p.name
            }))
            return Promise.resolve(items);
         })

         this._triggers.trgDeviceLeftPlace.registerRunListener(( args, state ) => {
            // console.log(`left place ${args.places.name} - ${state.places} (${state.oldplace})`);

            // If true, this flow should run
            let result = (args.places.name === state.oldplace) && (args.places.name != state.places)    
            //console.log(result);

            return Promise.resolve(result);
          })

         this._triggers.trgDeviceArrivesPlace.getArgument('places').registerAutocompleteListener(( query, args ) => {
            let items = this.placeTokens.map(p => ({
                id: p.id,
                name : p.name
            }))
            return Promise.resolve(items);
         })

         this._triggers.trgDeviceArrivesPlace.registerRunListener(( args, state ) => {
            // If true, this flow should run
            //console.log(`Arrives place ${args.places.name} - ${state.places}`);
            return Promise.resolve(args.places.name == state.places);
          })

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

    async getSession() {
        try {
            if (!this.session)
            {
                this.log('new session');
                return await life360.authenticate(this.settings.username, this.settings.password);
            }
            else
            {
                // testing session with gettings Circles
                return await life360.circles(this.session).then(async(c) => {
                    if (!c) {
                        this.session =  await life360.authenticate(this.settings.username, this.settings.password);  
                        this.log('reactived session')
                        return this.session;
                    } //else //console.log(`reuse session ${c}`);
                    return this.session;       
                }); 
            }           
        } catch (error) {
            console.log(error);
            return await life360.authenticate(this.settings.username, this.settings.password);
        }  
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


module.exports = Life360Driver;