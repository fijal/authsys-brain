#!/usr/bin/env python
""" A script to update members, run from cron
"""

import treq
from twisted.internet import reactor
from twisted.internet.defer import inlineCallbacks
from sqlalchemy import create_engine

from authsys_common.payments import recurring_payment
from authsys_common.scripts import get_db_url
from authsys_common import queries as q

eng = create_engine(get_db_url())
con = eng.connect()

members_to_update = q.members_to_update(con)

@inlineCallbacks
def payment_check(res, tp):
    r = yield res.json()
    print r

def schedule(iter):
    try:
        n = iter.next()
    except StopIteration:
        return
    print n
    recurring_payment(con, n[1][1], n[0], n[1][2], payment_check)
    #reactor.callLater(0, schedule, iter)

reactor.callLater(0, schedule, members_to_update.iteritems())
reactor.run()
