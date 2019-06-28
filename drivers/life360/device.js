// Device.js
'use strict';

const Homey = require('homey');
const util = require('util')

const SPEED_FACTOR_MS = 3.6;  // m/s => km/h

const formatValue = t => Math.round(t.toFixed(1) * 10) / 10;
const formatValue3 = t => Math.round(t.toFixed(1) * 1000) / 1000;
const closeHome = 100;
let i = 0;

class Life360Dev extends Homey.Device {

    async onInit() {
        this.log(`Init device ${this.getName()}`);
        this.presense = null;
        this.charging = null;
        this.place = null;


		let data = this.getData();
		console.log(data);

        this.settings = Object.assign({}, data);
        this.distance = 100000;
        this.batteryPercentage = 100;
        this.minBatTrigger = false;

        await this.setAvailable();

        // Get driver.
        this.driver = await this._getDriver();

        this.driver._triggers.trgDeviceBattery.registerRunListener(this.onBatteryCheck.bind(this));

    }

    // Get a (ready) instance of the driver.
    async _getDriver() {
        return new Promise(resolve => {
        let driver = this.getDriver();
        driver.ready(() => resolve(driver));
        });
    }

    onBatteryCheck(args,state)
    {
        try {
            this.argPercentage = args.batteryPercentage;
           
            this.log(`battery %:${this.batteryPercentage} < argPerc:${this.argPercentage}`);
            if (this.batteryPercentage<this.argPercentage && !this.minBatTrigger) {
               this.minBatTrigger = true;
               return Promise.resolve(true);
            } else
            {
                if (this.batteryPercentage>=this.argPercentage) { 
                    this.minBatTrigger=false;
                }
                return Promise.resolve(false);
            }             
        } catch (error) {
            console.log(error);
        }
    }

    onSettings( oldSettingsObj, newSettingsObj, changedKeysArr, callback ) {
        callback( null, true );
    }

    onAdded() {
        this.log(`New device added: ${this.getName()} - ${this.getData().id} `);
    }

    onDeleted() {
        this.log('device deleted');
    }

