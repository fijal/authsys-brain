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

function update_member_list(filter)
{
   var res = global_status.member_list;
   var r = "<ul>"
   for (var i in res) {
      if (res[i][1].toLowerCase().search(filter.toLowerCase()) != -1)
         r += "<li><a href='#' onclick='show_member_details(" + res[i][0] + ")'>" + res[i][1] + "</a></li>";
   }
   r += "</ul>"
   $("#placeholder").html(r);
}

function list_members_async()
{
   connection.session.call('com.members.list').then(function(res) {
      $("#filter-member").show();
      $("#filter-text")[0].value = "";
      global_status.member_list = res;
      $("#filter-text").focus();
      update_member_list("");
   }, function(res) {
      $("#placeholder").text(res);
   });
}

function add_membership(type, no)
{
   connection.session.call('com.subscription.add_one_month', [type, no]).then(
      function (res) { show_member_details(no) }, show_error);
}

function remove_membership(no)
{
   connection.session.call('com.subscription.remove', [no]).then(
      function (res) { show_member_details(no) }, show_error);
}

function change_membership(no)
{
   connection.session.call('com.members.change_date', [no, $("#year-change")[0].value,
      $("#month-change")[0].value, $("#day-change")[0].value]).then(function (res) {
         show_member_details(no);
      }, show_error);
}

function show_member_details(no)
{
   connection.session.call('com.members.get', [no]).then(function (res) {
      $("#filter-member").hide();
      var memb_type, subscirption, cancel_button = "";
      if (res[3] == null) {
         memb_type = "no membership";
         subscription = "never paid";
         cls = "red";
      } else {
         memb_type = res[3];
         if (memb_type == "before4") {
            memb_type = "enter before 4pm";
         }
         subscription = new Date(res[4] * 1000);
         if (subscription > new Date()) {
            cls = "green";
            cancel_button = ("<button type='button' onclick='remove_membership(" +
               res[0] + ")'>remove last month membership</button>");
         } else {
            cls = "red";
         }
      }
      $("#placeholder").html("<div class='member-form'><div class='member-item'><span class='" + cls + "'>Name: " + res[1] + "</span></div>" +
         "<div class='member-item'>Signed up: " + new Date(res[2] * 1000) + "</div>" +
         "<div class='member-item'>Membership type: " + memb_type + "</div>" +
         "<div class='member-item'>Membership paid till: " + subscription + " " +
         "<span class='member-item-span'>Year: <input id='year-change' value='2017' size=4 type='text'/> Month: " +
         "<input id='month-change' size=2 type='text'/> Day: <input id='day-change' size=2 type='text'/>" + 
         "<button type='button' onclick='change_membership(" + res[0] + ")'>Change</button></span></div>" +
         "<button type='button' onclick=\"add_membership('regular', " + res[0] + ")\">" + "Add one month membership" +
         "</button><button type='button' onclick=\"add_membership('before4', " +
         res[0] + ")\">Add one month membership before 4pm</button>" + cancel_button + '</div>');
   }, show_error);
}

function show_form(no)
{
   connection.session.call('com.forms.get', [no]).then(function(res) {
      $("#filter-visitor").hide();
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

function filter_members()
{
   update_member_list($("#filter-text")[0].value);
   return true;
}

function filter_visitors()
{
   update_visitor_list($("#filter-visitor-text")[0].value);
}

function daypass_change(button, no)
{
   connection.session.call('com.daypass.change', [no]).then(function(res) {
   }, show_error);
   if ($(button).text() == "day pass")
      $(button).text("cancel day pass");
   else
      $(button).text("day pass");
}

function update_visitor_list(filter)
{
   var res = global_status.visitor_list;
   var r = "<ul>";
   for (var i in res) {
      var elem = res[i];
      if (elem[1].toLowerCase().search(filter.toLowerCase()) != -1) {
         var ts = new Date(elem[3] * 1000);
         var text;
         if (elem[4] == null) {
            text = 'day pass';
         } else {
            text = 'remove day pass';
         }
         r += ('<li><button onclick="daypass_change(this, ' + elem[0] + ')" class="daypass" type="button">' + text + '</button><a href="#" onclick="return show_form(' + elem[0] + ')">' + elem[1] + 
               ', ID number: ' + elem[2] + ', registered ' + ts + '</li></a>');
      }
   }
   r += "</ul>"
   $("#member_add_list").html(r);
}

function list_indemnity_forms()
{
   connection.session.call('com.forms.list').then(function(res) {
      $("#filter-visitor").show();
      $("#filter-visitor-text")[0].value = "";
      $("#filter-visitor-text").focus();
      global_status.visitor_list = res;
      update_visitor_list("");
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
   function parse_time(t)
   {
      var now = new Date();
      if (now.getDay() == t.getDay()) {
         if (now - t < 3600 * 1000) {
            return Math.ceil((now - t) / 60 / 1000) + " minutes ago";
         }
         return Math.ceil((now - t) / 3600 / 1000) + " hours ago";
      }
      return t;
   }

   function show_entry(elem)
   {
      var r = "", cls, reason;
      var entry_time = new Date(elem[2] * 1000);
      if (elem[1] == null) {
         cls = "red";
         reason = "unknown token";
      } else {
         if (elem[3] == null || elem[3] < elem[2]) {
            cls = "red";
            reason = "no valid subscription";
         } else if (elem[4] == "before4" && entry_time.getHours() >= 16) {
            cls = "red";
            reason = "entry after 4pm for subscription before 4pm";
         } else if (new Date(elem[3] * 1000) - entry_time < 3600 * 24 * 1000) {
            cls = "yellow";
            reason = "subscription expiring in less than 24h";
         } else {
            reason = "";
            cls = "green";
         }
      }
      var name;
      if (elem[1] != null)
         name = elem[1]
      else
         name = "token: " + elem[0]
      r = "<li><span class='" + cls + " circle'></span><span><span class='list-name'>" + name
      r += "</span><span class='list-reason'>" + reason + "</span>" + parse_time(entry_time);
      r += "</span></li>"
      return r;
   }

   connection.session.call('com.members.list_entries').then(function(res){
      var r = "";
      for (var i in res) {
         r += show_entry(res[i]);
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

function show(which, elem)
{
   var selected = $(".selected");
   selected.removeClass("selected");
   selected.addClass("selectable");
   var li = $(elem).parent();
   li.removeClass("selectable");
   li.addClass("selected");
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
      $("#reader-status-circle").removeClass("red");
      $("#reader-status-circle").addClass("green");
      $("#reader-status-text").html("reader 1");
   } else {
      $("#reader-status-circle").removeClass("green");
      $("#reader-status-circle").addClass("red");
      if (last_healthcheck[0] == 0)
         $("#reader-status-text").html("reader 1 never seen");
      else
         $("#reader-status-text").html("reader 1: Last seen: " + Math.ceil(diff) + " seconds ago");
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
