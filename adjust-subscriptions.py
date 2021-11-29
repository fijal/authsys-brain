""" Adjust the existing subscriptions to cover debit order charges. Argument is the month for which we need to populate the fields
Usage:

adjust-subscriptions year month [--run]
"""

import sys, time
from pprint import pprint
from datetime import datetime

from sqlalchemy import select, create_engine, and_
from authsys_common.model import members, subscriptions, pending_transactions
from authsys_common.scripts import get_config, get_db_url
from authsys_common.queries import day_start_end, add_month
from debit_orders import _tstamp

if len(sys.argv) not in (3, 4):
    print(__doc__)
    sys.exit(1)
dry_run = True
if len(sys.argv) == 4:
    if sys.argv[3] != '--run':
        print(__doc__)
        sys.exit(1)
    dry_run = False

year = int(sys.argv[1])
month = int(sys.argv[2])

conf = get_config()
eng = create_engine(get_db_url())
con = eng.connect()

action_date = datetime(year, month, 1, 0, 0)
day_start = _tstamp(action_date)
day_end = _tstamp(action_date.replace(hour=23, minute=59, second=59))

for member_id, name, sub_type, charge_day in list(con.execute(select([members.c.id, members.c.name, members.c.subscription_type,
                                                             members.c.debit_order_charge_day]).where(
    members.c.member_type == 'recurring'))):
    pending = list(con.execute(select([pending_transactions.c.id]).where(
        and_(pending_transactions.c.member_id == member_id, pending_transactions.c.timestamp > day_start))))
    if len(pending) > 0:
        print("Skipping %s, pending charges" % name)
        continue
    subs = list(con.execute(select([subscriptions.c.start_timestamp, subscriptions.c.end_timestamp]).where(
        and_(subscriptions.c.member_id == member_id,
             and_(subscriptions.c.end_timestamp < day_end + 59*60,
                  subscriptions.c.end_timestamp >= day_start)))))
    if len(subs) != 1:
        print("Skipping %s, no subs or extras" % name)
        continue
    extra_subs = list(con.execute(select([subscriptions.c.end_timestamp]).where(
        and_(subscriptions.c.end_timestamp > day_end + 59*60, subscriptions.c.member_id == member_id))))
    if len(extra_subs) > 0:
        print("Skipping %s, more subscriptions" % name)
        continue

    start_timestamp = subs[0][1]
    end_timestamp = _tstamp(add_month(action_date).replace(day=1, hour=23, second=0, minute=0) )
    print("Adding subscription from %s to %s for %s" % (datetime.fromtimestamp(start_timestamp),
        datetime.fromtimestamp(end_timestamp), name))
    if not dry_run:
        con.execute(subscriptions.insert().values({
            'member_id': member_id,
            'type': sub_type,
            'start_timestamp': start_timestamp,
            'end_timestamp': end_timestamp,
            'renewal_id': 0
            }))
    price = conf.get('price', sub_type)
    charge_day = action_date.replace(day=charge_day, hour=1, minute=0, second=0)
    #if charge_day.date() == action_date.date():
    #    continue
    print("Adding charge of %s for %s on %s" % (price, name, charge_day))
    if not dry_run:
        con.execute(pending_transactions.insert().values({
            'member_id': member_id,
            'timestamp': _tstamp(charge_day),
            'creation_timestamp': int(time.time()),
            'price': price,
            'type': sub_type,
            'description': 'monthly charge',
            }))
