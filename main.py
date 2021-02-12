
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

from sqlalchemy import create_engine, select, outerjoin, and_

from autobahn.twisted.util import sleep
from autobahn.wamp import auth
from autobahn.twisted.wamp import ApplicationSession
from autobahn.wamp.exception import ApplicationError
from authsys_common.model import meta, members, entries, tokens, vouchers, covid_indemnity, transactions, failed_checks
from authsys_common import queries as q
from authsys_common.scripts import get_db_url, get_config
from authsys_common.mandate import create_mandate

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

        r = con.execute(vouchers.insert().values(fullname=request.args['name'][0].decode('utf8'),
            reason=request.args['reason'][0].decode('utf8'), extra=request.args['extra'][0].decode('utf8'),
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

    def list_members(self, query):
        return q.get_member_list(con, query)

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

    def list_indemnity_forms(self, query):
        return q.list_indemnity_forms(con, query)

    def change_membership_type(self, no, tp):
        q.change_membership_type(con, no, tp)

    def change_subscription_type(self, no, tp):
        q.change_subscription_type(con, no, tp)

    def subscription_change_end(self, no, end_timestamp):
        q.change_subscription_ends(con, no, end_timestamp)

    def add_token(self, member_id, token_id):
        con.execute(tokens.insert().values(member_id=member_id, id=token_id,
            valid=True, timestamp=int(time.time())))

    def register_token(self, token_id, gym_id):
        con.execute(entries.insert().values(timestamp=int(time.time()), token_id=token_id,
                                            gym_id=gym_id))
        self.publish(u'com.members.entry')
        return q.is_valid_token(con, token_id, int(time.time()), gym_id)

    def list_entries(self, gym_id):
        t0 = time.time() - 24 * 3600
        return q.entries_after(con, t0, int(gym_id))

    def reader_visible(self, no):
        self.readers_last_seen[no] = time.time()
        self.publish(u'com.members.healthcheck', self.readers_last_seen)

    def get_last_unassigned(self, tstamp, gym_id):
        return q.unrecognized_entries_after(con, tstamp, int(gym_id))[0]

    def daypass_change(self, no, gym_id):
        q.daypass_change(con, no, gym_id)

    def freepass_change(self, no, gym_id):
        q.freepass_change(con, no, gym_id)

    def member_visit_change(self, no, gym_id):
        q.member_visit_change(con, no, gym_id)

    def league_register(self, no):
        q.league_register(con, no)

    def notify_transaction(self, no, tp):
        import signup
        signup.current_request_data.notify(no, tp)

    def get_payment_history(self, no):
        memb_data = q.get_member_data(con, no)
        member_type = memb_data['member_type']
        subscr_end_timestamp = memb_data['subscription_ends']
        return {'payment_history': q.get_payment_history(con, no),
                'subscription_ends': subscr_end_timestamp,
                'member_type': member_type}

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
        r = list(con.execute(select([vouchers.c.unique_id, vouchers.c.fullname, vouchers.c.reason,
            vouchers.c.extra]).where(and_(vouchers.c.unique_id == no, vouchers.c.used == False))))
        if len(r) == 0:
            return "Cannot find voucher"
        _, fullname, reason, extra = r[0]
        return "Name: " + fullname + " for: " + reason + " extra info: " + extra

    def invalidate_voucher(self, no):
        con.execute(vouchers.update().where(vouchers.c.unique_id == no).values(used = True))

    def toggle_bank_mandate(self, no):
        l = list(con.execute(select([members.c.debit_order_signup_timestamp]).where(members.c.id == no)))
        if l[0][0]:
            val = 0
            tp = 'mandate'
            description = 'unsign mandate'
        else:
            val = int(time.time())
            tp = 'mandate'
            description = 'sign mandate'
        con.execute(transactions.insert().values({
            'member_id': no,
            'timestamp': int(time.time()),
            'price': 0,
            'type': tp,
            'description': description,
            'outcome': 'ok'
            }))
        con.execute(members.update().values(debit_order_signup_timestamp=val).where(
            members.c.id == no))
        return {'success': True}

    def covid_indemnity_sign(self, member_id, sign):
        if sign:
            con.execute(covid_indemnity.insert({'timestamp': int(time.time()),
                'member_id': member_id}))
        else:
            con.execute(covid_indemnity.delete().where(covid_indemnity.c.member_id == member_id))
        return {'success': True}

    def transaction_start(self, no):
        con.execute(transactions.insert().values({
            'member_id': no,
            'timestamp': int(time.time()),
            'price': 0,
            'type': "capture",
            'description': "Capture bank data",
            'outcome': 'pending'
        }))
        return {'success': True}

    def check_id(self, no, success):
        if success:
            con.execute(members.update().values(last_id_checked=int(time.time())).where(members.c.id == no))
        else:
            con.execute(failed_checks.insert().values(member_id=no, timestamp=int(time.time())))
        return {'success': True}

    def onConnect(self):
        self.join(self.config.realm, [u"wampcra"], u"frontdesk")

    def onChallenge(self, challenge):
        if challenge.method != u'wampcra':
            raise Exception("invalid auth method " + challenge.method)
        if u'salt' in challenge.extra:
            raise Exception("salt unimplemented")
        return auth.compute_wcs(get_config().get('auth', 'secret'),
                                challenge.extra['challenge'])

    def notify(self):
        self.publish(u'com.transaction.notify')

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

        self.readers_last_seen = [0, 0]
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
        yield self.register(self.freepass_change, u'com.freepass.change')
        yield self.register(self.member_visit_change, u'com.visit.change')
        yield self.register(self.league_register, u'com.league.change')
        yield self.register(self.get_member_data, u'com.members.get')
        yield self.register(self.list_indemnity_forms, u'com.forms.list')
        yield self.register(self.get_last_unassigned, u'com.tokens.get_last_unassigned')
        yield self.register(self.add_one_month, u'com.subscription.add_one_month')
        yield self.register(self.add_one_month_from_now, u'com.subscription.add_one_month_from_now')
        yield self.register(self.remove_subscription, u'com.subscription.remove')
        yield self.register(self.subscription_change_end, u'com.subscription.change_expiry_date')
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
        yield self.register(self.get_voucher, u'com.vouchers.get')
        yield self.register(self.invalidate_voucher, u'com.vouchers.invalidate')
        yield self.register(self.covid_indemnity_sign, u'com.covid_indemnity.sign')
        yield self.register(self.transaction_start, u'com.transaction.start')
        yield self.register(self.toggle_bank_mandate, u'com.mandate.toggle')
        yield self.register(self.notify, u'com.notify')
        yield self.register(self.check_id, u'com.members.id_check')

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
