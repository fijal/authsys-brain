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

var secret;

var connection = new autobahn.Connection({
   url: wsuri,
   realm: "authsys",
   authmethods: ['cookie', 'wampcra'],
   authid: 'frontdesk',
   max_retries: -1,
   max_retry_delay: 3,
   onchallenge: function (session, method, extra) {
      if (method === "wampcra") {
        return autobahn.auth_cra.sign(secret, extra.challenge);
      } else {
         throw "don't know how to authenticate using '" + method + "'";
      }
   }
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

function find_in_string(filter, string)
{
   if (string == null)
      return false;
   var lc = string.toLowerCase();
   filter = filter.toLowerCase();
   var found = true;
   var allitems = filter.split(/ +/);
   for (var item in allitems) {
      if (lc.search(allitems[item]) == -1)
         return false;
   }
   return true;
}

function update_member_list(filter)
{
   if (filter.length < 3) {
      $("#placeholder").html("Please type at least 3 letters (name, surname, email, phone)");
      return;
   }

   function continuation(res)
   {
      global_status.member_list = res;

      var r = "<div class='container'>";
      for (var i in res) {
         found = find_in_string(filter, res[i].name) || find_in_string(filter, res[i].email) || find_in_string(filter, res[i].phone);
         if (found) {
            var phone = res[i].phone;
            if (phone == null)
               phone = "";
            r += ("<a href='#' onclick='show_member_details(" + res[i].id + ")'><div class='row'><div class='col'>" + 
                  res[i].name + "</div><div class='col'>" + phone + "</div><div class='col'>" + res[i].email +
                  "</div></div></a>");
         }
      }
      r += '</div>'
      $("#placeholder").html(r);
   }
   var res = global_status.member_list;
   var cur_prefix = global_status.member_list_prefix;
   if (filter.search(cur_prefix) == 0) {
      continuation(global_status.member_list);
   } else {
      $("#placeholder").html("Loading....");
      connection.session.call('com.members.list', [filter.slice(0, 3)]).then(function (res) {
         global_status.member_list_prefix = filter.slice(0, 3);
         if (!res) {
            global_status.member_list = [];
            $("#placeholder").html("No hits");
         } else {
            continuation(res);
         }
      });
   }
}

function initialize_member_list()
{
//   connection.session.call('com.members.list', [""]).then(function(res) {
   $("#filter-member").show();
   $("#filter-text")[0].value = "";
   global_status.member_list = []; //res;
   global_status.member_list_prefix = null;
   $("#filter-text").focus();
   update_member_list("");
//   }, function(res) {
//      $("#placeholder").text(res);
//   });
}

function authorize_credit_card(no)
{
   connection.session.call('com.members.authorize_cc', [no]).then(function (res) {
      $("#cc-authorization").html("pending");
   }, show_error);
}

function remove_membership(no)
{
   connection.session.call('com.subscription.remove', [no]).then(
      function (res) { show_member_details(no) }, show_error);
}

function add_one_month(no, tp)
{
   $("#add-one-month-button").attr("disabled", true);
   connection.session.call('com.subscription.add_one_month', [no, tp]).then(
      function(res) {
         $("#add-one-month-button").attr("disabled", false);
         show_member_details(no)
      }, show_error);
}

function add_one_month_from_now(no, tp)
{
   $("#add-one-month-from-now-button").attr("disabled", true);
   connection.session.call('com.subscription.check_one_month', [no]).then(
      function(res) {
         $("#add-one-month-from-now-button").attr("disabled", false);
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
      console.log(res);
      if (!$("#list-of-operations")[0])
         return;
      var r = "<table class='res-table'><tr><td>Time:</td><td>Type:</td><td>Outcome:</td><td>Value:</td></tr>";
      var k = res.payment_history;
      for (var i in k)
      {
         var elem = k[i];
         r += "<tr><td>" + (moment(new Date(elem.timestamp * 1000)).format("HH:mm DD MMMM YYYY")) + "</td>" +
         "<td>" + elem.type + "</td>" +
         "<td>" + elem.description + "</td>" +
         "<td>" + elem.outcome + "</td>";
         if (elem.price != 0 && elem != null) {
            r += "<td>R" + elem.price + "</td>";
         }
         r += "</tr>";
      }
      r += "</table>";
      $("#list-of-operations").html(r);
/*      if (res.credit_card_token) {
         $("#cc-info").html("Bank details known.");
      } else {
         $("#cc-info").html("No bank details on file.");
      }*/
   });
}

function initiate_ipad_transaction(member_id, name, phone, sub_type, price, next_monday)
{
   $("#initiate-payment-button").attr("disabled", true);
   connection.session.call("com.transaction.start", [member_id]);
   $.post('/signup/notify', {'member_id': member_id, 'name': name,
                             'contact_number': phone, 'subscription_type': sub_type, 'price': price,
                             'next_monday': next_monday},
      function(res) {
          refresh_transaction_history(member_id);
          $("#initiate-payment-button").attr("disabled", false);
   });
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
      if (res.account_number) {
         res['disableifnobankdetails'] = '';
      } else {
         res['disableifnobankdetails'] = 'disabled';
      }
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
   });
   }, show_error);
}

