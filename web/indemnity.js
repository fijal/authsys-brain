var signaturePad;

function update_data(r)
{
    var no = r;
    var d = document.location.host;
    window.location = "http://" + d + "/update?id=" + no;
}

$(document).ready(function () {
    var wrapper = document.getElementById("signature-pad"),
        clearButton = wrapper.querySelector("[data-action=clear]"),
        saveButton = wrapper.querySelector("[data-action=save]"),
        canvas = wrapper.querySelector("canvas");

    // Adjust canvas coordinate space taking into account pixel ratio,
    // to make it look crisp on mobile devices.
    // This also causes canvas to be cleared.
    function resizeCanvas() {
        // When zoomed out to less than 100%, for some very strange reason,
        // some browsers report devicePixelRatio as less than 1
        // and only part of the canvas is cleared then.
        var ratio =  Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d").scale(ratio, ratio);
    }

    window.onresize = resizeCanvas;
    resizeCanvas();

    signaturePad = new SignaturePad(canvas);

    clearButton.addEventListener("click", function (event) {
        signaturePad.clear();
    });

    $('.iagree').on('click', function(e){
      var ia = $(e.target).closest('.iagree')
      if (ia.hasClass('accepted')) {
        ia.removeClass('accepted').find('input').prop('checked',false)
      } else {
        ia.addClass('accepted').removeClass('error').find('input').prop('checked',true)
      }
    })

    $('.spam').on('click', function(e){
        var ia = $(e.target).closest('.spam').find('input')
        ia.prop('checked', !ia.prop('checked'))
    });

    $('#name').on('keydown', function(){
      $('#name-input').removeClass('error');
      $("#error").removeClass('show');
    });
    $('#surname').on('keydown', function(){
      $('#surname-input').removeClass('error');
      $("#error").removeClass('show');
    });
    $('#phone').on('keydown', function(){
      $('#phone-input').removeClass('error');
      $("#error").removeClass('show');
    });
    $("#emergency-phone").on('keydown', function(){
      $('#emergency-phone-input').removeClass('error');
      $("#error").removeClass('show');
    });
    $('#id_no').on('keydown', function(){
      $('#id-input').removeClass('error');
      $("#error").removeClass('show');
    });
    $('#email').on('keydown', function(){
      $('#email-input').removeClass('error');
      $("#error").removeClass('show');
    });
    const urlParams = new URLSearchParams(window.location.search);

    $("#gym_id").val(urlParams.get('gym_id'));


    function do_poll()
    {
      $.post('/signup/poll?gym_id=' + urlParams.get('gym_id')).done(function (data) {
        data = JSON.parse(data);
        if (data.redirect == 'bank') {
          window.location = `/bank_details.html?name=${data.name}&next_monday=${data.next_monday}&contact-number=${data.contact_number}&member_id=${data.member_id}&price=${data.price}&subscription_type=${data.subscription_type}`;
        } else if (data.redirect == 'photo') {
          window.location = `/video.html?member_id=${data.member_id}&gym_id=${data.gym_id}`;
        } else {
          console.log(data);
          setTimeout(do_poll, 500);
        }
      }).fail(function (arg) {
        setTimeout(do_poll, 5000);
      });
    }
    if (urlParams.get('refresh'))
      do_poll();
});

function save_signature()
{
    var preMessage = 'You have errors:<br><br>'
    var inputs = $("form").find("input");
    var errors = [];

    $("#error").html("");

    if ($(".iagree input:checkbox:not(:checked)") .length > 0) {
      $(".iagree input:checkbox:not(:checked)") .parent().addClass('error');
      errors.push("Please agree to all sections");
    }
    if (!inputs[0].value) {
        errors.push("<a href='#name-input'><i class='icon-up'></i> Please provide your first name.</a>");
        $("#name-input").addClass('error');
    }
    if (!inputs[1].value) {
        errors.push("<a href='#surname-input'><i class='icon-up'></i> Please provide your surname.</a>");
        $("#surname-input").addClass('error');
    }
    if (!inputs[2].value) {
        errors.push("<a href='#id-input'><i class='icon-up'></i> Please provide your South African ID number or passport number.</a>");
        $("#id-input").addClass('error');
    }
    if (!$('#email').val()) {
        errors.push("<a href='#email-input'><i class='icon-up'></i> Please provide your email address.</a>");
        $("#email-input").addClass('error');
    }
    if ($('#email').val().indexOf("@") == -1) {
        errors.push("<a href='#email-input'><i class='icon-up'></i> Email address must be valid.</a>");
        $("#email-input").addClass('error');
    }
    if (!$('#phone').val()) {
        errors.push("<a href='#phone-input'><i class='icon-up'></i> Please provide phone number</a>");
        $("#phone-input").addClass('error');
    }
    if (!$('#emergency-phone').val()) {
        errors.push("<a href='#emergency-phone-input'><i class='icon-up'></i> Please provide emergency phone number</a>");
        $("#emergency-phone-input").addClass('error');
    }
    
    if (signaturePad.isEmpty()) {
        errors.push("<a href='#signature-input'><i class='icon-up'></i> Signature cannot be empty.</a>");
        $("#error").addClass('show');
    }
    if (errors.length > 0) {
      $("#error").addClass('show');
      $("#error").html(preMessage + errors.join('<br>'))
      return false;
    }
    $("#error").removeClass('show');
    $("#progress").html("Uploading signature...");
    $.post("/signup/upload_signature", signaturePad.toDataURL(), function(res) {
        $("#input-filename")[0].value = res;
        $("#submit-button")[0].onclick = undefined;
        $("#submit-button").click();
    })
    return false;
}
