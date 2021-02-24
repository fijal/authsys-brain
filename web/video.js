var streaming = false;

var width = window.innerWidth * 8 / 10; // We will scale the photo width to this
var height = 0; // This will be computed based on the input stream

var video = null;
var canvas = null;
var photo = null;
var startbutton = null;
var gym_id = null;

function startup() {
    video = document.getElementById('video');
    canvas = document.getElementById('pic-capture-canvas');
    photo = document.getElementById('photo');
    startbutton = document.getElementById('startbutton');
    var url_search_params = new URLSearchParams(window.location.search);
    gym_id = url_search_params.get("gym_id");
    var what_for = url_search_params.get("what_for");
    $("#what-for").html(what_for);
    $("#what-for-2").html(what_for);
    do_poll("photo " + what_for);


    // access video stream from webcam
    navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        })
        // on success, stream it in video tag
        .then(function(stream) {
            video.srcObject = stream;
            video.play();
        })
        .catch(function(err) {
            console.log("An error occurred: " + err);
        });

    video.addEventListener('canplay', function(ev) {
        if (!streaming) {
            width = video.videoWidth;
            height = video.videoHeight;

            video.setAttribute('width', width);
            video.setAttribute('height', height);
            canvas.setAttribute('width', width);
            canvas.setAttribute('height', height);
            streaming = true;
        }
    }, false);

}

function take_picture() {
    $("#take-pic-row").hide();
    $("#confirm-pic-row").css("display", "flex");
    var context = canvas.getContext('2d');
    if (width && height) {
        canvas.setAttribute("width", Math.min(video.videoWidth, width));
        canvas.setAttribute("height", height);
        context.drawImage(video, 0, 0, width, height);
    }
    $("#video-stream").hide();
    $("#pic-capture").css("display", "flex");
}

function restart_process() {
    $("#confirm-pic-row").hide();
    $("#take-pic-row").css("display", "flex");
    $("#video-stream").css("display", "flex");
    $("#pic-capture").hide();
}

function save_picture() {
    $("#save-picture-button").attr("disabled", true);
    var data = canvas.toDataURL('image/png');
    var url_search_params = new URLSearchParams(window.location.search)
    var member_id = url_search_params.get("member_id");
    var what_for = url_search_params.get('what_for');
    var name = url_search_params.get('name');
    $.post("/signup/photo?member_id=" + member_id + "&what_for=" + what_for, data, function (res) {
        window.location = '/signup/thankyou_photo?gym_id=' + gym_id + '&name=' + name;
    });
}

window.addEventListener('load', startup, false);