
const urlParams = new URLSearchParams(window.location.search);

function do_poll(origin)
{

  $.post('/signup/poll?gym_id=' + urlParams.get('gym_id') + "&origin=" + origin).done(function (data) {
    data = JSON.parse(data);
    if (data.redirect == 'bank') {
      var gym_id = urlParams.get('gym_id');
      window.location = `/bank_details.html?name=${data.name}&next_monday=${data.next_monday}&contact-number=${data.contact_number}&member_id=${data.member_id}&price=${data.price}&subscription_type=${data.subscription_type}&gym_id=${gym_id}`;
    } else if (data.redirect == 'photo') {
      window.location = `/video.html?member_id=${data.member_id}&gym_id=${data.gym_id}&what_for=${data.what_for}`;
    } else {
      console.log(data);
      setTimeout(do_poll, 500);
    }
  }).fail(function (arg) {
    setTimeout(do_poll, 5000);
  });
}