
import time
from datetime import timedelta, datetime
from sqlalchemy import select, and_

from authsys_common.model import pending_transactions, members


PUBLIC_HOLIDAY = [
    (2021, 1, 1),
    (2021, 3, 22),
    (2021, 4, 2),
    (2021, 4, 5),
    (2021, 4, 27),
    (2021, 5, 1),
    (2021, 6, 16),
    (2021, 8, 9),
    (2021, 9, 24),
    (2021, 12, 16),
    (2021, 12, 25),
    (2021, 12, 27),    
]

_PUBLIC_HOLIDAY = PUBLIC_HOLIDAY
PUBLIC_HOLIDAY = set()
for _year, _month, _day in _PUBLIC_HOLIDAY:
    PUBLIC_HOLIDAY.add(datetime(_year, _month, _day))

class DebitOrderError(Exception):
    pass

def add_two_days(now=None):
    """ calculate two days from `now` passed as daytime. If the time is after 12:00,
    one more day is added
    """
    def _add_business_day(when):
        t = (when + timedelta(days=1)).replace(hour=0, minute=0, second=0)
        while t.isoweekday() in (6, 7) or t in PUBLIC_HOLIDAY:
            t += timedelta(days=1)
        return t

    if now is None:
        now = datetime.now()
    if max(PUBLIC_HOLIDAY) < now:
        raise DebitOrderError("add more public holiday")
    if now.hour < 12:
        return _add_business_day(_add_business_day(now))
    return _add_business_day(_add_business_day(_add_business_day(now)))

def _tstamp(d):
    return time.mktime(d.timetuple())

def list_pending_transactions(con, now=None):
    if now is None:
        now = datetime.now()
    charge_day = add_two_days(now)
    XXX # write down check that people who are no longer with 'recurring' don't get charged
    return [{'pend_id': x, 'member_id': y, 'account_holder_name': a, 'account_number': b, 'branch_code': c, 'price': d,
             'charge_day': e, 'timestamp': datetime.fromtimestamp(f)}
       for x, y, a, b, c, d, e, f in con.execute(select(
        [pending_transactions.c.id, members.c.id, members.c.account_holder_name, members.c.account_number, members.c.branch_code,
        pending_transactions.c.price, members.c.debit_order_charge_day, pending_transactions.c.timestamp]).where(
        and_(pending_transactions.c.timestamp <= _tstamp(charge_day),
             members.c.id == pending_transactions.c.member_id)))]

def convert_to_charge(pending):
    r = []
    for item in pending:
        r.append({
            'account_holder': item['account_holder_name'],
            'account_number': item['account_number'],
            'branch_code': item['branch_code'],
            'reference': 'CHRG' + str(item['pend_id']),
            'amount_in_cent': str(int(item['price']) * 100)
            })
    return r
