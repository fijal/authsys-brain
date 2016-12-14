import os, time

from twisted.internet.defer import inlineCallbacks
from twisted.logger import Logger

from sqlalchemy import create_engine, select, outerjoin

from autobahn.twisted.util import sleep
from autobahn.twisted.wamp import ApplicationSession
from autobahn.wamp.exception import ApplicationError
from authsys_common.model import meta, members, entries, tokens
from authsys_common import queries as q
from authsys_common.scripts import get_db_url

eng = create_engine(get_db_url())
con = eng.connect()
meta.reflect(bind=eng)

class AppSession(ApplicationSession):

    log = Logger()

    def list_members(self):
        return q.get_member_list(con)

    def list_indemnity_forms(self):
        return q.list_indemnity_forms(con)

    def get_form(self, no):
        return q.get_form(con, no)

    def add_token(self, member_id, token_id):
        con.execute(tokens.insert().values(member_id=member_id, id=token_id,
            valid=True, timestamp=int(time.time())))

    def register_token(self, token_id):
        con.execute(entries.insert().values(timestamp=int(time.time()), token_id=token_id))
        self.publish('com.members.entry')

    def list_entries(self):
        t0 = time.time() - 24 * 3600
        return [(a, b, time.ctime(c)) for a, b, c in q.entries_after(con, t0)]

    def reader_visible(self, no):
        self.readers_last_seen[no] = time.time()
        self.publish('com.members.healthcheck', self.readers_last_seen)

    def get_last_unassigned(self, tstamp):
        return q.unrecognized_entries_after(con, tstamp)[0];

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
        yield self.register(self.list_indemnity_forms, 'com.forms.list')
        yield self.register(self.get_form, 'com.forms.get')
        yield self.register(self.get_last_unassigned, 'com.tokens.get_last_unassigned')
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
