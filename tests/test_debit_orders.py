
from datetime import datetime, timedelta
from sqlalchemy import select

import py
from debit_orders import DebitOrderError, add_two_days, list_pending_transactions, _tstamp
from authsys_common.model import meta, pending_transactions, members
from authsys_common.scripts import create_db

def populate_test_data():
    eng = create_db('sqlite:///:memory:')
    meta.reflect(bind=eng)
    con = eng.connect()
    con.execute(members.insert().values({
        'id': 0, 'name': 'Foo Bar', 'id_number': '1234', 'email': 'email',
        'account_holder_name': 'Foo Bar',
        'spam_consent': False, 'phone': 'phone', 'emergency_phone': 'phone',
        'show_up_reason': 'unknown'}))
    con.execute(members.insert().values({
        'id': 1, 'name': 'Bar Baz', 'account_holder_name': 'Bar Baz Dad', 'id_number': '4321', 'email': 'email',
        'spam_consent': False, 'phone': 'phone', 'emergency_phone': 'phone',
        'show_up_reason': 'unknown'}))
    return con

def test_two_days():
    py.test.raises(DebitOrderError, add_two_days, datetime(2023, 1, 1))
    assert add_two_days(datetime(2021, 5, 12)) == datetime(2021, 5, 14)
    assert add_two_days(datetime(2021, 5, 13)) == datetime(2021, 5, 17)
    assert add_two_days(datetime(2021, 5, 13, 14, 00)) == datetime(2021, 5, 18)
    assert add_two_days(datetime(2021, 9, 22)) == datetime(2021, 9, 27)
    assert add_two_days(datetime(2021, 12, 23)) == datetime(2021, 12, 28)
    assert add_two_days(datetime(2021, 12, 23, 14)) == datetime(2021, 12, 29)
    assert add_two_days(datetime(2021, 12, 24)) == datetime(2021, 12, 29)
    assert add_two_days(datetime(2021, 12, 24, 14)) == datetime(2021, 12, 30)
    assert add_two_days(datetime(2021, 12, 25)) == datetime(2021, 12, 29)
    assert add_two_days(datetime(2021, 12, 25, 14)) == datetime(2021, 12, 30)
    assert add_two_days(datetime(2021, 12, 26)) == datetime(2021, 12, 29)
    assert add_two_days(datetime(2021, 12, 26, 14)) == datetime(2021, 12, 30)

def test_list_pending_transactions():
    con = populate_test_data()
    t0 = datetime(2021, 5, 5) # Wed
    assert list_pending_transactions(con, now=t0) == []

    def _add_pending(items):
        for member_id, t in items:
            con.execute(pending_transactions.insert().values(
                {'member_id': member_id, 'timestamp': _tstamp(t)}))

    _add_pending([(0, t0), (1, t0 + timedelta(days=1))])

    assert [x['account_holder_name'] for x in list_pending_transactions(con, now=t0)] == ['Foo Bar', 'Bar Baz Dad']
    con.execute(pending_transactions.delete())

    t0 = datetime(2021, 5, 3) # Mon
    t1 = datetime(2021, 5, 5)
    _add_pending([(0, t1), (1, t1 + timedelta(days=1))])
    assert [x['account_holder_name'] for x in list_pending_transactions(con, now=t0)] == ['Foo Bar']
    con.execute(pending_transactions.delete())

    t0 = datetime(2021, 5, 7) # Fri
    t1 = datetime(2021, 5, 10)
    _add_pending([(0, t1), (1, t1 + timedelta(days=1))])

    assert [x['account_holder_name'] for x in list_pending_transactions(con, now=t0)] == ['Foo Bar', 'Bar Baz Dad']

    con.execute(pending_transactions.delete())
