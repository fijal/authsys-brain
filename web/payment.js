var wsuri;
if (document.location.origin == "file://") {
   wsuri = "ws://127.0.0.1:8080/ws";

} else {
   wsuri = (document.location.protocol === "http:" ? "ws:" : "wss:") + "//" +
               document.location.host + "/ws";
}


// the WAMP connection to the Router
//
var connection = new autobahn.Connection({
   url: wsuri,
   realm: "authsys",
   max_retries: -1,
   max_retry_delay: 3,
});

function show_error(err) {
    console.log(err);
}

connection.onopen = function (session, details) {
    connection.session.call("com.payments.get_form", [location.search.substr(1)]).then(
      function (r) {
        $("h1").text("");
        eval(r);
      }, show_error);
};

connection.open();

var wpwlOptions = {
      style: "card",
          onReady: function() {
            var x = location.search.substr(1).split("&")[1].split("=")[1];
            var numberOfInstallmentsHtml = '<div class="wpwl-label wpwl-label-custom" style="display:inline-block">Total payment now and every month: R' + x +
             '</div>';
            $('form.wpwl-form-card').find('.wpwl-button').before(numberOfInstallmentsHtml);
          }
    }