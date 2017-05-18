#!/usr/bin/env python
""" A script to update members, run from cron
"""

import treq, re, time, sys
from twisted.internet import reactor
from twisted.internet.defer import inlineCallbacks
from twisted.python import log
from sqlalchemy import create_engine

from authsys_common.payments import recurring_payment
from authsys_common.scripts import get_db_url
from authsys_common import queries as q

eng = create_engine(get_db_url())
con = eng.connect()

log.startLogging(sys.stderr)

members_to_update = q.members_to_update(con)

counter = 1

if len(sys.argv) > 1 and sys.argv[1] == '--dry':
    dry_run = True
elif len(sys.argv)> 1:
    print "Unknown arguments"
    sys.exit(1)
else:
    dry_run = False

@inlineCallbacks
def payment_check(res, member_id, tp, sum):
    global counter
    if not dry_run:
        r = yield res.json()
        print r
        q.payments_write_transaction(con, member_id, "completed", time.time(),
                r['id'], r['result']['code'], r['result']['description'], sum, tp)

        if re.search("^(000\.000\.|000\.100\.1|000\.[36])", r['result']['code']):
            q.add_one_month_subscription(con, member_id, tp)
        else:
            q.remove_credit_card_token(con, member_id)
    counter -= 1
    if counter == 0:
        reactor.stop()

def schedule(iter):
    global counter
    try:
        n = iter.next()
        print "NEXT:", n
    except StopIteration:
        counter -= 1
        if counter == 0:
            reactor.stop()
        return
    counter += 1
    recurring_payment(con, n[1][1], n[0], n[1][2], payment_check, dry_run=dry_run)
    reactor.callLater(5, schedule, iter)

reactor.callLater(0, schedule, members_to_update.iteritems())
reactor.run()