function sign_covid_indemnity(member_id, sign)
{
   connection.session.call('com.covid_indemnity.sign', [member_id, sign]).then(
      function(res) {
         if (res.success)
            show_member_details(member_id, null);
         else
            show_error(res['error']);
      }, show_error);
   return false;
}

function sign_covid_indemnity_from_visitors(i, member_id, sign)
{
   connection.session.call('com.covid_indemnity.sign', [member_id, sign]).then(
      function(res) {
         if (res.success) {
            global_status.visitor_list[i]['covid_indemnity_signed'] = sign;
            filter_visitors();
         } else
            show_error(res['error']);
      }, show_error);
   return false;
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
   connection.session.call('com.daypass.change', [no, global_status.gym_id]).then(function(res) {
   }, show_error);
   if ($(button).text() == "day pass")
      $(button).text("cancel day pass");
   else
      $(button).text("day pass");
}

function member_visit_change(button, no)
{
   connection.session.call('com.visit.change', [no, global_status.gym_id]).then(function(res) {
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
   if (filter.length < 4) {
      $("#member_add_list").html("Please enter at least 4 letters (name, surname, email, phone)");
      return;
   }
   if (filter.slice(0, 4) == global_status.visitor_list_prefix) {
      _update_visitor_list(filter);
   } else {
      global_status.visitor_list_prefix = filter.slice(0, 4);
      $("#member_add_list").html("Loading....");
      connection.session.call('com.forms.list', [filter.slice(0, 4)]).then(function (res) {
         global_status.visitor_list = res;
         _update_visitor_list(filter);
      });
   }
}

function _update_visitor_list(filter)
{
   var covid_button;
   var res = global_status.visitor_list;
   if (!res) {
      $("#member_add_list").html("No results");
      return;
   }
   var r = "<div class='container'>";
   var j = 0;
   for (var i in res) {
      var elem = res[i];
      var found = find_in_string(filter, elem.name) || find_in_string(filter, elem.phone) || find_in_string(filter, elem.email);
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
         //recapture_button = '<button class="daypass" onclick="recapture_data(' + elem.member_id + ')">ask for contact update</button>';
         //if (elem.covid_indemnity_signed)
         //covid_button = '';
         var cap_name = elem.name;
         /*if (!elem.covid_indemnity_signed) {
            cap_name = '<span class="red">' + cap_name + " (NO COVID_INDEMNITY)</span>";
            covid_button = "<button onclick='sign_covid_indemnity_from_visitors(" + i + ", " + elem.member_id + ", true)' " +
             "class='daypass' type='button'>Sign COVID</button>";
         } else {
            covid_button = "<button onclick='sign_covid_indemnity_from_visitors(" + i + ", " + elem.member_id + ", false)' " +
            "class='daypass' type='button'>Undo COVID</button>";
         }*/
         r += ("<div class='row'><div class='col-3'>" + free_pass_button + '<button onclick="daypass_change(this, ' + elem.member_id +
               ')" class="daypass" type="button">' + text + '</button></div><div class="col"><a href="#" onclick="return show_form(' + 
               elem.member_id + ')">' + cap_name +
               '</a></div><div class="col">' + elem.email + '</div><div class="col">' + elem.phone +
               '</div><div class="col">emergency:' + elem.emergency_phone + '</div></div>');
         j += 1;
      }
      if (j > 30)
         break;
   }
   r += "</div>"
   $("#member_add_list").html(r);
}

function initialize_visitor_list()
{
   $("#filter-visitor").show();
   $("#filter-visitor-text")[0].value = "";
   $("#filter-visitor-text").focus();
   global_status.visitor_list = [];
   global_status.visitor_list_prefix = "";
   update_visitor_list("");
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

function update_transactions()
{
   show_member_details(global_status.member_id);
}

function print_mandate()
{
   connection.session.call("com.mandate.print", [global_status.member_id]);
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
      //if (!elem.covid_indemnity) {
      //   name += " (NO COVID INDEMNITY!)"
      //}
      r = "<li><span class='" + cls + " circle'></span><span class='list-name'><a onclick='show_member_details_from_access_log(\"" + elem.member_id + "\")' href='#'>" + name
      r += "</a></span><span class='list-reason'>" + reason + "</span>" + parse_time(entry_time);
      r += "</span></li>"
      return r;
   }

   connection.session.call('com.members.list_entries', [global_status.gym_id]).then(function(res){
      var r = "Total number of people who entered in the last 2h: " + res['total'] + "<br/>";
      for (var i in res['entries']) {
         r += show_entry(res['entries'][i]);
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
var last_voucher = null;

function invalidate_voucher()
{
   if (!last_voucher)
      return;
   connection.session.call('com.vouchers.invalidate', [last_voucher]);
   last_voucher = null;
   $("#barcode-scanner-contents").text("Voucher invalidated");
}

// fired when connection is established and session attached
//
connection.onopen = function (session, details) {

   $("#errorbar").html("");
   $("#login-modal").modal("hide");
   $("#login-modal-password").prop("value", "")

   function healthcheck(r) {
      last_healthcheck = r;
   }

   function update_voucher(v) {
      last_voucher = v[0];
      connection.session.call('com.vouchers.get', [v[0]]).then(
         function (v) {
            $("#barcode-scanner-contents").text(v);
         }, function (e) {
            $("#barcode-scanner-contents").text("Cannot recognize voucher");
         }
      );
   }

   session.subscribe('com.members.entry', update_entries).then(
      function (sub) {
      }, show_error
   );
   session.subscribe('com.transaction.notify', update_transactions)
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

   global_status.gym_id = parse_cookie().gym_id;
};


// fired when connection was lost (or could not be established)
//
connection.onclose = function (reason, details) {
   $("#login-modal").modal({show: true, backdrop: "static"});
   var real_reason;
   if (details.reason == "wamp.error.not_authorized") {
      real_reason = "Authorization failure";
   } else {
      if (!details.reason)
         real_reason = reason;
      else
         real_reason = details.reason;
   }
   $("#login-modal-context").text(real_reason);
   if (healthcheck_interval) {
      clearInterval(healthcheck_interval);
      healthcheck_interval = null;
   }
   //if (t1) {
   //   clearInterval(t1);
   //   t1 = null;
   //}
   //if (t2) {
   //   clearInterval(t2);
   //   t2 = null;
   //}
}

$(document).ready(function () {
   // try to connection first using cookie
   connection.open();
});

function parse_cookie() {
   var a = {};
   var cookies = document.cookie.split(";");
   for (var p in cookies) {
      var p1 = cookies[p];
      var x = p1.split("=");
      a[x[0].trim()] = x[1];
   }
   return a;
}

function clear_modal_context()
{
   $("#login-modal-context").text("");
}

function connect_to_autobahn()
{
   secret = $("#login-modal-password").prop("value");
   if (!secret) {
      $("#login-modal-context").text("Empty password");
      return;
   }
   $("#login-modal-context").text("connecting....");
   var d = parse_cookie();
   document.cookie = "gym_id= " + $("#gym_id").val() + "; expires=Fri, 1 Dec 2100 12:00:00 UTC; path=/"
   connection.open();
}

// now actually open the connection
//
//connection.open();
