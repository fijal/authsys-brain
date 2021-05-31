
""" Usage:
AUTHSYS_INI=path-to-ini charge-pending.py [--run] [month day]
"""

import sys, datetime, time, base64
from uuid import uuid4
import csv
from StringIO import StringIO
import treq
from sqlalchemy import create_engine, select, and_
from twisted.internet import reactor
from twisted.python import log
from twisted.internet.defer import inlineCallbacks

from authsys_common.model import pending_transactions, members, transactions, subscriptions
from authsys_common.scripts import get_config, get_db_url
from debit_orders import add_two_days, list_pending_transactions, convert_to_charge

dry_run = True
if sys.argv[1] == '--run':
    del sys.argv[1]
    dry_run = False
if len(sys.argv) not in (1, 3):
    print(__doc__)
    sys.exit(1)

log.startLogging(sys.stderr, setStdout=0)
conf = get_config()

BASE_URL = conf.get('payment', 'direct_url')
PASSWORD = conf.get('payment', 'direct_password')
USERNAME = conf.get('payment', 'direct_user')

eng = create_engine(get_db_url())
con = eng.connect()

if len(sys.argv) == 1:
    now = datetime.datetime.now()
else:
    now = datetime.datetime(datetime.datetime.now().year, int(sys.argv[1]), int(sys.argv[2]))

@inlineCallbacks
def f(resp):
    r = yield resp.json()
    if 'error' in r:
        print(r)
        reactor.stop()
        return
    for item in pending_charges:
        con.execute(pending_transactions.delete().where(pending_transactions.c.id == item['pend_id']))
        con.execute(transactions.insert().values(
            timestamp = int(time.time()),
            member_id = item['member_id'],
            price = item['price'],
            type = 'recurring charge',
            description = '',
            outcome = 'submitted'
            ))

    # update the subscription validity
    print(r)
    reactor.stop()

def err(*args):
    print(args)
    reactor.stop()

twoday = add_two_days(now)
pending_charges = list_pending_transactions(con)
inp = convert_to_charge(pending_charges)
from pprint import pprint
pprint(pending_charges)
# sanity check that we don't double charge the same person
d = {}
for item in pending_charges:
    if item['member_id'] in d:
        epxlode
    item['member_id'] = None
if dry_run:
    sys.exit(0)
d = treq.post(BASE_URL + 'batch/eft/json', headers={'Accept': 'application/json'},
             auth=(USERNAME, PASSWORD), json=inp, params={
             'service_type': 'twoday',
             'action_date': twoday.strftime('%Y-%m-%d'),
             'skip_cdv_check': False,
             'skip_checksum': False,
             'submit_to_bank': True
             })
d.addCallback(f)
d.addErrback(err)
reactor.run()
