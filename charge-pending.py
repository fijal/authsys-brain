
""" Usage:
AUTHSYS_INI=path-to-ini charge-pending.py [month day]
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
#twoday = datetime.datetime.now() + datetime.timedelta(days=2)
twoday = datetime.datetime(2021, 5, 7)

def t(d):
    return time.mktime(d.timetuple())

lst = [{'pend_id': x, 'member_id': y, 'account_holder_name': a, 'account_number': b, 'branch_code': c, 'price': d}
       for x, y, a, b, c, d in con.execute(select(
    [pending_transactions.c.id, members.c.id, members.c.account_holder_name, members.c.account_number, members.c.branch_code,
    pending_transactions.c.price]).where(
    and_(and_(pending_transactions.c.timestamp >= t(now.replace(hour=0, minute=0, second=0)),
         pending_transactions.c.timestamp < t(now.replace(hour=23, minute=0, second=0))),
         members.c.id == pending_transactions.c.member_id)))]

for i, (_, member_id, _, _, _, _) in enumerate(lst):
    # sanity check of subscriptions
    subs = list(con.execute(select([subscriptions.c.id, subscriptions.c.start_timestamp, subscriptions.c.end_timestamp]).where(
        subscriptions.c.member_id == member_id)))
    for sub in subs:
        _, start_timestamp, end_timestamp = sub

@inlineCallbacks
def f(resp):
    r = yield resp.json()
    if 'error' in r:
        print(r)
        reactor.stop()
        return
    for pend_id, member_id, _, _, _, price in lst:
        con.execute(pending_transactions.delete().where(pending_transactions.c.id == pend_id))
        con.execute(transactions.insert().values(
            timestamp = int(time.time()),
            member_id = member_id,
            price = price,
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

d = []
for i, (_, _, name, number, branch_code, price) in enumerate(lst):
    d.append({
        'account_holder': name,
        'account_number': number,
        'branch_code': branch_code,
        'reference': 'TST%s' % i,
        'amount_in_cent': str(int(price * 100))
        })

#form_data = multipart_formdata([[param(u"name", u'file_data'),
#                body(unicode(s.getvalue()))]])
d = treq.post(BASE_URL + 'batch/eft/json', headers={'Accept': 'application/json'},
             auth=(USERNAME, PASSWORD), json=d, params={
             'service_type': 'twoday',
             'action_date': twoday.strftime('%Y-%m-%d'),
             'skip_cdv_check': False,
             'skip_checksum': False,
             'submit_to_bank': True
             })
d.addCallback(f)
d.addErrback(err)
reactor.run()
