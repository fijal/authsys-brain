// the URL of the WAMP Router (Crossbar.io)
//
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

function Status()
{
   // move last_healtcheck here
   this.get_form_timestamp = 0;

   this.reset = function() {
      this.get_form_timestamp = 0;
      $("#errorbar").text("");
   };
}

var global_status = new Status();


function list_members_async()
{
   connection.session.call('com.members.list').then(function(res) {
      var r = "<ul>"
      for (var i in res) {
         r += "<li>" + res[i][0] + "</li>";
      }
      r += "</ul>"
      $("#placeholder").html(r);
   }, function(res) {
      $("#placeholder").text(res);
   });
}

function show_form(no)
{
   connection.session.call('com.forms.get', [no]).then(function(res) {
      var r = ("Name: " + res[1] + "<br/>" + "ID no: " + res[2] +
         "<br/><div id='form_get_parent'><span id='form_get_scanner' class='red'>Please scan tag now</span></div>" +
         "<form onclick='return false;''>" +
         "<input id='form_get_submit' disabled=true type=submit onclick='return add_member_async(); 'value='add member'/></form>")
      $("#member_add_list").html(r);
      global_status.get_form_timestamp = new Date() / 1000;
      global_status.member_id = res[0];
      global_status.member_name = res[1];
   }, show_error);
   return false;
}

function list_indemnity_forms()
{
   connection.session.call('com.forms.list').then(function(res) {
      var r = "<ul>";
      for (var i in res) {
         var elem = res[i];
         var ts = new Date(elem[3] * 1000);
         r += ('<li><a href="#" onclick="return show_form(' + elem[0] + ')">' + elem[1] + 
               ', ID number: ' + elem[2] + ', registered ' + ts + '</li></a>');
      }
      r += "</ul>"
      $("#member_add_list").html(r);
   }, show_error);
}

function add_member_async()
{
   connection.session.call('com.tokens.add',
       [global_status.member_id, global_status.token_id]).then(
       function (res) {
         $("#member_add_list").html("Member " + global_status.member_name +
            " successfully added!");
       }, show_error
   );
   return false;
}

function update_entries()
{
   connection.session.call('com.members.list_entries').then(function(res){
      var r = "";
      for (var i in res) {
         r += ("<li>Time: " + res[i][2] + " token_id: " + res[i][0] + " name: " +
               res[i][1] + "</li>");
      }
      $("#last_entrance_list").html(r);
   }, show_error);
   if (global_status.get_form_timestamp != 0) {
      connection.session.call('com.tokens.get_last_unassigned',
         [global_status.get_form_timestamp]).then(function(res) {
            $("#form_get_scanner").removeClass("red");
            $("#form_get_scanner").addClass("green");
            $("#form_get_scanner").text(res);
            global_status.token_id = res;
            $("#form_get_submit").attr("disabled", false);
         }, show_error);
   }
}

var current_tab = $("#current_status");

function show(which)
{
   if (current_tab) {
      $(current_tab).hide();
   }
   current_tab = $("#" + which);
   current_tab.show();
   global_status.reset();
}

function show_error(err) {
   function stacktrace() { 
      function st2(f) {
         return !f ? [] : 
             st2(f.caller).concat([f.toString().split('(')[0].substring(9) + '(' + f.arguments.join(',') + ')']);
      }
      return st2(arguments.callee.caller);
   }
   if (err.error != undefined) {
      $("#errorbar").text(err.error);
   } else {
      $("#errorbar").text(err);
   }
}

function healthcheck_update()
{
   var cur_time = new Date().getTime() / 1000;
   var diff = cur_time - last_healthcheck[0];
   if (diff < 3) {
      $("#reader_status_1").removeClass("red");
      $("#reader_status_1").addClass("green");
      $("#reader_status_1").text("Reader 1");
   } else {
      $("#reader_status_1").removeClass("green");
      $("#reader_status_1").addClass("red");
      if (last_healthcheck[0] == 0)
         $("#reader_status_1").text("Reader 1 never seen");
      else
         $("#reader_status_1").text("Reader 1: Last seen: " + Math.ceil(diff) + " seconds ago");
   }
}

var last_healthcheck = [0];
var healthcheck_interval = null;

// fired when connection is established and session attached
//
connection.onopen = function (session, details) {

   $("#errorbar").html("");

   function healthcheck(r) {
      last_healthcheck = r;
   }

   session.subscribe('com.members.entry', update_entries).then(
      function (sub) {
      }, show_error
   );
   session.subscribe('com.members.healthcheck', healthcheck).then(
      function (sub) {
      }, show_error);
   healthcheck_interval = setInterval(healthcheck_update, 1000);
};


// fired when connection was lost (or could not be established)
//
connection.onclose = function (reason, details) {
   console.log("Connection lost: " + reason);
   if (healthcheck_interval) {
      clearInterval(healthcheck_interval);
      healthcheck_interval = null;
   }
   $("#errorbar").html("no connection!");
   //if (t1) {
   //   clearInterval(t1);
   //   t1 = null;
   //}
   //if (t2) {
   //   clearInterval(t2);
   //   t2 = null;
   //}
}


// now actually open the connection
//
connection.open();
