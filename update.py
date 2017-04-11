from authsys_common.model import members, subscriptions, meta, tokens
from authsys_common.scripts import get_db_url, get_config
from sqlalchemy import create_engine, select, outerjoin, and_
from pprint import pprint

eng = create_engine(get_db_url())
con = eng.connect()
meta.reflect(bind=eng)

lst = list(con.execute(select([members, tokens]).where(
and_(tokens.c.valid, members.c.id == tokens.c.member_id))))
for item in lst:
    con.execute(members.update().where(members.c.id == item[0]).values(member_type='ondemand'))
