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

function authorize_credit_card(no)
{
   connection.session.call('com.members.authorize_cc', [no]).then(function (res) {
      $("#cc-authorization").html("pending");
   }, show_error);
}

function add_membership(type, no)
{
   connection.session.call('com.subscription.add_till', [type, no, $("#year-change")[0].value,
      $("#month-change")[0].value, $("#day-change")[0].value]).then(
      function (res) { show_member_details(no) }, show_error);
}

function remove_membership(no)
{
   connection.session.call('com.subscription.remove', [no]).then(
      function (res) { show_member_details(no) }, show_error);
}

function change_membership(no, tp)
{
   connection.session.call('com.members.change_membership_type', [no, tp]).then(
      function (res) { show_member_details(no); }, show_error);
}

function addMonths (date, count) {
  if (date && count) {
    var m, d = (date = new Date(+date)).getDate()

    date.setMonth(date.getMonth() + count, 1)
    m = date.getMonth()
    date.setDate(d)
    if (date.getMonth() !== m) date.setDate(0)
  }
  return date
}

function refresh_transaction_history(no)
{
   connection.session.call('com.payments.get_history', [no]).then(function (res) {
      if (!$("#list-of-operations")[0])
         return;
      r = "<table class='res-table'><tr><td>Time:</td><td>Type:</td><td>Outcome:</td><td>Value:</td></tr>";
      var k = res.payment_history;
      for (var i in k)
      {
         var elem = k[i];
         r += "<tr><td>" + (new Date(elem[2] * 1000)) + "</td>" +
         "<td>" + elem[3] + "</td>" +
         "<td>" + elem[5] + "</td>" +
         "<td>R" + elem[6] + "</td>";
      }
      r += "</table>";
      $("#list-of-operations").html(r);
      $("#cc-info").html(get_credit_card_info(res.credit_card_token));
   });
}

function initiate_ipad_transaction(no, tp)
{
   connection.session.call("com.payments.notify_transaction" , [no, tp]).then(function (res) {
      refresh_transaction_history(no);
   }, show_error);
}

function get_extra_buttons(no, txt, del_button_flag, d)
{
   var d2 = addMonths(d, 1);
   var del_button = "<button onclick='remove_membership(" + no + ")' type='button'>delete last membership</button>";
   if (!del_button_flag)
      del_button = "";
   return "<p class='subscription-info-containter-2'><span>" + del_button +
   "<button onclick=\"add_membership('before4', " + no + ")\" type='button'>" + txt + " before 4pm until:</button>" +
   "<button onclick=\"add_membership('regular', " + no + ")\" type='button'>" + txt + " regular until:</button>" +
   "<span class='member-item-span'>Year: <input id='year-change' value='" + d2.getFullYear() + "' size=4 type='text'/> Month: " +
   "<input id='month-change' value='" + (d2.getMonth() + 1) + "' size=2 type='text'/> Day: <input id='day-change' size=2 value='" + d2.getDate() + "' type='text'/>" + 
   "</span></p>";
}

function get_pause_buttons(no)
{
   return "";
   d = new Date();
   return "<p id='pause-result'></p><p id='pause-container'>Pause from <input id='pause-start-year' value=" + d.getFullYear()  + 
     " size=4>-<input size=2 id='pause-start-month'>-<input size=2 id='pause-start-day'> to <input size=4 id='pause-end-year' value=" +
     d.getFullYear() + ">-<input size=2 id='pause-end-month'>-<input size=2 id='pause-end-day'>" +
     "<button oclick='do_pause(" + no + ")' type='button'>Pause</button></p>";
}

function get_credit_card_info(r)
{
   if (r == null) {
      return "no credit card on file";
   } else {
      return "<span class='green'>credit card known</span>";
   }

}

function show_statistics()
{
   connection.session.call('com.stats.get').then(function (res) {
      $("#statistics").html("<p>Valid pay-as-you go members: " + res.total_ondemand + "</p>" +
         "<p>Valid recurring members: " + res.total_recurring + "</p>" +
         "<p>Total perpetual members: " + res.total_perpetual + "</p>" +
         "<p>Number of people who crossed the door: " + res.total_visitors + "</p>" +
         "<p></p>")
   });
}

