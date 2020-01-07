// the URL of the WAMP Router (Crossbar.io)
//
var wsuri;
if (document.location.origin == "file://") {
   wsuri = "ws://127.0.0.1:8080/ws";

} else {
   wsuri = (document.location.protocol === "http:" ? "ws:" : "wss:") + "//" +
               document.location.host + "/ws";
}


nunjucks.configure({'web': {'async': true}});

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
   this.visitor_form = false;

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
      var lc = res[i][1].toLowerCase();
      var found = true;
      var allitems = filter.split(/ +/);
      for (var item in allitems) {
         if (lc.search(allitems[item]) == -1) {
            found = false;
            break;
         }
      }
      if (found)
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

function add_one_month(no, tp)
{
   connection.session.call('com.subscription.add_one_month', [no, tp]).then(
      function(res) { show_member_details(no) }, show_error);
}

function add_one_month_from_now(no, tp)
{
   connection.session.call('com.subscription.check_one_month', [no]).then(
      function(res) {
         global_status.member_id = no;
         global_status.member_type = tp;
         if (res) {
            $("#check-one-month-modal").modal("show");
         } else {
            add_one_month_really();
         }
      }, show_error);
}

function add_one_month_really()
{
   var no = global_status.member_id;
   var tp = global_status.member_type;
   connection.session.call('com.subscription.add_one_month_from_now', [no, tp]).then(
      function(res) { show_member_details(no) }, show_error);
}

function change_membership(no, tp)
{
   if (no == null)
      no = global_status.member_id;
   connection.session.call('com.members.change_membership_type', [no, tp]).then(
      function (res) { show_member_details(no); }, show_error);
}

function change_expiry_date(no, end_timestamp)
{
   connection.session.call('com.subscription.change_expiry_date', [no, end_timestamp]).then(
      function(res) { show_member_details(no) }, show_error);   
}

function change_subscription_type(no, tp)
{
   connection.session.call('com.members.change_subscription_type', [no, tp]).then(
      function (res) { show_member_details(no); }, show_error);
/*   var elem;
   elem = $(".type-button.btn-primary");
   elem.removeClass("btn-primary");
   elem.addClass("btn-secondary");
   elem = $("#" + tp);
   elem.removeClass("btn-secondary");
   elem.addClass('btn-primary');*/
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
         r += "<tr><td>" + (moment(new Date(elem[2] * 1000)).format("HH:mm DD MMMM YYYY")) + "</td>" +
         "<td>" + elem[3] + "</td>" +
         "<td>" + elem[5] + "</td>" +
         "<td>R" + elem[6] + "</td>";
      }
      r += "</table>";
      $("#list-of-operations").html(r);
      if (res.credit_card_token) {
         $("#cc-info").html("Credit card known");
      } else {
         $("#cc-info").html("no credit card on file");
      }
   });
}

function initiate_ipad_transaction(no, tp)
{
   connection.session.call("com.payments.notify_transaction" , [no, tp]).then(function (res) {
      refresh_transaction_history(no);
   }, show_error);
}

function pause_membership(no)
{
   connection.session.call("com.members.pause", [no]).then(function (res) {
      show_member_details(no, function (res) {
         if (res.error) {
            $("#error-contents-inside").html(res.error);
            $("#error-contents").show();
         }
      });
   }, show_error);
}

function unpause_membership(no)
{
   connection.session.call("com.members.unpause", [no]).then(function (res) {
      show_member_details(no, function (res) {
         if (res.error) {
            $("#error-contents-inside").html(res.error);
            $("#error-contents").show();
         }
      });
   }, show_error);
}

