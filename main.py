import os, time, re

import treq, urllib
from twisted.internet.defer import inlineCallbacks, returnValue
from twisted.logger import Logger
from twisted.internet import reactor

from sqlalchemy import create_engine, select, outerjoin

from autobahn.twisted.util import sleep
from autobahn.twisted.wamp import ApplicationSession
from autobahn.wamp.exception import ApplicationError
from authsys_common.model import meta, members, entries, tokens
from authsys_common import queries as q
from authsys_common.scripts import get_db_url, get_config

eng = create_engine(get_db_url())
con = eng.connect()
meta.reflect(bind=eng)

class AppSession(ApplicationSession):

    log = Logger()

    def list_members(self):
        return q.get_member_list(con)

    def get_member_data(self, no):
        return q.get_member_data(con, no)

    def add_one_month(self, type, no):
        return q.add_one_month_subscription(con, no, type)

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

    def add_token(self, member_id, token_id):
        con.execute(tokens.insert().values(member_id=member_id, id=token_id,
            valid=True, timestamp=int(time.time())))

    def register_token(self, token_id):
        con.execute(entries.insert().values(timestamp=int(time.time()), token_id=token_id))
        self.publish('com.members.entry')
        return q.is_valid_token(con, token_id, int(time.time()))

    def list_entries(self):
        t0 = time.time() - 24 * 3600
        return q.entries_after(con, t0)

    def reader_visible(self, no):
        self.readers_last_seen[no] = time.time()
        self.publish('com.members.healthcheck', self.readers_last_seen)

    def get_last_unassigned(self, tstamp):
        return q.unrecognized_entries_after(con, tstamp)[0]

    def daypass_change(self, no):
        q.daypass_change(con, no)

    @inlineCallbacks
    def notify_transaction(self, no, tp):
        yield self.payment_gateway_request(no, tp)

    @inlineCallbacks
    def payment_gateway_continue(self, res, no, tp, price, memb_type):
        r = yield res.json()
        print r
        q.payments_write_transaction(con, no, "initial", time.time(), r['id'],
            r['result']['code'], r['result']['description'], price, memb_type)
        self.publish('com.payments.notify_broadcast', no, price)
        self.publish('com.payments.update_history', no)

    def payment_gateway_request(self, no, tp):
        conf = get_config()
        if tp == "before4":
            price = conf.get("price", "before4")
        elif tp == "youth":
            price = conf.get("price", "youth")
        else:
            price = conf.get("price", "regular")
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
            'amount' : price + ".00",
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
        params = "&".join(["%s=%s" for (k, v) in [
         ('authentication.userId', conf.get('payment', 'userId')),
         ('authentication.password', conf.get('payment', 'password')),
         ('authentication.entityId', conf.get('payment', 'entityId')),
        ]])
        r = yield treq.get(url + "?" + params)
        r = yield r.json()
        member_id, sum, tp = q.payments_get_id_sum_tp(con, token_id)
        q.payments_write_transaction(con, member_id, "completed", time.time(),
            token_id, r['result']['code'], r['result']['description'], sum, tp)
        self.publish('com.payments.update_history', member_id)
        if re.search("^(000\.000\.|000\.100\.1|000\.[36])", r['result']['code']):
            q.add_one_month_subscription(con, member_id, tp, t0=time.time())
            q.record_credit_card_token(con, member_id, token_id)
            returnValue((True, conf.get("url", "auth")))
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
        print "PAYMENT_FORM", path
        d = dict([x.split("=") for x in path.split("&")])
        no = d['id']
        id = q.get_last_payment_id(con, no)
        conf = get_config()
        url = conf.get('payment', 'base') + "/v1/paymentWidgets.js?checkoutId=" + id
        r = yield treq.get(url)
        r = yield r.text("utf-8")
        returnValue(str(r))

    def get_stats(self):
        return q.get_stats(con)

    def get_form(self, no):
        return q.get_form(con, no)

    def pause_from_to(self, no, from_timestamp, to_timestamp):
        xxx

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
        yield self.register(self.list_members, 'com.members.list')
        yield self.register(self.add_token, 'com.tokens.add')
        yield self.register(self.register_token, 'com.members.register_token')
        yield self.register(self.list_entries, 'com.members.list_entries')
        yield self.register(self.reader_visible, 'com.members.reader_visible')
        yield self.register(self.change_date, 'com.members.change_date')
        yield self.register(self.add_till, 'com.subscription.add_till')
        yield self.register(self.daypass_change, 'com.daypass.change')
        yield self.register(self.get_member_data, 'com.members.get')
        yield self.register(self.list_indemnity_forms, 'com.forms.list')
        yield self.register(self.get_last_unassigned, 'com.tokens.get_last_unassigned')
        yield self.register(self.add_one_month, 'com.subscription.add_one_month')
        yield self.register(self.remove_subscription, 'com.subscription.remove')
        yield self.register(self.get_payment_form, 'com.payments.get_form')
        yield self.register(self.payment_check_status, 'com.payments.check_status')
        yield self.register(self.change_membership_type, 'com.members.change_membership_type')
        yield self.register(self.notify_transaction, 'com.payments.notify_transaction')
        yield self.register(self.get_payment_history, 'com.payments.get_history')
        yield self.register(self.pause_from_to, 'com.subscription.pause')
        yield self.register(self.get_stats, 'com.stats.get')
        yield self.register(self.get_form, 'com.forms.get')
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
