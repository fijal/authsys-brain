
from __future__ import print_function

import os, time, re
import barcode
from fpdf import FPDF
from cairosvg import svg2png

import treq, urllib, json
from twisted.internet.defer import inlineCallbacks, returnValue
from twisted.logger import Logger
from twisted.internet import reactor

from txrestapi.resource import APIResource
from txrestapi import methods

from sqlalchemy import create_engine, select, outerjoin

from autobahn.twisted.util import sleep
from autobahn.twisted.wamp import ApplicationSession
from autobahn.wamp.exception import ApplicationError
from authsys_common.model import meta, members, entries, tokens, vouchers
from authsys_common import queries as q
from authsys_common.scripts import get_db_url, get_config

eng = create_engine(get_db_url())
con = eng.connect()
meta.reflect(bind=eng)

class VoucherManager(APIResource):
    def __init__(self, arg):
        APIResource.__init__(self)

    @methods.POST('^/voucher/new$')
    def voucher_gen(self, request):        
        MAX_X = 210
        MAX_Y = 297

        f = FPDF('P', 'mm', 'A4')
        f.add_page()
        pth = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'voucher_template.png')
        f.image(pth, 0, 0, MAX_X, MAX_Y)
        f.set_font('Arial', '', 20)
        f.text(70, 165, request.args['name'][0])
        f.text(70, 201, request.args['reason'][0])
        f.text(70, 236, request.args['extra'][0])
        f.set_font('Arial', '', 14)

        rand = os.urandom(8).encode('hex')

        EAN = barcode.get_barcode_class('code128')

        r = con.execute(vouchers.insert().values(fullname=request.args['name'][0],
            reason=request.args['reason'][0], extra=request.args['extra'][0],
            unique_id=rand, used=False, timestamp=int(time.time())))
        no = str(r.lastrowid)

        ean = EAN(str(rand))
        fullname = ean.save('/tmp/ean13_barcode')
        svg2png(url=fullname, write_to="/tmp/out.png", dpi=300)

        f.image("/tmp/out.png", 10, 10, 100, 20)

        f.text(165, 257, no)
        request.setHeader('Content-Type', "application/pdf")
        return f.output(dest='S')