function pause_change(no, start, end)
{
   connection.session.call("com.members.pause_change", [no, start, end]).then(function (orig_res) {
      show_member_details(no, function (res) {
         if (orig_res.error) {
            $("#error-contents-inside").html(orig_res.error);
            $("#error-contents").show();
         }
      });
   }, show_error);   
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

function show_vouchers()
{

}

var FA_DEFAULT_ICONS =  {
   time: "fa fa-clock-o",
   date: "fa fa-calendar",
   up: "fa fa-arrow-up",
   down: "fa fa-arrow-down",
   left: "fa fa-arrow-left",
   right: "fa fa-arrow-right",
   previous: "fa fa-backward",
   next: "fa fa-forward"
};

function show_member_details(no, extra_callback)
{
   connection.session.call('com.members.get', [no]).then(function (res) {
      res.start = moment(new Date(res.start_timestamp * 1000)).format("DD MMMM YYYY");
      res.next_charge_price = "R" + res.price;
      global_status.member_id = res.member_id;
      global_status.visitor_form = false;
      res.next_charge_date = moment(new Date(res.subscription_ends * 1000)).format("DD MMMM YYYY");
      if (res.last_subscr_ended)
         res.last_subscr_ended = moment(new Date(res.last_subscr_ended * 1000)).format("DD MMMM YYYY");
      res.prices = global_status.prices;
      console.log(res);
      nunjucks.render('member-details.html', res, function(err, html) {
         $("#placeholder").html(html);
         var elem = $("#" + res.subscription_type);
         elem.removeClass("btn-secondary");
         elem.addClass("btn-primary");
         if (res.member_type == 'recurring') {
            refresh_transaction_history(res.member_id);
         }
         $(".current-user").html(res.name);
         $("#member-notes").val(res.extra_notes);
         $("#filter-member").hide();
         var timepicker = $('#datetimepicker1');
         if (timepicker) {
            timepicker.datetimepicker({
               defaultDate: new Date(res.pause_starts * 1000),
               format: 'DD MMMM YYYY',
               icons: FA_DEFAULT_ICONS
            }).on("dp.change", function (e) { pause_change(res.member_id, e.date.unix(), res.pause_ends) });
            $("#datetimepicker2").datetimepicker({
               defaultDate: new Date(res.pause_ends * 1000),
               format: 'DD MMMM YYYY',
               icons: FA_DEFAULT_ICONS
            }).on("dp.change", function (e) { pause_change(res.member_id, res.pause_starts, e.date.unix() ); });
         }
         timepicker = $("#memberexpiry");
         if (timepicker) {
            timepicker.datetimepicker({
               defaultDate: new Date(res.subscription_ends * 1000),
               format: 'DD MMMM YYYY',
               icons: FA_DEFAULT_ICONS
            }).on("dp.change", function (e) { change_expiry_date(res.member_id, e.date.unix() + 23*3600 ); });
         }
         if (extra_callback) {
            extra_callback(res);
         }
      /*var memb_info = "", subscription, cancel_button = "";
      var cls = "";
      var but1 = "", but2 = "", but3 = "", but4 = "";
      if (res.member_type == null) {
         but1 = "selected";
         memb_info = "<div class='member-item-info'>No current membership</div>";
      } else if (res.member_type == "ondemand") {
         but3 = "selected";
         var extra_buttons = "";
         if (res.subscription_type == null) {
            subscription = "no subscription";
            extra_buttons = get_extra_buttons(res.member_id, "add", false, new Date());
         } else {
            var valid_till = new Date(res.subscription_ends * 1000);
            var exp = "";
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

      //$("#placeholder").html("<div class='member-form'><div class='member-item'><span>ID: " + res.member_id + "</span> <span>Name: " + res.name + "</span></div>" +
      //   "<div class='member-item'>Signed up: " + new Date(res.start_timestamp * 1000) + "</div>" +
      //   membership_buttons + memb_info +
      //   "</div>");*/
   });
   }, show_error);
}

function show_form(no)
{
   connection.session.call('com.forms.get', [no]).then(function(res) {
      $("#filter-visitor").hide();
      global_status.get_form_timestamp = new Date() / 1000;
      global_status.member_id = res.id;
      global_status.visitor_form = true;
      global_status.member_name = res.name;
      nunjucks.render('visitor-details.html', res, function(err, html) {
         $("#member_add_list").html(html);
      }, show_error);
   }, show_error);
   return false;
}

function filter_members()
{
   update_member_list($("#filter-text")[0].value);
   return true;
}

function save_user_notes()
{
   connection.session.call('com.members.save_notes', [global_status.member_id, $("#member-notes").val()]).then(
      function () {
         if (global_status.visitor_form) {
            show_form(global_status.member_id);
         } else {
            show_member_details(global_status.member_id)
         };
      }, show_error);
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

function member_visit_change(button, no)
{
   connection.session.call('com.visit.change', [no]).then(function(res) {
   }, show_error);
   if ($(button).text() == "member visit")
      $(button).text("cancel member visit");
   else
      $(button).text("member visit");   
}

function league_change(button, no)
{
   connection.session.call('com.league.change', [no]).then(function(res) {
   }, show_error);
   if ($(button).text() == "register for league")
      $(button).text("unregister for league");
   else
      $(button).text("register for league");   

}

function recapture_data(user_id)
{
   connection.session.call('com.members.update_data', [user_id]);
}

function update_visitor_list(filter)
{
   var res = global_status.visitor_list;
   var r = "<ul>";
   var j = 0;
   for (var i in res) {
      var elem = res[i];
      var name = elem.name.toLowerCase();
      var found = true;
      var allitems = filter.toLowerCase().split(/ +/);
      for (var item in allitems) {
         if (name.search(allitems[item]) == -1) {
            found = false;
            break;
         }
      }
      if (found) {
         var ts = new Date(elem.timestamp * 1000);
         var text, free_pass_button, free_pass_text, recapture_button;
         if (elem.last_daypass_timestamp == null) {
            text = 'day pass';
         } else {
            text = 'cancel day pass';
         }
         if (elem.free_pass_timestamp == null) {
            free_pass_text = 'member visit';
         } else {
            free_pass_text = 'cancel member visit';
         }
         free_pass_button = '<button class="daypass" onclick="member_visit_change(this, ' + elem.member_id + ')">' + free_pass_text + '</button>';
         recapture_button = '<button class="daypass" onclick="recapture_data(' + elem.member_id + ')">ask for contact update</button>';
         r += ('<li>' + recapture_button + free_pass_button + '<button onclick="daypass_change(this, ' + elem.member_id +
               ')" class="daypass" type="button">' + text + '</button><a href="#" onclick="return show_form(' + 
               elem.member_id + ')">' + elem.name + 
               '</a>, email: ' + elem.email + ', phone: ' + elem.phone + ', emergency phone: ' + elem.emergency_phone + '</li>');
         j += 1;
      }
      if (j > 30)
         break;
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
      var entry_time = new Date(elem.timestamp * 1000);
      if (elem.token_id == null) {
         cls = "red";
         reason = "unknown token";
      } else {
	  if (elem.member_type == 'perpetual') {
	      cls = 'green';
	      reason = '';
	  } else if (elem.subscription_end_timestamp == null || elem.subscription_end_timestamp < elem.timestamp) {
            cls = "red";
            reason = "no valid subscription";
         } else if (elem.sub_type == "before4" && entry_time.getHours() >= 16) {
            cls = "red";
            reason = "entry after 4pm";
         } else if (new Date(elem.subscription_end_timestamp * 1000) - entry_time < 3600 * 24 * 1000) {
            cls = "yellow";
            reason = "expiring in less than 24h";
         } else {
            var days = Math.ceil((elem.subscription_end_timestamp - elem.timestamp) / 3600 / 24)
            reason = days + " days left";
            cls = "green";
         }
      }
      var extra = elem.sub_type;
      if (!extra)
         extra = elem.member_type;
      if (reason) {
         reason = reason + ", " + extra;
      } else {
         reason = extra;
      }
      var name;
      if (elem.name != null)
         name = elem.name
      else
         name = "token: " + elem.token_id
      r = "<li><span class='" + cls + " circle'></span><span class='list-name'><a onclick='show_member_details_from_access_log(\"" + elem.member_id + "\")' href='#'>" + name
      r += "</a></span><span class='list-reason'>" + reason + "</span>" + parse_time(entry_time);
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

function show_member_details_from_access_log(member_id)
{
   show('member_lookup', $("#member-lookup-li"));
   show_member_details(member_id);
}

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
   console.log(err);
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

   function update_voucher(v) {
      $("barcode-scanner-contents").text(v);
   }

   session.subscribe('com.members.entry', update_entries).then(
      function (sub) {
      }, show_error
   );
   session.subscribe('com.vouchers.scan', update_voucher).then(
      function (sub) {}, show_error
   );
   session.subscribe('com.members.healthcheck', healthcheck).then(
      function (sub) {
      }, show_error);
   session.subscribe('com.payments.update_history', function (r) { refresh_transaction_history(r[0]); });
   session.call('com.stats.get_prices', []).then(function (r) {
      global_status.prices = r;
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