    updateCloudData(clouddata) {
        this.log(`Updating device: ${clouddata.firstName}`);
        //console.log(util.inspect(clouddata, false, null, true /* enable colors */))

        try {
            if (clouddata)
            {
                this.cloudData = clouddata;

               // i=i+1;
               // this.log(clouddata);
               // clouddata.location.speed=10.12325467468578975;
            //    if ((i % 1)==0) clouddata.location.name='';
            //    if ((i % 2)==0) clouddata.location.name='Home';
            //    if ((i % 3)==0) clouddata.location.name='Work';

            //   console.log(clouddata.location.name);

             // clouddata.location.isDriving='1';


                if (clouddata.location) {
                    let myLatitude = Homey.ManagerGeolocation.getLatitude();
                    let myLongitude = Homey.ManagerGeolocation.getLongitude();

                    let isDriving = !!+clouddata.location.isDriving;
                    let WiFiState = !!+clouddata.location.wifiState;
                    let Moving = !!+clouddata.location.inTransit;

                    clouddata.location.speed = clouddata.location.speed * SPEED_FACTOR_MS;

                    // temporary fix until API shows isDriving mode
                    if (clouddata.location.speed>20)  isDriving=true; 

                    this.distance = this.FGCD(myLongitude,myLatitude,clouddata.location.longitude, clouddata.location.latitude);
                    this.setPresence(this.distance);
                    //console.log(this.distance);

                    this.setCapabilityValue("Distance", this.formatDistance(this.distance)).catch(e => {
                        this.log(`Unable to set Distance: ${ e.message }`);
                    });

                    this.setCapabilityValue("DistanceKM", formatValue3(this.distance/1000)).catch(e => {
                        this.log(`Unable to set DistanceKM: ${ e.message }`);
                    });

                    this.setCapabilityValue("wifiState", Homey.__(this.getState(WiFiState))).catch(e => {
                        this.log(`Unable to set wifiState: ${ e.message }`);
                    });

                    this.setCapabilityValue("driving", Homey.__(this.getState(isDriving))).catch(e => {
                        this.log(`Unable to set driving: ${ e.message }`);
                    });

                    this.setCapabilityValue("transit", Homey.__(this.getState(Moving))).catch(e => {
                        this.log(`Unable to set transit: ${ e.message }`);
                    });

                    this.setCapabilityValue("place", clouddata.location.name).catch(e => {
                        this.log(`Unable to set place: ${ e.message }`);
                    });

                    this.setCapabilityValue("accuracy", parseInt(clouddata.location.accuracy)).catch(e => {
                        this.log(`Unable to set accuracy: ${ e.message }`);
                    });
                    
        
                    var d = new Date(0); // The 0 there is the key, which sets the date to the epoch
                    d.setUTCSeconds(clouddata.location.timestamp);
        
                    let lastSeen = this.toLocalTime(d).toISOString().replace('T', ' ').substr(0, 19)
        
                    this.setCapabilityValue("lastSeen", lastSeen).catch(e => {
                        this.log(`Unable to set lastSeen: ${ e.message }`);
                    });

                    
                    this.setCapabilityValue("drvSpeed", clouddata.location.speed>1 ? Math.round(clouddata.location.speed) : 0).catch(e => {
                        this.log(`Unable to set driveSpeed: ${ e.message }`);
                    });


                    if (this.place == null) this.place = clouddata.location.name;

                    if (this.place != clouddata.location.name) {

                       // console.log(`place:${this.place} -> locname:${clouddata.location.name}`)

                        this.driver._triggers.trgDeviceArrivesPlace.trigger(this, {"place" : clouddata.location.name},{"places" : clouddata.location.name, "oldplace" : this.place}).catch((err) => {
                            console.log(`err: ${err}`);
                        });;

                        this.driver._triggers.trgDeviceLeftPlace.trigger(this, {"place" :  this.place},{"places" : clouddata.location.name, "oldplace" : this.place}).catch((err) => {
                            console.log(`err: ${err}`);
                        });;

                    }


                }


                let batt = Math.round(clouddata.location.battery);
                let batteryStatus = "Charged";
                //console.log(`batt:${batt}, batteryPercentage ${this.batteryPercentage}`);
                if (batt<100) {
                    (clouddata.location.charge=='1') ? batteryStatus="Charging" : batteryStatus="NotCharging";
                } else {
                    if (this.batteryPercentage!=batt)
                    {
                        this.driver._triggers.trgBatteryCharged.trigger(this, {}, {}).catch(this.error );
                    }
                }

                let charging = (batteryStatus === "Charging") || (batteryStatus==="Charged");

                if (this.charging===null)
                    this.charging = charging;
                else if (!this.charging && charging) {
                    // charging
                    this.charging=charging;
                    this.driver._triggers.trgDeviceCharging.trigger(this,{}).catch(this.error);
                    this.log('Charging/Full');
                } else if (this.charging && !charging) {
                    // discharge
                    this.log('Discharge');
                    this.charging=charging;
                }

				this.setCapabilityValue('batteryCharged', Homey.__(batteryStatus)).catch((e) => {
					this.log(`Unable to set batteryCharged: ${e.message}`);
				});


                this.batteryPercentage = Math.round(clouddata.location.battery);
                this.place = clouddata.location.name;

                //if (this.getCapabilityValue('measure_battery') !== this.batteryPercentage) { 
                    this.driver._triggers.trgDeviceBattery.trigger(this, { "batteryPercentage": this.batteryPercentage }, { "batteryPercentage": this.batteryPercentage }).catch(this.error );
                //}


				this.setCapabilityValue('measure_battery', this.batteryPercentage).catch((e) => {
					this.log(`Unable to set measure_battery : ${e.message}`);
				});

			}
		} catch (error) {
			this.log(error);
		}
	}

    getState(state){
        return (state === false) ? "Off" : "On";
    }

    setPresence(distance){

        let range = 100;
        if (this.driver.settings)
            range = this.driver.settings.homerange;

        let newPresence = (distance<range);

        this.log(`Name: ${this.getName()}, Presence:${this.presence}, new Presence: ${newPresence}, range:${range},distance ${formatValue(distance)}`);


        if (this.presence === undefined) {
            this.log('Unkown presence');
        } else if (this.presence && !newPresence) {
            this.log('Leaving');
            this.driver._triggers.trgDeviceLeft.trigger(this, {}).catch(this.error );
        } else if (!this.presence && newPresence){
            this.log('coming home');
            this.driver._triggers.trgDeviceEntered.trigger(this, {}).catch(this.error );
        } 
        this.presence= newPresence;
    }

    // Get distance between 2 coordinates. Not very accurate but a least very fast :)
    FGCD(dlong1,dlat1,dlong2,dlat2) {
        let c = dlong1 - dlong2;
        let d = dlat1 - dlat2;
        c = c * 66.997;
        d = d * 111.3;
        return(Math.sqrt((d * d) + (c * c))*1000); // in meters
    }

    toLocalTime(time){
       var offset = new Date().getTimezoneOffset() * 60 * 1000 * -1;
       var n = new Date(time.getTime() + offset);
       return n;
    }

    formatDistance(distance) {
        if (distance<1000)
         return formatValue(distance) + 'm';
        else 
         return formatValue(distance/1000) + 'km';
    }

      // Set a capability value, optionally formatting it.
    async setValue(cap, value) {
        if (value == null) return;
        if (typeof value === 'number') {
            value = formatValue(value);
        }
        if (this.getCapabilityValue(cap) !== value) {
            await this.setCapabilityValue(cap, value).catch(e => {
                this.log(`Unable to set capability '${ cap }': ${ e.message }`);
            });
        }
    }
}

module.exports = Life360Dev;
