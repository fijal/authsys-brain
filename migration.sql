
#CREATE TABLE transactions (
#        id INTEGER NOT NULL, 
#        timestamp INTEGER, 
#        member_id INTEGER, 
#        price INTEGER, 
#        type VARCHAR, 
#        description VARCHAR, 
#        outcome VARCHAR, 
#        PRIMARY KEY (id)
#);

#alter table members add address varchar;
#alter table members add branch_code varchar;
#alter table members add account_number varchar;
#alter table members add debit_order_signup_timestamp integer;

#alter table entries add gym_id integer;
#alter table daily_passes add gym_id integer;
#alter table free_passes add gym_id integer;

#alter table members add last_id_update integer;
#alter table members add last_id_checked integer;
#alter table members add id_photo varchar;

#CREATE TABLE failed_checks (
#    id INTEGER NOT NULL, 
#    member_id INTEGER, 
#    timestamp INTEGER, 
#    PRIMARY KEY (id), 
#    FOREIGN KEY(member_id) REFERENCES members (id)
#);

#alter table members add debit_order_charge_day integer;

#CREATE TABLE pending_transactions (
#    id INTEGER NOT NULL, 
#    member_id INTEGER, 
#    timestamp INTEGER, 
#    creation_timestamp INTEGER, 
#    price INTEGER, 
#    type VARCHAR, 
#    description VARCHAR, 
#    PRIMARY KEY (id), 
#    FOREIGN KEY(member_id) REFERENCES members (id)
#);

alter table members add debit_order_first_charge integer;
