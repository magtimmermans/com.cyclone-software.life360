var Life360Settings = {};
var defaultSettings = {
    "synctime": 3,
    "homerange": 100,
    "invisble": false,
    "username" : "",
    "password" : ""
};

function onHomeyReady( Homey ){
        console.log( "ready!" );
        showPanel(1);
        Homey.ready();

        Life360Settings = defaultSettings;
        Homey.get('settings', function(err, savedSettings) {
            if ( err ) {
                Homey.alert( err );
            } else {
                if (savedSettings != (null || undefined)) {
                    console.log('savedSettings:')
                    console.log(savedSettings)
                    Life360Settings = savedSettings;
                }
            }

            $("#username").val(Life360Settings.username);
            $("#password").val(Life360Settings.password);
            $("#synctime").val(Life360Settings.synctime);
            $("#invisble").val(Life360Settings.invisble);
            $("#homerange").val(Life360Settings.homerange);

         })

         $("#save").click(function(){
            console.log('Saving');

            Life360Settings.username = $("#username").val();
            Life360Settings.password = $("#password").val();
            Life360Settings.synctime = $("#synctime").val();
            Life360Settings.invisble = $("#invisble").val();
            Life360Settings.homerange = $("#homerange").val();

            Homey.set('settings', Life360Settings , function( err ){
                 if( err ) return Homey.alert( err );
            });
         });
}

function showLogs() {
	Homey.api('GET', 'getlogs/', (err, result) => {
		if (!err) {
			document.getElementById('loglines').innerHTML = '';
			for (let i = (result.length - 1); i >= 0; i -= 1) {
				document.getElementById('loglines').innerHTML += result[i];
				document.getElementById('loglines').innerHTML += '<br />';
			}
		}
	});
}
function deleteLogs() {
	Homey.api('GET', 'deletelogs/', (err) => {
		if (err) {
			Homey.alert(err.message, 'error'); 
		} else { Homey.alert('Logs deleted!', 'info'); }
	});
}

function showPanel(panel) {
	$('.panel').hide();
	$('.panel-button').removeClass('panel-button-active').addClass('panel-button-inactive');
	$('#panel-button-' + panel).removeClass('panel-button-inactive').addClass('panel-button-active');
	$('#panel-' + panel).show();
	if (panel === 2) {
		showLogs();
	}
}
