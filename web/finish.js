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
    connection.session.call("com.payments.check_status", [window.location.search.substr(1)]).then(function (r)
    {
      if (r[0]) {
        $("h1").text("Success!");
      } else {
        $("h1").text("Failure, ask operator");
      }
      setTimeout("location.href = '" + r[1] + "';", 1000);
    }, show_error);
};

connection.open();