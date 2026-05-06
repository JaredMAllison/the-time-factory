// canvas and ctx are declared with var so they are window-scoped globals
// accessible to all scripts regardless of load order.
var canvas = document.getElementById('play-area');
var ctx    = canvas.getContext('2d');