function show_member_details(no)
{
   connection.session.call('com.members.get', [no]).then(function (res) {
      console.log(res);
      $("#filter-member").hide();
      var memb_info = "", subscription, cancel_button = "";
      var cls = "";
      var but1 = "", but2 = "", but3 = "", but4 = "";
      if (res.member_type == null) {
         but1 = "selected";
         memb_info = "<div class='member-item-info'>No current membership</div>";
      } else if (res.member_type == "ondemand") {
         but3 = "selected";
         if (res.subscription_type == null) {
            subscription = "no subscription";
         } else {
            var valid_till = new Date(res.subscription_ends * 1000);
            var exp = "";
            var extra_buttons = "";
            if (valid_till > new Date()) {
               cls = "green";
               exp = ", valid till " + valid_till.toDateString();
               extra_buttons = get_extra_buttons(res.member_id, "change", true, valid_till);
            } else {
               cls = "red";
               exp = ", expired";
               extra_buttons = get_extra_buttons(res.member_id, "add", false, new Date());
            }
            var memb_type = res.member_type;
            if (memb_type == "before4") {
               subscription = "<p class='subscription-info-containter'><span class='subscription-info " + cls + 
                   "''>Membership before 4" + exp + "</span></p>";
            } else {
               subscription = "<p class='subscription-info-containter'><span class='subscription-info " + cls +
                   "''>Regular membership" + exp + "</span></p>";
            }
         }
         memb_info = ("<div class='member-item-info'>" + 
            subscription + extra_buttons +
            "</div>");
      } else if (res.member_type == "recurring") {
         but2 = "selected";
         var buttons = "<button onclick='initiate_ipad_transaction(" + res.member_id + ", \"before4\")' type='button'>" +
            "Initiate new before 4 credit card</button>" +
            "<button type='button' onclick='initiate_ipad_transaction(" + res.member_id + ", \"youth\")'>Initiate new youth credit card</button>" +
            "<button onclick='initiate_ipad_transaction(" + res.member_id + ", \"regular\")' type='button'>" +
            "Initiate new regular credit card</button>";
         var inf = get_credit_card_info(res.credit_card_token);
         var pause_buttons = get_pause_buttons(res.memebr_id);
         memb_info = "<div class='member-item-info'>" + pause_buttons + "<p><span class='subscription-info'><span id='cc-info'>" + inf +
           "</span>" + buttons + "<p id='list-of-operations'></p>" + "</span></p></div>";
         refresh_transaction_history(res.member_id);
      } else if (res.member_type == "perpetual") {
         but4 = "selected";
         memb_info = "<div class='member-item-info'>Perpetual membership (routesetters etc.)</div>";
      } else {
         memb_type = "error";
      }
      var membership_buttons = ("<div class='member-item'>Membership type:" + 
         "<button class='" + but1 + "' onclick='change_membership(" + res.member_id + ",\"none\")' type='button'>No membership</button>" +
         "<button class='" + but2 + "' onclick='change_membership(" + res.member_id + ",\"recurring\")' type='button'>Recurring membership</button>" +
         "<button class='" + but3 + "'onclick='change_membership(" + res.member_id + ",\"ondemand\")' type='button'>On demand membership</button>" +
         "<button class='" + but4 + "'onclick='change_membership(" + res.member_id + ",\"perpetual\")' type='button'>Perpetual membership</button>"
         );

      $("#placeholder").html("<div class='member-form'><div class='member-item'><span>Name: " + res.name + "</span></div>" +
         "<div class='member-item'>Signed up: " + new Date(res.start_timestamp * 1000) + "</div>" +
         membership_buttons + memb_info +
         "</div>");
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

function freepass_change(button, no)
{
   connection.session.call('com.freepass.change', [no]).then(function(res) {
   }, show_error);
   if ($(button).text() == "free pass")
      $(button).text("cancel free pass");
   else
      $(button).text("free pass");   
}

function update_visitor_list(filter)
{
   var res = global_status.visitor_list;
   var r = "<ul>";
   for (var i in res) {
      var elem = res[i];
      if (elem[1].toLowerCase().search(filter.toLowerCase()) != -1) {
         var ts = new Date(elem[3] * 1000);
         var text, free_pass_button, free_pass_text;
         if (elem[4] == null) {
            text = 'day pass';
         } else {
            text = 'cancel day pass';
         }
         if (elem[5] == null) {
            free_pass_text = 'free pass';
         } else {
            free_pass_text = 'cancel free pass';
         }
         free_pass_button = '<button class="daypass" onclick="freepass_change(this, ' + elem[0] + ')">' + free_pass_text + '</button>';
         r += ('<li>' + free_pass_button + '<button onclick="daypass_change(this, ' + elem[0] +
               ')" class="daypass" type="button">' + text + '</button><a href="#" onclick="return show_form(' + elem[0] + ')">' + elem[1] + 
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
         if (elem[4] != 'perpetual' && (elem[3] == null || elem[3] < elem[2])) {
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
   session.subscribe('com.payments.update_history', function (r) { refresh_transaction_history(r[0]); });
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