class AppSession(ApplicationSession):

    log = Logger()

    def list_members(self):
        return q.get_member_list(con)

    def get_member_data(self, no):
        return q.get_member_data(con, no)

    def add_one_month(self, no, type):
        return q.add_one_month_subscription(con, no, type)

    def add_one_month_from_now(self, no, type):
        return q.add_one_month_subscription(con, no, type, t0=time.time())

    def change_date(self, no, year, month, day):
        q.change_date(con, no, year, month, day)

    def add_till(self, tp, no, year, month, day):
        q.add_till(con, tp, no, year, month, day)

    def remove_subscription(self, no):
        return q.remove_subscription(con, no)

    def list_indemnity_forms(self):
        return q.list_indemnity_forms(con)

    def change_membership_type(self, no, tp):
        q.change_membership_type(con, no, tp)

    def change_subscription_type(self, no, tp):
        q.change_subscription_type(con, no, tp)

    def subscription_change_end(self, no, end_timestamp):
        q.change_subscription_ends(con, no, end_timestamp)

    def add_token(self, member_id, token_id):
        con.execute(tokens.insert().values(member_id=member_id, id=token_id,
            valid=True, timestamp=int(time.time())))

    def register_token(self, token_id):
        con.execute(entries.insert().values(timestamp=int(time.time()), token_id=token_id))
        self.publish(u'com.members.entry')
        return q.is_valid_token(con, token_id, int(time.time()))

    def list_entries(self):
        t0 = time.time() - 24 * 3600
        return q.entries_after(con, t0)

    def reader_visible(self, no):
        self.readers_last_seen[no] = time.time()
        self.publish(u'com.members.healthcheck', self.readers_last_seen)

    def get_last_unassigned(self, tstamp):
        return q.unrecognized_entries_after(con, tstamp)[0]

    def daypass_change(self, no):
        q.daypass_change(con, no)

    def member_visit_change(self, no):
        q.member_visit_change(con, no)

    def league_register(self, no):
        q.league_register(con, no)

    @inlineCallbacks
    def notify_transaction(self, no, tp):
        yield self.payment_gateway_request(no, tp)

    @inlineCallbacks
    def payment_gateway_continue(self, res, no, tp, price, memb_type):
        r = yield res.json()
        print(r)
        q.payments_write_transaction(con, no, "initial", time.time(), r['id'],
            r['result']['code'], r['result']['description'], price, memb_type)
        self.publish(u'com.payments.notify_broadcast', no, price)
        self.publish(u'com.payments.update_history', no)

    def payment_gateway_request(self, no, tp):
        conf = get_config()
        price = conf.get("price", tp)
        url = conf.get('payment', 'base') + '/v1/checkouts'
        name, email = q.get_customer_name_email(con, no)
        # invent
        names = name.split(" ")
        if len(names) == 1:
            lastname = ""
            firstname = names[0]
        else:
            lastname = names[-1]
            firstname = " ".join(names[:-1])
        data = {
            'authentication.userId' : conf.get('payment', 'userId'),
            'authentication.password' : conf.get('payment', 'password'),
            'authentication.entityId' : conf.get('payment', 'entityId'),
            'amount' : price,
            'currency' : 'ZAR',
            'paymentType' : 'DB',
            'recurringType': 'INITIAL',
            'createRegistration': 'true',
            'customer.givenName': firstname,
            'customer.surname': lastname,
            'customer.email': email,
            'merchantTransactionId': "foobarbaz" + str(q.max_id_of_payment_history(con)),
            }
        d = treq.post(url, data)
        d.addCallback(self.payment_gateway_continue, no, tp, price, tp)
        return True

    @inlineCallbacks
    def payment_check_status(self, path):
        conf = get_config()
        d = dict([x.split("=") for x in path.split("&")])
        token_id = urllib.unquote(d['id'])
        url = conf.get('payment', 'base') + urllib.unquote(d['resourcePath'])
        params = "&".join(["%s=%s" % (k, v) for (k, v) in [
         ('authentication.userId', conf.get('payment', 'userId')),
         ('authentication.password', conf.get('payment', 'password')),
         ('authentication.entityId', conf.get('payment', 'entityId')),
        ]])
        print(url + "?" + params)
        r = yield treq.get(url + "?" + params)
        r = yield r.text()
        print(r)
        r = json.loads(r)
        member_id, sum, tp = q.payments_get_id_sum_tp(con, token_id)
        q.payments_write_transaction(con, member_id, "completed", time.time(),
            r['registrationId'], r['result']['code'], r['result']['description'], sum, tp)
        if re.search("^(000\.000\.|000\.100\.1|000\.[36])", r['result']['code']):
            q.add_one_month_subscription(con, member_id, tp, t0=time.time())
            q.record_credit_card_token(con, member_id, r['registrationId'])
            returnValue((True, conf.get("url", "auth")))
        self.publish(u'com.payments.update_history', member_id)
        returnValue((False, conf.get("url", "auth")))

    def get_payment_history(self, no):
        memb_data = q.get_member_data(con, no)
        # XXX add keys
        credit_card_token = memb_data['credit_card_token']
        member_type = memb_data['member_type']
        subscr_end_timestamp = memb_data['subscription_ends']
        return {'payment_history': q.get_payment_history(con, no),
                'credit_card_token': credit_card_token,
                'subscription_ends': subscr_end_timestamp,
                'member_type': member_type}

    @inlineCallbacks
    def get_payment_form(self, path):
        print("PAYMENT_FORM", path)
        d = dict([x.split("=") for x in path.split("&")])
        no = d['id']
        id = q.get_last_payment_id(con, no)
        conf = get_config()
        url = conf.get('payment', 'base') + "/v1/paymentWidgets.js?checkoutId=" + id
        r = yield treq.get(url)
        r = yield r.text("utf-8")
        returnValue(str(r))

    def update_data(self, user_id):
        self.publish(u'com.members.update_data_broadcast', [user_id])

    def get_stats(self):
        return q.get_stats(con)

    def save_notes(self, member_id, notes):
        q.save_notes(con, member_id, notes)

    def get_form(self, no):
        return q.get_form(con, no)

    def pause_membership(self, no):
        return q.pause_membership(con, no)

    def unpause_membership(self, no):
        return q.unpause_membership(con, no)

    def check_one_month(self, no):
        return q.check_one_month(con, no)

    def pause_change(self, no, from_timestamp, to_timestamp):
        return q.pause_change(con, no, from_timestamp, to_timestamp)

    def get_prices(self):
        conf = get_config()
        d = {}
        for k in ['regular', 'youth', 'before4', 'yoga', 'couple']:
            d[k] = conf.get('price', k)
        return d

    def get_voucher(self, no):
        print(no)
        r = list(con.execute(select([vouchers.c.unique_id, vouchers.c.fullname, vouchers.c.reason,
            vouchers.c.extra]).where(and_(vouchers.c.unique_id == no, vouchers.c.used == False))))
        print(r)
        if len(r) == 0:
            return "Cannot find voucher"
        _, fullname, reason, extra = r[0]
        return "Name: " + fullname + " , for: " + reason + " , extra info: " + extra

    @inlineCallbacks
    def onJoin(self, details):
        # SUBSCRIBE to a topic and receive events
        #
        #def onhello(msg):
        #    self.log.info("event for 'onhello' received: {msg}", msg=msg)

        #yield self.subscribe(onhello, 'com.example.onhello')
        #self.log.info("subscribed to topic 'onhello'")

        # REGISTER a procedure for remote calling
        #
        #def procedure(arg):
        #    self.log.info("add2() called with {x} and {y}", x=x, y=y)
        #    return x + y

        self.readers_last_seen = [0]
        yield self.register(self.list_members, u'com.members.list')
        yield self.register(self.add_token, u'com.tokens.add')
        yield self.register(self.register_token, u'com.members.register_token')
        yield self.register(self.list_entries, u'com.members.list_entries')
        yield self.register(self.reader_visible, u'com.members.reader_visible')
        yield self.register(self.change_date, u'com.members.change_date')
        yield self.register(self.update_data, u'com.members.update_data')
        yield self.register(self.save_notes, u'com.members.save_notes')
        yield self.register(self.add_till, u'com.subscription.add_till')
        yield self.register(self.daypass_change, u'com.daypass.change')
        yield self.register(self.member_visit_change, u'com.visit.change')
        yield self.register(self.league_register, u'com.league.change')
        yield self.register(self.get_member_data, u'com.members.get')
        yield self.register(self.list_indemnity_forms, u'com.forms.list')
        yield self.register(self.get_last_unassigned, u'com.tokens.get_last_unassigned')
        yield self.register(self.add_one_month, u'com.subscription.add_one_month')
        yield self.register(self.add_one_month_from_now, u'com.subscription.add_one_month_from_now')
        yield self.register(self.remove_subscription, u'com.subscription.remove')
        yield self.register(self.subscription_change_end, u'com.subscription.change_expiry_date')
        yield self.register(self.get_payment_form, u'com.payments.get_form')
        yield self.register(self.payment_check_status, u'com.payments.check_status')
        yield self.register(self.change_membership_type, u'com.members.change_membership_type')
        yield self.register(self.change_subscription_type, u'com.members.change_subscription_type')
        yield self.register(self.notify_transaction, u'com.payments.notify_transaction')
        yield self.register(self.get_payment_history, u'com.payments.get_history')
        yield self.register(self.get_stats, u'com.stats.get')
        yield self.register(self.get_form, u'com.forms.get')
        yield self.register(self.get_prices, u'com.stats.get_prices')
        yield self.register(self.pause_membership, u'com.members.pause')
        yield self.register(self.unpause_membership, u'com.members.unpause')
        yield self.register(self.pause_change, u'com.members.pause_change')
        yield self.register(self.check_one_month, u'com.subscription.check_one_month')
        yield self.register(self.get_voucher, u'com.voucher.get')

        #self.log.info("procedure add2() registered")

        # PUBLISH and CALL every second .. forever
        #
        #counter = 0
        #while True:

            # PUBLISH an event
            #
            #yield self.publish('com.example.oncounter', counter)
            #self.log.info("published to 'oncounter' with counter {counter}",
            #              counter=counter)
        #    counter += 1

            # CALL a remote procedure
            #
            #try:
            #    res = yield self.call('com.example.mul2', counter, 3)
            #    self.log.info("mul2() called with result: {result}",
            #                  result=res)
            #except ApplicationError as e:
            #    # ignore errors due to the frontend not yet having
            #    # registered the procedure we would like to call
            #    if e.error != 'wamp.error.no_such_procedure':
            #        raise e

        #    yield sleep(1)
